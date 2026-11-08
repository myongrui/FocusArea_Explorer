"use strict";
// Integrity checks on the generated js/data.js so a bad `node tools/build-data.js`
// regeneration is caught in CI before it reaches the page.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../js/graph-core.js");

function load(){
  const src = fs.readFileSync(path.join(__dirname, "../js/data.js"), "utf8")
    .replace(/^var AREAS = /m, "scope.AREAS = ")
    .replace(/^var NODES = /m, "scope.NODES = ")
    .replace(/^var EDGES = /m, "scope.EDGES = ");
  const scope = {}; new Function("scope", src)(scope);
  return scope;
}
const CODE = /^[A-Z]{2,}\d{4}[A-Z]*$/;

test("every NODE has the expected shape",()=>{
  const {NODES} = load();
  assert.ok(Array.isArray(NODES) && NODES.length > 0);
  NODES.forEach(n => {
    assert.ok(CODE.test(n.id), n.id+" is not a valid module code");
    assert.equal(typeof n.t, "string");
    assert.ok(Array.isArray(n.a));
    assert.equal(typeof n.f, "boolean");
  });
});

test("every EDGE references existing nodes and has a boolean alt flag",()=>{
  const {NODES, EDGES} = load();
  const ids = new Set(NODES.map(n => n.id));
  assert.ok(Array.isArray(EDGES) && EDGES.length > 0);
  EDGES.forEach(e => {
    assert.equal(e.length, 3);
    assert.ok(ids.has(e[0]), "edge source "+e[0]+" is not a node");
    assert.ok(ids.has(e[1]), "edge target "+e[1]+" is not a node");
    assert.notEqual(e[0], e[1], "edge must not be a self-loop");
    assert.equal(typeof e[2], "boolean");
  });
});

test("every area primary resolves to a real node",()=>{
  const {AREAS, NODES} = load();
  const ids = new Set(NODES.map(n => n.id));
  AREAS.forEach(a => {
    assert.ok(Array.isArray(a.prim) && a.prim.length > 0, a.k+" has no primaries");
    a.prim.forEach(code => assert.ok(ids.has(code), a.k+" primary "+code+" is not a node"));
  });
});

test("every area record is well-formed with unique keys",()=>{
  const {AREAS} = load();
  const keys = new Set();
  AREAS.forEach(a => {
    assert.equal(typeof a.k, "string");
    assert.ok(a.k.length > 0, "empty area key");
    assert.equal(keys.has(a.k), false, "duplicate area key "+a.k);
    keys.add(a.k);
    assert.equal(typeof a.name, "string");
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(a.light), a.k+" light color malformed");
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(a.dark), a.k+" dark color malformed");
  });
});

test("the prerequisite graph is a DAG (no prerequisite cycles)",()=>{
  const {NODES, EDGES} = load();
  const adj = {}; NODES.forEach(n => (adj[n.id] = []));
  EDGES.forEach(e => adj[e[1]].push(e[0]));
  const color = {};
  let cycle = false;
  function dfs(n){
    color[n] = 1;
    (adj[n]||[]).forEach(c => {
      if(color[c] === 1) cycle = true;
      else if(!color[c]) dfs(c);
    });
    color[n] = 2;
  }
  Object.keys(adj).forEach(n => { if(!color[n]) dfs(n); });
  assert.equal(cycle, false, "prerequisite graph contains a cycle");
});

test("each focus area has at least one 4000-level primary",()=>{
  // planner.js counts a 4000-level primary for area fulfilment; guard that.
  const {AREAS} = load();
  AREAS.forEach(a => {
    const has4000 = a.prim.some(c => /^\d{4}$/.test((c.match(/(\d{4})/,c)||[])[0]));
    assert.ok(has4000, a.k+" needs a 4000-level primary for fulfilment to be reachable");
  });
});
