"use strict";
// Unit tests for the prerequisite-tree graph logic (js/graph-core.js),
// which app.js used to hold inline. Runs under plain Node — no DOM.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../js/graph-core.js");

// ---- a tiny hand-built DAG so assertions are deterministic -------------------
// Prerequisite direction is edge [prereq, target] (source is a prerequisite).
//
//   CS100(fnd) --\      /-- CS400 (shared algo+ai)
//   CS900(sup) -- CS200(algo)
//   MA100(sup) --/      (CS400's only prerequisite is CS200)
//   CS110(fnd) -- CS300(ai)
function synthetic(){
  const NODES = [
    {id:"CS100", t:"A", a:[], f:true},
    {id:"CS110", t:"B", a:[], f:true},
    {id:"CS200", t:"C", a:["algo"], f:false},
    {id:"CS300", t:"D", a:["ai"], f:false},
    {id:"CS400", t:"E", a:["algo","ai"], f:false},
    {id:"CS900", t:"CX", a:[], f:false},
    {id:"MA100", t:"MA", a:[], f:false},
  ];
  const EDGES = [
    ["CS100","CS200"],["CS110","CS300"],["CS200","CS400"],
    ["CS900","CS200"],["MA100","CS200"],
  ];
  return {NODES, EDGES};
}
function base(){
  const {NODES, EDGES} = synthetic();
  const nodeById = {}; NODES.forEach(n => (nodeById[n.id] = n));
  const areaByKey = {
    algo: {k:"algo", prim:["CS200","CS400"]},
    ai:   {k:"ai",   prim:["CS300","CS400"]},
  };
  const fnd = NODES.filter(n => n.f).map(n => n.id);
  const idx = G.buildIndexes(NODES.map(n => n.id), EDGES);
  return {nodeById, areaByKey, fnd, edges:EDGES, inadj:idx.inadj, outadj:idx.outadj,
          roleOf:(active,id)=>G.roleOf(nodeById, active, id)};
}
const idsOf = arr => new Set(arr);
const edgePairs = arr => arr.map(e => e[0] + "~" + e[1]).sort();

// ---- roleOf -----------------------------------------------------------------
test("roleOf classifies foundation, support, single-area, and shared modules",()=>{
  const b = base();
  assert.deepEqual(b.roleOf({}, "CS100"), {k:"fnd", areas:[]});
  assert.equal(b.roleOf({"algo":"x"}, "CS300").k, "support"); // ai node under algo-only selection
  assert.deepEqual(b.roleOf({"algo":"x"}, "CS200"), {k:"primary", areas:["algo"]});
  assert.deepEqual(b.roleOf({"algo":"x","ai":"x"}, "CS400"), {k:"shared", areas:["algo","ai"]});
});

// ---- computeVisible: empty selection returns just the foundation subgraph ---
test("empty selection yields only the foundation nodes and intra-foundation edges",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{}, planFocus:new Set(), planned:new Set(), csOnly:true});
  assert.deepEqual(idsOf(vis.ids), idsOf(["CS100","CS110"]));
  assert.equal(vis.edges.length, 0); // no edges sit between two foundation nodes
});

test("activating an area adds its primaries and their transitive prerequisites",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{"algo":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  assert.deepEqual(idsOf(vis.ids), idsOf(["CS100","CS110","CS200","CS400","CS900","MA100"]));
  // CS300 belongs to the inactive ai area, so it stays hidden.
  assert.equal(vis.ids.includes("CS300"), false);
  assert.deepEqual(new Set(edgePairs(vis.edges)), new Set(["CS100~CS200","CS200~CS400","CS900~CS200","MA100~CS200"]));
});

test("cs-only mode drops non-foundation, non-CS prerequisites",()=>{
  const b = base();
  const kept = G.computeVisible({...b, active:{"algo":"x"}, planFocus:new Set(), planned:new Set(), csOnly:true});
  const all = G.computeVisible({...b, active:{"algo":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  assert.equal(kept.ids.includes("MA100"), false); // MA = non-CS, dropped
  assert.equal(kept.ids.includes("CS900"), true);  // CX = CS, kept
  assert.equal(all.ids.includes("MA100"), true);   // non-cs-only: kept
});

test("two active areas pull in the shared primary and the union of prerequisites",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{"algo":"x","ai":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  assert.deepEqual(idsOf(vis.ids), idsOf(["CS100","CS110","CS200","CS300","CS400","CS900","MA100"]));
  assert.deepEqual(new Set(edgePairs(vis.edges)), new Set(["CS100~CS200","CS110~CS300","CS200~CS400","CS900~CS200","MA100~CS200"]));
});

test("planned focus modules are pulled in without activating any area",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{}, planFocus:new Set(["CS400"]), planned:new Set(), csOnly:false});
  assert.equal(vis.ids.includes("CS400"), true);
  assert.equal(vis.ids.includes("CS200"), true);  // prerequisite of CS400
});

// ---- layout: longest-path tiering -------------------------------------------
test("layout assigns modules to their longest-depth tier with no duplicates",()=>{
  const b = base();
  const {ids, edges} = G.computeVisible({...b, active:{"algo":"x","ai":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  const lay = G.layout(ids, edges, (id) => b.roleOf({"algo": "x", "ai": "x"}, id));
  assert.equal(lay.layer["CS100"], 0);
  assert.equal(lay.layer["CS200"], 1);
  assert.equal(lay.layer["CS300"], 1);
  assert.equal(lay.layer["CS400"], 2); // depends (transitively) on a tier-1 node
  const placed = lay.tiers.flat();
  assert.equal(placed.length, ids.length);
  assert.deepEqual(idsOf(placed), idsOf(ids));
  ids.forEach(id => assert.ok(lay.tiers[lay.layer[id]].includes(id), id+" in tier "+lay.layer[id]));
  assert.ok(lay.target["CS400"] && typeof lay.target["CS400"].x === "number");
});

test("layout output is deterministic across runs",()=>{
  const b = base();
  const {ids, edges} = G.computeVisible({...b, active:{"algo":"x","ai":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  const layoutKey = lay => lay.tiers.map(t => t.join(",")).join("|");
  const a = layoutKey(G.layout(ids, edges, (id) => b.roleOf({"algo": "x", "ai": "x"}, id)));
  const b2 = layoutKey(G.layout(ids, edges, (id) => b.roleOf({"algo": "x", "ai": "x"}, id)));
  assert.equal(a, b2);
});

// ---- highlightSet ------------------------------------------------------------
test("highlightSet returns null when nothing is focused",()=>{
  const b = base();
  assert.equal(G.highlightSet({focus:[], visIds:["CS100"], inadj:b.inadj, outadj:b.outadj}), null);
});

test("highlightSet traces a focus node's prerequisites",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{"algo":"x","ai":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  const set = G.highlightSet({focus:["CS300"], visIds:vis.ids, inadj:b.inadj, outadj:b.outadj});
  assert.deepEqual(idsOf(Object.keys(set)), idsOf(["CS110","CS300"]));
});

test("highlightSet of an internal node gathers prerequisites and the downstream subtree",()=>{
  const b = base();
  const vis = G.computeVisible({...b, active:{"algo":"x","ai":"x"}, planFocus:new Set(), planned:new Set(), csOnly:false});
  const set = G.highlightSet({focus:["CS200"], visIds:vis.ids, inadj:b.inadj, outadj:b.outadj});
  assert.deepEqual(idsOf(Object.keys(set)), idsOf(["CS100","CS200","CS400","CS900","MA100"]));
});

// ---- integration against the real generated data ----------------------------
function loadRealData(){
  const src = fs.readFileSync(path.join(__dirname, "../js/data.js"), "utf8")
    .replace(/^var AREAS = /m, "scope.AREAS = ")
    .replace(/^var NODES = /m, "scope.NODES = ")
    .replace(/^var EDGES = /m, "scope.EDGES = ");
  const scope = {}; new Function("scope", src)(scope);
  return scope;
}
test("real data: activating an area covers all its primaries plus prerequisites",()=>{
  const scope = loadRealData();
  const AREAS = scope.AREAS, NODES = scope.NODES, EDGES = scope.EDGES;
  const nodeById = {}; NODES.forEach(n => (nodeById[n.id] = n));
  const areaByKey = {}; AREAS.forEach(a => (areaByKey[a.k] = a));
  const fnd = NODES.filter(n => n.f).map(n => n.id);
  const idx = G.buildIndexes(NODES.map(n => n.id), EDGES);
  const algo = AREAS.find(a => a.k === "algo");
  const vis = G.computeVisible({active:{"algo":"x"}, areaByKey, nodeById, inadj:idx.inadj, edges:EDGES, fnd, planFocus:new Set(), planned:new Set(), csOnly:true});
  const idset = idsOf(vis.ids);
  algo.prim.forEach(code => assert(idset.has(code), "area primary "+code+" should be visible"));
  assert(idset.has("CS2040S"), "foundation prereq CS2040S should be visible under CS-only");
  assert.ok(vis.ids.length > algo.prim.length, "closure should extend beyond primaries");
});

test("real data: roleOf marks foundation modules as fnd and supports as support",()=>{
  const scope = loadRealData();
  const NODES = scope.NODES;
  const nodeById = {}; NODES.forEach(n => (nodeById[n.id] = n));
  assert.deepEqual(G.roleOf(nodeById, {}, "CS1101S"), {k:"fnd", areas:[]});
  assert.equal(G.roleOf(nodeById, {}, "MA1521").k, "fnd");
});
