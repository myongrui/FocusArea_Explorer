#!/usr/bin/env node
/**
 * Regenerates js/data.js from the NUSMods API v2.
 *
 *   node tools/build-data.js > js/data.js
 *
 * AREAS is curated here (official SoC focus list, changes rarely). NODES and
 * EDGES are derived: take every area primary, then follow the prerequisite
 * trees of *every* department transitively. Non-CS modules are drawn too
 * (MA1521, ST2334, EE2012, ...) because they are real requirements behind CS
 * modules.
 *
 * Edge `alt` is true when a code only ever appears inside an "or" / "nOf" group
 * (drawn dashed), false when it appears in an "and" chain (drawn solid).
 */
"use strict";

var AY = "2026-2027";
var API = "https://api.nusmods.com/v2/" + AY;

var AREAS = [
  {k:"algo",name:"Algorithms & Theory",light:"#2a78d6",dark:"#3f8ae8",prim:["CS3230","CS3231","CS3236","CS4231","CS4234","CS4330","CS4430"]},
  {k:"ai",name:"Artificial Intelligence",light:"#a23ba0",dark:"#bf5cbc",prim:["CS2109S","CS3243","CS3244","CS3263","CS3264","CS3268","CS4243","CS4244","CS4246","CS4248","CS4262","CS4263"]},
  {k:"pl",name:"Programming Languages",light:"#e5661f",dark:"#e06a2a",prim:["CS2104","CS3211","CS4212","CS4215"]},
  {k:"se",name:"Software Engineering",light:"#0e8a3c",dark:"#1fa54f",prim:["CS2103T","CS3213","CS3217","CS3219","CS3227","CS3282","CS4211","CS4218","CS4239"]},
  {k:"graphics",name:"Computer Graphics & Games",light:"#d1477f",dark:"#d55181",prim:["CS3241","CS3242","CS3247","CS4247","CS4350"]},
  {k:"security",name:"Computer Security",light:"#e0403f",dark:"#e34d4b",prim:["CS2107","CS3235","CS4236","CS4230","CS4238","CS4239"]},
  {k:"database",name:"Database Systems",light:"#0f9d7a",dark:"#0f9d7a",prim:["CS2102","CS3223","CS4221","CS4224","CS4225"]},
  {k:"hci",name:"Human-Computer Interaction",light:"#c98a00",dark:"#bd8100",prim:["CS2111","CS3240","CS3249","CS4249","CS4353"]},
  {k:"mir",name:"Multimedia Info Retrieval",light:"#1088c4",dark:"#2b8fc4",prim:["CS2108","CS3245","CS4242","CS4248","CS4347"]},
  {k:"network",name:"Networking & Distributed Sys",light:"#9c5a12",dark:"#b06f24",prim:["CS2105","CS3103","CS4222","CS4226","CS4231"]},
  {k:"parallel",name:"Parallel Computing",light:"#4b6ba8",dark:"#5f7fd0",prim:["CS3210","CS3211","CS4223","CS4231"]}
];

// The CS foundation / common core: drawn in the foundation style and shown on
// their own when no focus area is active. Seeded into the closure so a
// foundation module appears even when nothing in the graph requires it.
var FOUNDATION = ["CS1101S","CS1231S","CS2030S","CS2040S","CS2100","CS2106",
                  "MA1521","ST2334"];
var SKIP = {"CS4232":1,"CS3212":1};

// Hand-shortened labels kept from earlier hand-maintained data (158px wide
// nodes); anything not listed falls back to the NUSMods title.
var TITLES = {
  CS1231S:"Discrete Structures", CS2030S:"Programming Methodology II",
  CS2040S:"Data Structures & Algorithms", CS2100:"Computer Organisation",
  CS2103T:"Software Engineering", CS2104:"Prog. Language Concepts",
  CS2106:"Operating Systems", CS2107:"Information Security",
  CS2108:"Media Computing", CS2109S:"AI & Machine Learning",
  CS2111:"Human-Centred Computing", CS2220:"Computational Biology",
  CS3103:"Computer Networks Practice", CS3210:"Parallel Computing",
  CS3211:"Concurrent Programming", CS3213:"Software Requirements & Validation",
  CS3217:"SE on Modern App Platforms", CS3219:"Software Design & Architecture",
  CS3220:"Computer Architecture", CS3223:"Database Systems Implementation",
  CS3227:"Agentic Software Engineering", CS3230:"Design & Analysis of Algorithms",
  CS3231:"Theory of Computation", CS3235:"Computer Security",
  CS3236:"Information Theory", CS3240:"Interaction Design",
  CS3241:"Computer Graphics", CS3242:"3D Modelling & Animation",
  CS3243:"Artificial Intelligence", CS3244:"Machine Learning",
  CS3245:"Information Retrieval", CS3247:"Game Development",
  CS3249:"Conversational UI", CS3263:"Foundations of AI",
  CS3264:"Foundations of ML", CS3268:"Responsible AI",
  CS3281:"Evolving Production Systems I", CS3282:"Evolving Production Systems II",
  CS4211:"Formal Methods for SE", CS4212:"Compiler Design",
  CS4215:"Prog. Language Implementation", CS4218:"Software Testing",
  CS4221:"DB Applications Design & Tuning", CS4222:"Wireless Networking",
  CS4223:"Multi-core Architecture", CS4224:"Distributed Databases",
  CS4225:"Big Data Systems", CS4226:"Internet Architecture",
  CS4230:"Foundations of Modern Cryptography", CS4231:"Parallel & Distributed Algorithms",
  CS4234:"Optimisation Algorithms", CS4236:"Cryptography",
  CS4238:"Computer Security Practice", CS4239:"Software Security",
  CS4242:"Social Media Computing", CS4243:"Computer Vision",
  CS4244:"Knowledge Representation & Reasoning", CS4246:"Reinforcement Learning",
  CS4247:"Graphics Rendering", CS4248:"Large Language Models",
  CS4249:"Quantitative HCI Methods", CS4262:"Machine Learning Systems",
  CS4263:"AI Principles", CS4330:"Combinatorial Bioinformatics",
  CS4347:"Sound & Music Computing", CS4350:"Game Development Project",
  CS4353:"Interactive Systems Project", CS4430:"Computational Complexity",
  ST2334:"Probability and Statistics"
};

async function getJSON(url){
  for(var i=0;i<4;i++){
    try{
      var r=await fetch(url);
      if(r.status===404) return null;
      if(r.ok) return await r.json();
    }catch(e){}
    await new Promise(function(s){ setTimeout(s, 250*(i+1)); });
  }
  throw new Error("fetch failed: "+url);
}

function prereqCodes(tree){
  var out=[];
  (function walk(t){
    if(typeof t==="string") out.push(t.split(":")[0]);
    else if(Array.isArray(t)) t.forEach(walk);
    else if(t && typeof t==="object"){
      if(t.and) walk(t.and);
      if(t.or) walk(t.or);
      if(t.nOf) walk(t.nOf[1]);
    }
  })(tree);
  return out;
}

// Variant families: CS2040 / CS2040C / CS2040HS / CS2040S and MA2116 / MA2116T
// are the same requirement written several ways, so they count as ONE option
// when deciding whether a prerequisite edge is a real choice (dashed) or not.
function family(code){ var m=code.match(/^([A-Z]{2,3}\d{4})/); return m?m[1]:code; }

function edgeFlags(tree, drawn, canonOf){
  var groups=[], req=[];
  (function walk(t,g){
    if(typeof t==="string"){ (g===null?req:groups[g]).push(t.split(":")[0]); return; }
    if(Array.isArray(t)){ t.forEach(function(x){ walk(x,g); }); return; }
    if(t && typeof t==="object"){
      if(t.and) walk(t.and,g);
      if(t.or || t.nOf){ var i=groups.length; groups.push([]); walk(t.or||t.nOf[1],i); }
    }
  })(tree,null);

  var out={};
  function mark(code,alt){
    if(!drawn[code]) return;
    var c=canonOf[code];
    if(!c) return;
    if(out[c]===undefined || alt===false) out[c]=alt;
  }
  groups.forEach(function(members){
    var opts={};
    members.forEach(function(c){ if(drawn[c]) opts[canonOf[c]]=1; });
    var choice=Object.keys(opts).length>=2;
    members.forEach(function(c){ if(drawn[c]) mark(c,choice); });
  });
  req.forEach(function(c){ mark(c,false); });

  return Object.keys(out).map(function(c){ return [c,out[c]]; });
}

(async function main(){
  var list=await getJSON(API+"/moduleList.json");
  var known={};
  list.forEach(function(m){ known[m.moduleCode]=m; });

  var closure={}, frontier=[];
  FOUNDATION.forEach(function(c){
    if(SKIP[c]||closure[c]) return;
    closure[c]=1; frontier.push(c);
  });
  AREAS.forEach(function(a){
    a.prim.forEach(function(c){
      if(SKIP[c]||closure[c]) return;
      closure[c]=1; frontier.push(c);
    });
  });

  var mods={};
  while(frontier.length){
    var batch=frontier; frontier=[];
    var got=await Promise.all(batch.map(function(c){
      return getJSON(API+"/modules/"+c+".json");
    }));
    batch.forEach(function(c,i){
      var m=got[i];
      if(!m){ console.error("no offering: "+c); return; }
      mods[c]=m;
      prereqCodes(m.prereqTree).forEach(function(p){
        if(known[p] && !SKIP[p] && !closure[p]){ closure[p]=1; frontier.push(p); }
      });
    });
    console.error("fetched "+Object.keys(mods).length+"/"+Object.keys(closure).length);
  }

  var ids=Object.keys(closure).sort();

  // Collapse variant families (CS1010/CS1010A/CS1010E/CS1010S, CS2100/
  // CS2100DE/CS2100HS, MA2116/MA2116T, ...) onto one node: NUSMods lists them
  // as interchangeable prerequisites, and drawing all of them five times over
  // makes the canvas unreadable. Canonical pick: a focus-area primary, then a
  // foundation, then the most-referenced code in the closure, then alphabetical.
  var refs={};
  ids.forEach(function(id){
    prereqCodes(mods[id].prereqTree).forEach(function(p){ refs[p]=(refs[p]||0)+1; });
  });
  var primSet={};
  AREAS.forEach(function(a){ a.prim.forEach(function(c){ primSet[c]=1; }); });
  var fams={};
  ids.forEach(function(id){ (fams[family(id)]=fams[family(id)]||[]).push(id); });
  var canon={}, canonOf={};
  Object.keys(fams).forEach(function(f){
    var best=fams[f].slice().sort(function(x,y){
      var sx=(primSet[x]?0:1), sy=(primSet[y]?0:1);
      if(sx!==sy) return sx-sy;
      var fx=(FOUNDATION.indexOf(x)>=0?0:1), fy=(FOUNDATION.indexOf(y)>=0?0:1);
      if(fx!==fy) return fx-fy;
      var rx=refs[x]||0, ry=refs[y]||0;
      if(rx!==ry) return ry-rx;
      return x<y?-1:x>y?1:0;
    })[0];
    canon[best]=1;
    fams[f].forEach(function(id){ canonOf[id]=best; });
  });
  ids=Object.keys(canon).sort();

  var areaOf={};
  AREAS.forEach(function(a){
    a.prim.forEach(function(id){
      if(!canonOf[id]) return;
      var c=canonOf[id], list=areaOf[c]=areaOf[c]||[];
      if(list.indexOf(a.k)<0) list.push(a.k);
    });
  });

  var nodes=ids.map(function(id){
    return { id:id,
             t:TITLES[id]||mods[id].title,
             a:areaOf[id]||[],
             f:FOUNDATION.indexOf(id)>=0 };
  });

  var edges=[], seenEdge={};
  ids.forEach(function(id){
    edgeFlags(mods[id].prereqTree, closure, canonOf).forEach(function(p){
      var s=p[0];
      if(s===id) return;
      var k=s+">"+id;
      if(seenEdge[k]) return;
      seenEdge[k]=1;
      edges.push([s,id,p[1]]);
    });
  });
  edges.sort(function(x,y){
    return x[1]<y[1]?-1:x[1]>y[1]?1:(x[0]<y[0]?-1:x[0]>y[0]?1:0);
  });

  var head=[
    "/**",
    " * Graph data for the CS Focus Area Explorer.",
    " *",
    " * GENERATED FILE — do not edit by hand:",
    " *     node tools/build-data.js > js/data.js",
    " *",
    " * Focus-area membership (which modules are Primary in each area) is the curated",
    " * official NUS SoC list: https://www.comp.nus.edu.sg/programmes/ug/focus/",
    " * Prerequisite edges + module titles come from the NUSMods API v2, academic year",
    " * "+AY+" (current-year only, no fallback).",
    " *",
    " * NODES are the transitive prerequisite closure of every area primary across ALL",
    " * departments, so non-CS requirements (MA, ST, EE, NM, ...) appear as grey",
    " * support nodes. Two dead codes are skipped: CS4232 (SoC-listed but no NUSMods",
    " * offering) and CS3212 (retired alternative prerequisite of CS4212).",
    " *",
    " *   AREAS  — the 11 CS focus areas. Each: { k, name, light, dark, prim[] }",
    " *            k     = internal key (also the CSS custom-property suffix: --a-<k>)",
    " *            prim  = primary module codes that satisfy the area",
    " *   NODES  — every module drawn. Each: { id, t, a[], f }",
    " *            a = focus-area keys this module is a PRIMARY of (empty = pure",
    " *                foundation, pure support, or a non-CS module)",
    " *            f = true if it is a foundation (\"common core\") module",
    " *   EDGES  — prerequisite edges [ source, target, alt ]",
    " *            alt = true when the target lists this source only as ONE OF",
    " *                  SEVERAL acceptable options (drawn dashed); false when the",
    " *                  source sits in an \"and\" chain (drawn solid)",
    " */",
    ""
  ].join("\n");

  process.stdout.write(head
    + "var AREAS = "+JSON.stringify(AREAS)+";\n\n"
    + "var NODES = "+JSON.stringify(nodes)+";\n\n"
    + "var EDGES = "+JSON.stringify(edges)+";\n");
  console.error("nodes "+nodes.length+" edges "+edges.length);
})().catch(function(e){ console.error(e); process.exit(1); });
