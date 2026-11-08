(function(root){
  "use strict";
  function codes(tree){
    if(typeof tree==="string") return [tree.split(":")[0]];
    if(!tree || typeof tree!=="object") return [];
    var children=Array.isArray(tree)?tree:tree.and||tree.or||(tree.nOf&&tree.nOf[1])||(tree.then?[tree.then]:[]);
    return Array.from(new Set(children.flatMap(codes)));
  }
  function describe(tree){
    if(typeof tree==="string") return tree.replace(":", " ≥ ");
    if(!tree) return "No module prerequisites listed";
    if(Array.isArray(tree)) return tree.map(describe).join(" AND ");
    if(tree.and) return tree.and.map(function(t){return "("+describe(t)+")";}).join(" AND ");
    if(tree.or) return tree.or.map(describe).join(" OR ");
    if(tree.nOf) return "At least "+tree.nOf[0]+" of: "+tree.nOf[1].map(describe).join(", ");
    return "Eligibility condition — check NUSMods";
  }
  function checkTree(tree, available){
    if(tree==null) return "met";
    if(typeof tree==="string"){
      var parts=tree.split(":"), code=parts[0];
      if(!/^[A-Z]{2,}\d{4}[A-Z]*$/.test(code)) return "review";
      if(!available.has(code)) return "missing";
      return parts[1] && parts[1]!=="D" ? "review":"met";
    }
    if(typeof tree!=="object") return "review";
    var group=Array.isArray(tree)?tree:tree.and||tree.or||(tree.nOf&&tree.nOf[1]);
    if(!Array.isArray(group)) return "review";
    var results=group.map(function(t){return checkTree(t,available);});
    var required=tree.or?1:tree.nOf?tree.nOf[0]:results.length;
    var met=results.filter(function(r){return r==="met";}).length;
    var review=results.filter(function(r){return r==="review";}).length;
    return met>=required?"met":met+review>=required?"review":"missing";
  }
  function unfulfilled(tree, available){
    if(checkTree(tree,available)!=="missing") return null;
    if(typeof tree==="string") return tree;
    var children=Array.isArray(tree)?tree:tree.and||tree.or||tree.nOf[1];
    if(tree.nOf){
      var met=children.filter(function(t){return checkTree(t,available)==="met";}).length;
      return {nOf:[tree.nOf[0]-met,children.filter(function(t){return checkTree(t,available)!=="met";})]};
    }
    var missing=children.map(function(t){return unfulfilled(t,available);}).filter(Boolean);
    if(missing.length===1) return missing[0];
    return tree.or?{or:missing}:{and:missing};
  }
  function entryStatus(state, entry){
    if(entry.term===-1) return "done";
    if(entry.term===-2) return "todo";
    var s=state.semesterStatus && state.semesterStatus[entry.term];
    return s==="done"?"done":s==="doing"?"doing":"todo";
  }
  function groupFor(state,code){
    var groups=state.groups||[];
    for(var i=0;i<groups.length;i++) if(groups[i].codes.indexOf(code)>=0) return groups[i];
    return null;
  }
  function isCounted(state,code){
    var group=groupFor(state,code);
    return !group || group.selected===code;
  }
  function issues(code, state){
    var entry=state.entries[code], m=entry.module, term=entry.term;
    if(term<0 || entryStatus(state,entry)==="done" || !isCounted(state,code)) return [];
    var available=new Set(Object.keys(state.entries).filter(function(c){
      var e=state.entries[c], t=e.term;
      return isCounted(state,c) && (entryStatus(state,e)==="done" || (t>=0 && t<term));
    }));
    var result=[], checked=checkTree(m.prereqTree,available);
    if(m.dataUnavailable) result.push({kind:"review",text:"Imported units only; prerequisite data could not be verified."});
    if(checked==="missing") result.push({kind:"missing",text:"Needs: "+describe(unfulfilled(m.prereqTree,available))});
    if(checked==="review" || (!m.prereqTree && m.prerequisite)) result.push({kind:"review",text:"Eligibility or grade conditions need manual review on NUSMods."});
    if(m.corequisite) result.push({kind:"review",text:"Corequisite: "+m.corequisite});
    var conflicts=(m.preclusion||"").match(/[A-Z]{2,}\d{4}[A-Z]*/g)||[];
    conflicts=Array.from(new Set(conflicts)).filter(function(c){return c!==code && state.entries[c] && isCounted(state,c) && state.entries[c].term!==-2;});
    if(conflicts.length) result.push({kind:"review",text:"Possible preclusion with "+conflicts.join(", ")+"; check whether both can count."});
    var slot=term%4, offeredSlot=[1,3,2,4][slot];
    if(m.semesters.length && !m.semesters.includes(offeredSlot)) result.push({kind:"review",text:"Not offered in this slot in source AY2026–27. Future offerings may change."});
    return result;
  }
  function totals(state){
    var out={completed:0,scheduled:0,doing:0,unplanned:0};
    out.completed+=state.ueCredit||0;
    Object.keys(state.entries).forEach(function(code){
      if(!isCounted(state,code)) return;
      var e=state.entries[code],status=entryStatus(state,e);
      out[e.term===-2?"unplanned":status==="done"?"completed":"scheduled"]+=e.module.units;
      if(status==="doing") out.doing+=e.module.units;
    });
    out.remaining=Math.max(0,state.target-out.completed-out.scheduled);
    return out;
  }
  var FOUNDATION_PILLAR=new Set(["CS1231S","CS2030S","CS2040S","CS2100","CS2101","CS2103T","CS2106","CS2109S","CS3230"]);
  var MATHS_PILLAR=new Set(["MA1521","MA1522","ST2334"]);
  var ID_COURSES=new Set(["CDE2501","EG2501","DTK1234","EG1311","IE2141","PF1101A","PF1101","IS1128","IS2218","IS2238","HSH1000","HSS1000","HSA1000","HSI1000","HSI2001","HSI2002","HSI2003","HSI2004","HSI2005","HSI2007","HSI2008","HSI2009","HSI2010","HSI2011","HSI2013","HSI2014"]);
  var CD_COURSES=new Set(["ACC1701","ACC1701X","ACC1701XA","ACC1701XB","ACC1701XC","ACC1701XD","DAO2703","MNO1706X","SC1101E","EL1101E","PE2101P","GE2103","XD3103","GE3253","GE3255","GE3256","SPH2002","SC2226","NUR1113A","CDE2300","CDE2310","EG2201A","EG2310","FF1361"]);
  var DIGITAL_LITERACY=new Set(["CS1101S","CS1010","CS1010A","CS1010E","CS1010J","CS1010S","CS1010X","CS1010HS","UTC2851"]);
  var breadthCodes=new Set();
  if(typeof AREAS!=="undefined") AREAS.forEach(function(a){a.prim.forEach(function(c){breadthCodes.add(c);});});
  function pillarOf(code){
    var level=Number((code.match(/\d{4}/)||[0])[0]);
    if(FOUNDATION_PILLAR.has(code)) return "foundation";
    if(MATHS_PILLAR.has(code)) return "foundation";
    if(/^PH-UE/.test(code)) return "ue";
    if(/^PH-/.test(code)) return "common";
    if(DIGITAL_LITERACY.has(code) || ID_COURSES.has(code) || CD_COURSES.has(code) || /^ID\d{4}/.test(code) || code==="IS1108" || /^GE[A-Z]?/.test(code) || /^(ES2660|UTW|RVX)/.test(code)) return "common";
    if(/^(CS|IFS|CP)/.test(code) && (level>=3000 || breadthCodes.has(code))) return "breadth";
    return "ue";
  }
  function pillars(state,includePlanned){
    var defs=[
      {key:"foundation",name:"CS Foundation",target:48},
      {key:"breadth",name:"Breadth & Depth",target:32},
      {key:"common",name:"Common Curriculum",target:40},
      {key:"ue",name:"Unrestricted Electives",target:40}
    ],byKey={};
    defs.forEach(function(d){d.units=0;d.count=0;d.effectiveTarget=d.target;d.codes=[];byKey[d.key]=d;});
    Object.keys(state.entries).forEach(function(code){
      var entry=state.entries[code];
      var done=entryStatus(state,entry)==="done";
      if((!done&&!(includePlanned&&entry.term>=0))||!isCounted(state,code)) return;
      var bucket=byKey[pillarOf(code)];
      bucket.units+=entry.module.units;bucket.count+=1;bucket.codes.push(code);
    });
    byKey.ue.units+=state.ueCredit||0;
    defs.forEach(function(d){d.codes.sort();});
    return defs;
  }
  function focusAreas(state, areas){
    var done=Object.keys(state.entries).filter(function(c){return entryStatus(state,state.entries[c])==="done" && isCounted(state,c);});
    return (areas||[]).map(function(area){
      var codes=done.filter(function(c){return area.prim.indexOf(c)>=0;}).sort();
      var four=codes.filter(function(c){return Number((c.match(/\d{4}/)||[0])[0])>=4000;});
      var has4000=four.length>0;
      return {key:area.k,name:area.name,codes:codes,count:codes.length,count4000:four.length,has4000:has4000,fulfilled:codes.length>=3&&has4000};
    });
  }
  function commonRequirements(state){
    var defs=[
      {key:"digital",name:"Digital Literacy",test:function(c){return DIGITAL_LITERACY.has(c);}},
      {key:"critique",name:"Critique & Expression",test:function(c){return c==="ES2660"||/^(UTW|RVX)/.test(c);}},
      {key:"cultures",name:"Cultures & Connections",test:function(c){return /^GEC/.test(c);}},
      {key:"data",name:"Data Literacy",test:function(c){return ["GEA1000","BT1101","ST1131","DSA1101"].includes(c);}},
      {key:"singapore",name:"Singapore Studies",test:function(c){return /^GES/.test(c);}},
      {key:"communities",name:"Communities & Engagement",test:function(c){return /^GEN/.test(c);}},
      {key:"ethics",name:"IS1108 Ethics",test:function(c){return c==="IS1108";}}
    ];
    var codes=Object.keys(state.entries).filter(function(c){return entryStatus(state,state.entries[c])==="done" && isCounted(state,c);});
    var plannedCodes=Object.keys(state.entries).filter(function(c){return state.entries[c].term>=0 && isCounted(state,c) && codes.indexOf(c)<0 && !state.entries[c].module.placeholder;});
    var placeholders=Object.keys(state.entries).filter(function(c){return state.entries[c].term>=0 && isCounted(state,c) && state.entries[c].module.placeholder;});
    defs.forEach(function(d){d.codes=codes.filter(d.test);d.plannedCodes=plannedCodes.filter(d.test);d.fulfilled=d.codes.length>0;d.planned=!d.fulfilled&&(d.plannedCodes.length>0||placeholders.some(function(c){return state.entries[c].module.pillarKey===d.key;}));});
    var id=codes.filter(function(c){return /^ID\d{4}/.test(c)||ID_COURSES.has(c);});
    var cd=codes.filter(function(c){return /^CD\d{4}/.test(c)||CD_COURSES.has(c);});
    var plannedId=plannedCodes.filter(function(c){return /^ID\d{4}/.test(c)||ID_COURSES.has(c);});
    var plannedCd=plannedCodes.filter(function(c){return /^CD\d{4}/.test(c)||CD_COURSES.has(c);});
    var units=id.concat(cd).reduce(function(sum,c){return sum+state.entries[c].module.units;},0);
    var plannedUnits=plannedId.concat(plannedCd).reduce(function(sum,c){return sum+state.entries[c].module.units;},0);
    var placeholderUnits=placeholders.filter(function(c){return state.entries[c].module.pillarKey==="idcd";}).reduce(function(sum,c){return sum+state.entries[c].module.units;},0);
    defs.push({key:"idcd",name:"ID / CD",codes:id.concat(cd),plannedCodes:plannedId.concat(plannedCd),idCount:id.length,cdCount:cd.length,units:units,plannedUnits:plannedUnits+placeholderUnits,fulfilled:units>=12&&id.length>=2&&cd.length<=1,planned:units<12&&(plannedUnits+placeholderUnits)>0,partial:!(units>=12&&id.length>=2&&cd.length<=1)&&units>0});
    return defs;
  }
  function year(start){return start+"-"+(start+1);}
  function exportPlan(state){
    var out={minYear:year(state.startYear),maxYear:year(state.startYear+state.years-1),iblocs:false,ignorePrereqCheck:false,modules:{},custom:{}};
    var indexes={};
    Object.entries(state.entries).forEach(function(pair,i){
      var code=pair[0],e=pair[1],id=String(i),t=e.term;
      if(!isCounted(state,code)||e.module.placeholder||/^PH-/.test(code)) return;
      var cleared=t===-1;
      var y=cleared?"-1":t===-2?"3000":year(state.startYear+Math.floor(t/4));
      var semester=cleared?-1:t===-2?-2:[1,3,2,4][t%4], key=y+"|"+semester;
      out.modules[id]={id:id,year:y,semester:semester,index:indexes[key]||0,moduleCode:code};
      indexes[key]=(indexes[key]||0)+1;
      out.custom[code]={title:e.module.title,moduleCredit:e.module.units};
    });
    return out;
  }
  function importSlots(data){
    function start(value){
      if(typeof value!=="string" || !/^\d{4}-\d{4}$/.test(value)) throw new Error("Invalid academic year in planner file.");
      var parts=value.split("-").map(Number);
      if(parts[0]<2000 || parts[0]>2100 || parts[1]!==parts[0]+1) throw new Error("Invalid academic year in planner file.");
      return parts[0];
    }
    if(!data || typeof data!=="object" || !data.modules || typeof data.modules!=="object" || Array.isArray(data.modules)) throw new Error("Choose a JSON file downloaded from NUSMods Planner.");
    var first=start(data.minYear), last=start(data.maxYear), seen=new Set();
    if(last<first) throw new Error("Invalid year range in planner file.");
    var slots=Object.values(data.modules).map(function(m){
      if(!m || typeof m.moduleCode!=="string" || !/^[A-Z]{2,}\d{4}[A-Z]*$/.test(m.moduleCode)) throw new Error("Resolve placeholders in NUSMods before importing.");
      if(seen.has(m.moduleCode)) throw new Error(m.moduleCode+" appears more than once. Resolve duplicates before importing.");
      seen.add(m.moduleCode);
      var term;
      if(m.year==="-1" && m.semester===-1) term=-1;
      else if(m.year==="3000" && m.semester===-2) term=-2;
      else {
        if(![1,2,3,4].includes(m.semester)) throw new Error("This planner file uses an unsupported semester. Your plan has not changed.");
        var y=start(m.year);
        if(y<first || y>last) throw new Error("A module is outside the planner's year range.");
        term=(y-first)*4+[1,3,2,4].indexOf(m.semester);
      }
      var custom=data.custom && Object.hasOwn(data.custom,m.moduleCode)?data.custom[m.moduleCode]:null;
      if(custom && (!Number.isFinite(custom.moduleCredit) || custom.moduleCredit<0 || (custom.title!=null && typeof custom.title!=="string"))) throw new Error("Invalid custom module data for "+m.moduleCode+".");
      return {code:m.moduleCode,term:term,index:Number.isInteger(m.index)?m.index:0,custom:custom};
    });
    slots.sort(function(a,b){return a.term-b.term || a.index-b.index;});
    return {startYear:first,years:last-first+1,slots:slots};
  }
  function familyOf(code){var m=code.match(/^([A-Z]{2,}\d{4})/);return m?m[1]:code;}
  function searchGroups(query, catalog, limit){
    var tokens=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!tokens.length) return [];
    function score(text, token){
      text=text.toLowerCase();
      var direct=text.indexOf(token);
      if(direct>=0) return direct;
      var at=-1, gaps=0;
      for(var i=0;i<token.length;i++){
        var next=text.indexOf(token[i],at+1);
        if(next<0) return Infinity;
        gaps+=next-at-1;at=next;
      }
      return 100+gaps;
    }
    var groups={};
    catalog.forEach(function(m){
      var rank=tokens.reduce(function(sum,t){return sum+Math.min(score(m.moduleCode,t),score(m.title,t)+10);},0);
      if(!Number.isFinite(rank)) return;
      if(m.moduleCode.toLowerCase()===tokens.join("")) rank=-100;
      var family=familyOf(m.moduleCode);
      if(!groups[family]) groups[family]={family:family,title:m.title,rank:rank,modules:[]};
      groups[family].modules.push(m);
      if(rank<groups[family].rank){groups[family].rank=rank;groups[family].title=m.title;}
      if(m.moduleCode===family) groups[family].title=m.title;
    });
    return Object.values(groups).map(function(g){
      g.modules.sort(function(a,b){return a.moduleCode.length-b.moduleCode.length || a.moduleCode.localeCompare(b.moduleCode);});
      return g;
    }).sort(function(a,b){return a.rank-b.rank || a.family.localeCompare(b.family);}).slice(0,limit||8);
  }
  var api={codes:codes,describe:describe,checkTree:checkTree,groupFor:groupFor,isCounted:isCounted,issues:issues,entryStatus:entryStatus,totals:totals,pillars:pillars,focusAreas:focusAreas,commonRequirements:commonRequirements,exportPlan:exportPlan,importSlots:importSlots,searchGroups:searchGroups};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.PlannerCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
