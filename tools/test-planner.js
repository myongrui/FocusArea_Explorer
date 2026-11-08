"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const core=require("../js/planner-core.js");
const passed=(...codes)=>new Set(codes);
const moduleInfo=(overrides={})=>({title:"Test module",units:4,prereqTree:null,prerequisite:"",preclusion:"",corequisite:"",semesters:[1,2,3,4],...overrides});
const entry=(term,overrides)=>({term,module:moduleInfo(overrides)});
const plan=(entries)=>({version:1,startYear:2026,years:4,target:160,entries});

test("prerequisites respect AND, OR, and exact module variants",()=>{
  const tree={and:[{or:["CS2030:D","CS2030S:D"]},"CS2040S:D"]};
  assert.equal(core.checkTree(tree,passed("CS2030S","CS2040S")),"met");
  assert.equal(core.checkTree(tree,passed("CS2030S")),"missing");
  assert.equal(core.checkTree("CS2030:D",passed("CS2030S")),"missing");
  assert.equal(core.checkTree(null,passed()),"met");
});

test("n-of counts requirements rather than treating them as an OR",()=>{
  const tree={nOf:[2,["MA1511:D","MA1512:D","MA1521:D"]]};
  assert.equal(core.checkTree(tree,passed("MA1511")),"missing");
  assert.equal(core.checkTree(tree,passed("MA1511","MA1512")),"met");
});

test("unknown gates and higher grades are not silently satisfied",()=>{
  assert.equal(core.checkTree({cohort:{rule:"IF_IN",years:["S:2025"]},then:"CS1101S"},passed("CS1101S")),"review");
  assert.equal(core.checkTree("CS1101S:B",passed("CS1101S")),"review");
  assert.equal(core.checkTree("MA%",passed("MA1521")),"review");
  assert.equal(core.checkTree({or:["CS1101S",{other:true}]},passed("CS1101S")),"met");
});

test("only completed and strictly earlier semesters satisfy dependencies",()=>{
  const state=plan({CS1101S:entry(-1),CS2030S:entry(0,{prereqTree:"CS1101S:D"}),CS2103T:entry(0,{prereqTree:"CS2030S:D"})});
  assert.equal(core.issues("CS2030S",state).length,0);
  assert.equal(core.issues("CS2103T",state)[0].kind,"missing");
  state.entries.CS2103T.term=1;
  assert.equal(core.issues("CS2103T",state).length,0);
  state.entries.CS2030S.term=-2;
  assert.equal(core.issues("CS2103T",state)[0].kind,"missing");
  state.entries.CS2030S.term=2;
  assert.equal(core.issues("CS2103T",state)[0].kind,"missing");
});

test("text-only eligibility, offerings, and potential preclusions need review",()=>{
  const state=plan({CS1010:entry(-1),CS1101S:entry(1,{prerequisite:"Admission condition",preclusion:"CS1010",semesters:[1]})});
  const issues=core.issues("CS1101S",state);
  assert.equal(issues.length,3);
  assert(issues.every(i=>i.kind==="review"));
  assert(issues.some(i=>i.text.includes("Possible preclusion")));
});

test("unit totals exclude unplanned modules from graduation coverage",()=>{
  const state=plan({CS1101S:entry(-1),CS2030S:entry(0),CS2040S:entry(-2)});
  assert.deepEqual(core.totals(state),{completed:4,scheduled:4,doing:0,unplanned:4,remaining:152});
  state.target=6;
  assert.equal(core.totals(state).remaining,0);
});

test("NUSMods export uses native years, semester buckets, IDs, and indexes",()=>{
  const state=plan({CS1101S:entry(-1),CS2030S:entry(0),CS1231S:entry(0),CS2040S:entry(3),CS2100:entry(-2)});
  const exported=core.exportPlan(state), modules=Object.values(exported.modules);
  assert.equal(exported.minYear,"2026-2027");
  assert.equal(exported.maxYear,"2029-2030");
  assert.equal(exported.iblocs,false);
  assert.equal(exported.ignorePrereqCheck,false);
  assert.deepEqual(modules.map(m=>[m.moduleCode,m.year,m.semester,m.index]),[
    ["CS1101S","-1",-1,0],["CS2030S","2026-2027",1,0],["CS1231S","2026-2027",1,1],
    ["CS2040S","2026-2027",4,0],["CS2100","3000",-2,0]
  ]);
  modules.forEach((m,i)=>assert.equal(m.id,String(i)));
  assert.deepEqual(exported.custom.CS1101S,{title:"Test module",moduleCredit:4});
});

test("native planner export round-trips through import",()=>{
  const state=plan({CS1101S:entry(-1),CS2030S:entry(0),CS2040S:entry(3),CS2100:entry(-2)});
  const imported=core.importSlots(core.exportPlan(state));
  assert.equal(imported.startYear,2026);
  assert.equal(imported.years,4);
  assert.deepEqual(Object.fromEntries(imported.slots.map(s=>[s.code,s.term])),{CS2100:-2,CS1101S:-1,CS2030S:0,CS2040S:3});
  assert.equal(imported.slots.find(s=>s.code==="CS1101S").custom.moduleCredit,4);
});

test("import rejects malformed, duplicate, placeholder, and unsupported records",()=>{
  assert.throws(()=>core.importSlots({}),/NUSMods/);
  const file=core.exportPlan(plan({CS1101S:entry(0)}));
  assert.throws(()=>core.importSlots({...file,minYear:"2026-2028"}),/academic year/);
  assert.throws(()=>core.importSlots({...file,modules:{0:{...file.modules[0],semester:5}}}),/unsupported semester/);
  assert.throws(()=>core.importSlots({...file,modules:{0:{placeholderId:"x",year:"2026-2027",semester:1}}}),/placeholders/);
  assert.throws(()=>core.importSlots({...file,modules:{0:file.modules[0],1:file.modules[0]}}),/more than once/);
  assert.throws(()=>core.importSlots({...file,custom:{CS1101S:{moduleCredit:-4}}}),/custom module/);
  assert.throws(()=>core.importSlots({...file,modules:{0:{...file.modules[0],year:"2031-2032"}}}),/year range/);
});

test("imports without verified dependency data are flagged",()=>{
  const state=plan({CS1101S:entry(0,{dataUnavailable:true})});
  assert(core.issues("CS1101S",state).some(i=>i.kind==="review"));
});

test("special terms map to winter and summer slots",()=>{
  const file=core.exportPlan(plan({CS2030S:entry(1,{semesters:[1,2,3,4]}),CS2040S:entry(2,{semesters:[1,2,3,4]}),CS2100:entry(3,{semesters:[1,2,3,4]})}));
  const semesters=Object.values(file.modules).map(m=>[m.moduleCode,m.semester]);
  assert.deepEqual(semesters,[["CS2030S",3],["CS2040S",2],["CS2100",4]]);
  const imported=core.importSlots(file);
  assert.deepEqual(Object.fromEntries(imported.slots.map(s=>[s.code,s.term])),{CS2030S:1,CS2040S:2,CS2100:3});
});

test("fuzzy search aggregates variant families",()=>{
  const catalog=[{moduleCode:"CS1010",title:"Programming Methodology"},{moduleCode:"CS1010S",title:"Programming Methodology"},{moduleCode:"CS1010E",title:"Programming Methodology"},{moduleCode:"CS2040S",title:"Data Structures"}];
  const groups=core.searchGroups("programming",catalog,8);
  assert.equal(groups.length,1);
  assert.equal(groups[0].family,"CS1010");
  assert.deepEqual(groups[0].modules.map(m=>m.moduleCode),["CS1010","CS1010E","CS1010S"]);
});

test("semester status changes completion totals and export",()=>{
  const state=plan({CS1101S:entry(0),CS2030S:entry(2)});
  state.semesterStatus={0:"done",2:"doing"};
  assert.equal(core.entryStatus(state,state.entries.CS1101S),"done");
  assert.equal(core.entryStatus(state,state.entries.CS2030S),"doing");
  const totals=core.totals(state);
  assert.equal(totals.completed,4);
  assert.equal(totals.doing,4);
  const exported=core.exportPlan(state);
  const byCode=Object.fromEntries(Object.values(exported.modules).map(m=>[m.moduleCode,m]));
  assert.equal(byCode.CS1101S.semester,1);
  assert.equal(byCode.CS1101S.year,"2026-2027");
  assert.equal(byCode.CS2030S.semester,2);
});

test("pillars group planned modules and exclude unplanned ones",()=>{
  const state=plan({CS2030S:entry(-1),MA1521:entry(-1),CS1101S:entry(-1),CS4248:entry(-1),CS2113:entry(-1),CS2040S:entry(-2)});
  const pillars=Object.fromEntries(core.pillars(state).map(p=>[p.key,p]));
  assert.deepEqual(["foundation","breadth","common","ue"].map(k=>pillars[k].units),[8,4,4,4]);
  assert.deepEqual(pillars.foundation.codes,["CS2030S","MA1521"]);
  assert.equal(pillars.foundation.count,2);
  assert.equal(pillars.breadth.count,1);
  assert.deepEqual(pillars.common.codes,["CS1101S"]);
  assert.deepEqual(core.pillars(state).map(p=>p.target),[48,32,40,40]);
  assert.deepEqual(core.pillars(state).map(p=>p.effectiveTarget),[48,32,40,40]);
});

test("common curriculum checks cover the pillars, ethics, and ID/CD",()=>{
  const state=plan({CS1101S:entry(-1),GEA1000:entry(-1),IS1108:entry(-1),IS1128:entry(-1),ID1101:entry(-1),ID1102:entry(-1),CD1101:entry(-1),CS2040S:entry(-2)});
  const req=Object.fromEntries(core.commonRequirements(state).map(r=>[r.key,r]));
  assert.equal(req.digital.fulfilled,true);
  assert.equal(req.data.fulfilled,true);
  assert.equal(req.ethics.fulfilled,true);
  assert.deepEqual(req.ethics.codes,["IS1108"]);
  assert.equal(req.idcd.fulfilled,true);
  assert.equal(req.idcd.units,16);
  assert.equal(req.idcd.idCount,3);
  assert.equal(req.idcd.cdCount,1);
  assert.equal(req.critique.fulfilled,false);
  assert.equal(req.critique.codes.length,0);
});

test("either/or groups count and export only the selected module",()=>{
  const state=plan({CS4248:entry(0),CS4347:entry(0)});
  state.groups=[{id:"g1",term:0,codes:["CS4248","CS4347"],selected:"CS4248"}];
  assert.equal(core.isCounted(state,"CS4248"),true);
  assert.equal(core.isCounted(state,"CS4347"),false);
  assert.equal(core.totals(state).scheduled,4);
  assert.deepEqual(Object.values(core.exportPlan(state).modules).map(m=>m.moduleCode),["CS4248"]);
  state.groups[0].selected="CS4347";
  assert.equal(core.totals(state).scheduled,4);
  assert.deepEqual(Object.values(core.exportPlan(state).modules).map(m=>m.moduleCode),["CS4347"]);
});

test("focus areas require three primaries including a 4000-level course",()=>{
  const areas=[{k:"ai",name:"AI",prim:["CS2109S","CS3243","CS4243"]}];
  const state=plan({CS2109S:entry(-1),CS3243:entry(-1),CS4243:entry(0)});
  assert.equal(core.focusAreas(state,areas)[0].count,2);
  assert.equal(core.focusAreas(state,areas)[0].fulfilled,false);
  state.entries.CS4243.term=-1;
  assert.equal(core.focusAreas(state,areas)[0].count,3);
  assert.equal(core.focusAreas(state,areas)[0].has4000,true);
  assert.equal(core.focusAreas(state,areas)[0].count4000,1);
  assert.equal(core.focusAreas(state,areas)[0].fulfilled,true);
});

test("common curriculum distinguishes planned from completed requirements",()=>{
  const planned=plan({GEA1000:entry(0)});
  const plannedData=core.commonRequirements(planned).find(r=>r.key==="data");
  assert.equal(plannedData.fulfilled,false);
  assert.equal(plannedData.planned,true);
  assert.deepEqual(plannedData.plannedCodes,["GEA1000"]);
  const done=plan({GEA1000:entry(-1)});
  const doneData=core.commonRequirements(done).find(r=>r.key==="data");
  assert.equal(doneData.fulfilled,true);
  assert.equal(doneData.planned,false);
});

test("pillar totals reconcile with earned units, groups, and UE credit",()=>{
  const state=plan({
    CS2030S:entry(-1),MA1521:entry(-1),CS1101S:entry(-1),CS2113:entry(-1),CS2100:entry(0),
    CS4248:entry(-1),CS4347:entry(-1)
  });
  state.ueCredit=20;
  state.groups=[{id:"g1",term:-1,codes:["CS4248","CS4347"],selected:"CS4248"}];
  const totals=core.totals(state);
  const pillars=Object.fromEntries(core.pillars(state).map(p=>[p.key,p]));
  assert.equal(totals.completed,40);
  assert.equal(totals.scheduled,4);
  assert.equal(pillars.foundation.units,8);
  assert.equal(pillars.breadth.units,4);
  assert.equal(pillars.common.units,4);
  assert.equal(pillars.ue.units,24);
  assert.equal(Object.values(pillars).reduce((sum,p)=>sum+p.units,0),totals.completed);
  assert.deepEqual(pillars.breadth.codes,["CS4248"]);
});

test("ID/CD detection uses the official cross-listed course sets",()=>{
  const state=plan({DTK1234:entry(-1),CDE2501:entry(-1),EL1101E:entry(-1)});
  const idcd=core.commonRequirements(state).find(r=>r.key==="idcd");
  assert.equal(idcd.units,12);
  assert.equal(idcd.idCount,2);
  assert.equal(idcd.cdCount,1);
  assert.equal(idcd.partial,false);
  const pillars=Object.fromEntries(core.pillars(state).map(p=>[p.key,p]));
  assert.equal(pillars.common.units,12);
});

test("dependency code suggestions preserve OR alternatives without duplicates",()=>{
  const tree={and:[{or:["CS1101S:D","CS1010:D"]},{nOf:[1,["CS1101S:D","CS1231S:D"]]}]};
  assert.deepEqual(core.codes(tree),["CS1101S","CS1010","CS1231S"]);
  assert(core.describe(tree).includes("OR"));
  assert(core.describe(tree).includes("AND"));
});
