(function(){
  "use strict";
  var core=PlannerCore, key="csfae:planner:v2", legacyKey="csfae:planner:v1", api="https://api.nusmods.com/v2/2026-2027";
  var SLOT_NAMES=["Sem 1","Winter","Sem 2","Summer"];
  var state={version:2,startYear:2026,years:4,target:160,semesterStatus:{},entries:{},groups:[],groupSeq:1,ueCredit:0};
  var pending={}, addTo=-2, revision=0, wasFull=null;
  var status=document.getElementById("plannerStatus");
  var codeInput=document.getElementById("planCode"), searchList=document.getElementById("planSearchResults");
  var extraModules=[{moduleCode:"CP3200",title:"Internship"}];
  var catalog=NODES.map(function(n){return {moduleCode:n.id,title:n.t};}).concat(extraModules), catalogRequest=null, matches=[], searchIndex=0;
  function migrate(saved){
    if(!saved || !saved.entries) return null;
    var migrated={version:2,startYear:saved.startYear,years:saved.years,target:160,semesterStatus:{},entries:{},groups:saved.groups||[],groupSeq:saved.groupSeq||1,ueCredit:saved.ueCredit||0};
    Object.keys(saved.entries).forEach(function(code){
      var entry=saved.entries[code], term=entry.term;
      if(saved.version===1 && term>=0) term=Math.floor(term/2)*4+(term%2?2:0);
      migrated.entries[code]=Object.assign({},entry,{term:term});
    });
    Object.keys(saved.semesterStatus||{}).forEach(function(term){
      var t=Number(term);migrated.semesterStatus[saved.version===1?Math.floor(t/2)*4+(t%2?2:0):t]=saved.semesterStatus[term];
    });
    return migrated;
  }
  try{
    var saved=JSON.parse(localStorage.getItem(key)||localStorage.getItem(legacyKey));
    if(saved && saved.entries && Number.isInteger(saved.startYear) && Number.isInteger(saved.years) && Number.isFinite(saved.target)){
      state=migrate(saved);
      Object.values(state.entries).forEach(function(e){
        if(!e.module || !Number.isFinite(e.module.units) || !Array.isArray(e.module.semesters) || !Number.isInteger(e.term) || e.term< -2 || e.term>=state.years*4) throw new Error("Invalid saved plan");
      });
      if(!state.semesterStatus || typeof state.semesterStatus!=="object") state.semesterStatus={};
      state.target=160;
    }
  }catch(e){status.textContent="Saved plan could not be loaded. Browser storage may be unavailable.";}
  function el(tag, className, text){
    var node=document.createElement(tag);
    if(className) node.className=className;
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function syncGraph(){
    var completed=[],doing=[],planned=[],focus=[];
    state.groups.forEach(function(g){focus=focus.concat(g.codes);});
    Object.keys(state.entries).forEach(function(c){
      var entry=state.entries[c],status=core.entryStatus(state,entry);
      if(status==="done") completed.push(c);
      else if(status==="doing") doing.push(c);
      if(entry.term>=0) planned.push(c);
    });
    document.dispatchEvent(new CustomEvent("planner:status",{detail:{completed:completed,doing:doing,planned:planned,focus:Array.from(new Set(focus))}}));
  }
  function save(){
    revision++;
    try{localStorage.setItem(key,JSON.stringify(state));}
    catch(e){status.textContent="Plan not saved. Export a backup.";}
    render();syncGraph();
  }
  function playChime(){
    try{
      var AudioCtor=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtor) return;
      var ctx=new AudioCtor(),now=ctx.currentTime;
      if(ctx.state==="suspended") ctx.resume();
      [523.25,659.25,783.99,1046.5].forEach(function(freq,i){
        var osc=ctx.createOscillator(),gain=ctx.createGain(),start=now+i*0.09;
        osc.type="sine";osc.frequency.value=freq;
        gain.gain.setValueAtTime(0,start);
        gain.gain.linearRampToValueAtTime(0.12,start+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,start+0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);osc.stop(start+0.5);
      });
      setTimeout(function(){ctx.close();},1200);
    }catch(error){}
  }
  function confetti(){
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    canvas.className="plan-confetti";canvas.width=innerWidth;canvas.height=innerHeight;
    document.body.appendChild(canvas);
    var colors=["#0e8a3c","#2a78d6","#e5661f","#d1477f","#c98a00","#0f9d7a"];
    var pieces=Array.from({length:110},function(){
      return {x:Math.random()*innerWidth,y:-20-Math.random()*innerHeight*0.5,vx:(Math.random()-0.5)*3,vy:2+Math.random()*4,size:5+Math.random()*5,rot:Math.random()*6,vr:(Math.random()-0.5)*0.3,color:colors[Math.floor(Math.random()*colors.length)]};
    });
    var started=null;
    function frame(time){
      if(started===null) started=time;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      pieces.forEach(function(p){
        p.x+=p.vx;p.y+=p.vy;p.vy+=0.03;p.rot+=p.vr;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.color;
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);ctx.restore();
      });
      if(time-started<2600) requestAnimationFrame(frame);else canvas.remove();
    }
    requestAnimationFrame(frame);
  }
  function celebrate(){playChime();confetti();}
  function label(term){
    if(term===-1) return "Cleared";
    if(term===-2) return "Unplanned";
    return "Y"+(Math.floor(term/4)+1)+" · "+SLOT_NAMES[term%4];
  }
  async function metadata(code){
    if(state.entries[code]) return state.entries[code].module;
    if(!pending[code]) pending[code]=(async function(){
      var response=await fetch(api+"/modules/"+encodeURIComponent(code)+".json");
      if(!response.ok) throw new Error(code+": "+(response.status===404?"not found in AY2026–27":"NUSMods is unavailable"));
      var m=await response.json(), units=Number(m.moduleCredit);
      if(!Number.isFinite(units) || units<0) throw new Error(code+": no verified unit value");
      return {title:m.title,units:units,prereqTree:m.prereqTree||null,prerequisite:m.prerequisite||"",preclusion:m.preclusion||"",corequisite:m.corequisite||"",semesters:(m.semesterData||[]).map(function(s){return s.semester;})};
    })().finally(function(){delete pending[code];});
    return pending[code];
  }
  function duplicateFeedback(){
    var form=document.getElementById("planAddForm");status.textContent="";
    form.classList.remove("duplicate");void form.offsetWidth;form.classList.add("duplicate");
    setTimeout(function(){form.classList.remove("duplicate");},520);
  }
  async function add(code, term){
    code=code.trim().toUpperCase();
    if(!/^[A-Z]{2,}\d{4}[A-Z]*$/.test(code)) throw new Error("Enter a module code, e.g. CS2030S.");
    if(state.entries[code]){duplicateFeedback();return;}
    status.textContent="Loading "+code+" from NUSMods…";
    var m=await metadata(code);
    if(state.entries[code]) return;
    state.entries[code]={term:term,module:m};
    save();status.textContent="Added "+code+" to "+label(term)+".";
  }
  function report(error){status.textContent=error.message||"Unable to load module data. Try again.";}
  document.addEventListener("planner:pin",function(e){
    var code=e.detail.code;
    if(state.entries[code]) return;
    add(code,-2).catch(report);
  });
  function chooseModule(code){
    var query=codeInput.value;
    add(code,addTo).then(function(){
      if(codeInput.value===query){codeInput.value="";renderSearch();}
    }).catch(report);
  }
  var variants={};
  function selectedVariant(group){
    var index=(variants[group.family]||0)%group.modules.length;
    variants[group.family]=index;
    return group.modules[index];
  }
  function renderSearch(){
    matches=core.searchGroups(codeInput.value,catalog,8);
    searchIndex=Math.min(searchIndex,Math.max(0,matches.length-1));
    searchList.replaceChildren();searchList.hidden=!codeInput.value.trim();
    if(searchList.hidden) return;
    if(!matches.length){searchList.appendChild(el("li","plan-search-empty","No matching modules"));return;}
    matches.forEach(function(group,i){
      var m=selectedVariant(group),card=el("li","plan-search-card"+(i===searchIndex?" selected":""));
      var variantsLeft=group.modules.length>1;
      card.draggable=true;card.tabIndex=-1;card.dataset.code=m.moduleCode;
      card.setAttribute("role","option");card.setAttribute("aria-selected",String(i===searchIndex));
      card.append(el("b",null,m.moduleCode),el("span",null,group.title));
      if(variantsLeft) card.appendChild(el("small",null,(group.modules.indexOf(m)+1)+"/"+group.modules.length+" ←→"));
      card.title="Drag to a slot, or click to add to "+label(addTo);
      card.setAttribute("aria-label","Add "+m.moduleCode+" "+group.title+(variantsLeft?" — use left and right arrows to choose among "+group.modules.map(function(x){return x.moduleCode;}).join(", "):"")+" to "+label(addTo));
      card.addEventListener("click",function(){chooseModule(m.moduleCode);});
      card.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();chooseModule(m.moduleCode);}});
      card.addEventListener("dragstart",function(e){
        e.dataTransfer.setData("application/x-fa-module",m.moduleCode);
        e.dataTransfer.setData("text/plain",m.moduleCode);
        e.dataTransfer.effectAllowed="copyMove";
        card.classList.add("dragging");
      });
      card.addEventListener("dragend",function(){card.classList.remove("dragging");});
      searchList.appendChild(card);
    });
  }
  codeInput.addEventListener("input",function(){
    searchIndex=0;renderSearch();
    if(!codeInput.value.trim() || catalogRequest) return;
    catalogRequest=(async function(){
      try{
        var response=await fetch(api+"/moduleList.json");
        if(!response.ok) throw new Error("Module list unavailable");
        var list=await response.json();
        catalog=list.concat(extraModules.filter(function(m){return !list.some(function(x){return x.moduleCode===m.moduleCode;});}));
        renderSearch();
      }catch(error){catalogRequest=null;}
    })();
  });
  codeInput.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown" || e.key==="ArrowUp"){
      e.preventDefault();searchIndex=Math.max(0,Math.min(matches.length-1,searchIndex+(e.key==="ArrowDown"?1:-1)));renderSearch();
    }
    if((e.key==="ArrowLeft" || e.key==="ArrowRight") && matches[searchIndex]){
      e.preventDefault();
      var group=matches[searchIndex],current=variants[group.family]||0;
      variants[group.family]=(current+(e.key==="ArrowRight"?1:-1)+group.modules.length)%group.modules.length;
      renderSearch();
    }
    if(e.key==="Escape"){codeInput.value="";renderSearch();}
  });
  document.getElementById("planAddForm").addEventListener("submit", function(e){
    e.preventDefault();
    var query=codeInput.value.trim();
    if(/^[A-Za-z]{2,}\d{4}[A-Za-z]*$/.test(query)) chooseModule(query);
    else if(matches[searchIndex]) chooseModule(selectedVariant(matches[searchIndex]).moduleCode);
  });
  function addYear(){
    state.years++;save();
    var timeline=document.querySelector(".planner-timeline");
    timeline.scrollTo({left:timeline.scrollWidth,behavior:"smooth"});
  }
  function mergeInto(targetCode,sourceCode){
    if(targetCode===sourceCode) return;
    var target=state.entries[targetCode],source=state.entries[sourceCode];
    if(!target||!source||target.term<0) return;
    var tg=core.groupFor(state,targetCode),sg=core.groupFor(state,sourceCode);
    var codes=Array.from(new Set([targetCode,sourceCode].concat(tg?tg.codes:[],sg?sg.codes:[]))).filter(function(c){return state.entries[c];});
    state.groups=state.groups.filter(function(g){return g!==tg&&g!==sg;});
    var selected=tg&&state.entries[tg.selected]?tg.selected:targetCode;
    state.groups.push({id:"g"+(state.groupSeq++),term:target.term,codes:codes,selected:selected});
    codes.forEach(function(c){state.entries[c].term=target.term;});
    save();
  }
  function removeGroup(group){
    group.codes.forEach(function(c){delete state.entries[c];});
    state.groups=state.groups.filter(function(g){return g!==group;});
    save();
  }
  function ungroup(group){
    state.groups=state.groups.filter(function(g){return g!==group;});
    save();
  }
  function makeMergeTarget(box,targetCode){
    box.addEventListener("dragover",function(e){
      if(!Array.from(e.dataTransfer.types).includes("application/x-fa-module")) return;
      var target=state.entries[targetCode];
      if(!target||target.term<0) return;
      e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect="move";box.classList.add("merge-target");
    });
    box.addEventListener("dragleave",function(e){if(!box.contains(e.relatedTarget)) box.classList.remove("merge-target");});
    box.addEventListener("drop",function(e){
      var source=e.dataTransfer.getData("application/x-fa-module"),target=state.entries[targetCode];
      if(!source||!state.entries[source]||!target||target.term<0) return;
      e.preventDefault();e.stopPropagation();box.classList.remove("merge-target");mergeInto(targetCode,source);
    });
  }
  function groupCard(group){
    var codes=group.codes.filter(function(c){return state.entries[c];});
    if(!codes.length) return null;
    if(codes.indexOf(group.selected)<0) group.selected=codes[0];
    var selected=group.selected,m=state.entries[selected].module,problems=core.issues(selected,state);
    var box=el("article","plan-card plan-group");box.draggable=true;box.dataset.group=group.id;
    var top=el("div","plan-card-top"),remove=el("button","plan-remove","×");
    remove.type="button";remove.setAttribute("aria-label","Remove either/or group");
    remove.addEventListener("click",function(){removeGroup(group);});
    top.append(el("span",null,m.units+" units"),remove);
    var choices=el("div","plan-group-choices"+(codes.length===2?" two":""));
    codes.forEach(function(code){
      var button=el("button","plan-alt"+(code===selected?" selected":""),code);button.type="button";button.draggable=true;
      button.title="Click to count this module; drag it out to separate";
      button.addEventListener("click",function(e){e.stopPropagation();group.selected=code;save();});
      button.addEventListener("dragstart",function(e){
        e.stopPropagation();e.dataTransfer.setData("application/x-fa-separate",group.id);e.dataTransfer.setData("application/x-fa-module",code);e.dataTransfer.setData("text/plain",code);e.dataTransfer.effectAllowed="move";
      });
      choices.appendChild(button);
    });
    box.append(top,choices,el("div","plan-card-title",m.title));
    problems.filter(function(p){return p.kind==="missing";}).forEach(function(p){box.appendChild(el("p","plan-check missing",p.text));});
    makeMergeTarget(box,selected);
    box.addEventListener("dragstart",function(e){e.dataTransfer.setData("application/x-fa-module",selected);e.dataTransfer.setData("text/plain",selected);e.dataTransfer.effectAllowed="move";});
    return box;
  }
  function card(code){
    var entry=state.entries[code], m=entry.module, problems=core.issues(code,state);
    var box=el("article","plan-card");box.draggable=true;box.dataset.code=code;
    if(entry.term===-2 && NODES.some(function(n){return n.id===code && n.f;})) box.classList.add("plan-foundation");
    var top=el("div","plan-card-top"), link=el("a",null,code);
    link.href="https://nusmods.com/courses/"+code;link.target="_blank";link.rel="noopener";
    var remove=el("button","plan-remove","×");remove.type="button";remove.setAttribute("aria-label","Remove "+code);
    remove.addEventListener("click",function(){delete state.entries[code];save();});
    top.append(link,el("span",null,m.units+" units"),remove);
    box.append(top,el("div","plan-card-title",m.title));
    problems.filter(function(p){return p.kind==="missing";}).forEach(function(p){
      box.appendChild(el("p","plan-check missing",p.text));
    });
    makeMergeTarget(box,code);
    box.addEventListener("dragstart",function(e){e.dataTransfer.setData("application/x-fa-module",code);e.dataTransfer.setData("text/plain",code);e.dataTransfer.effectAllowed="move";});
    return box;
  }
  function lane(term){
    var box=el("section","plan-lane"), heading=el("div","plan-lane-head");box.dataset.term=term;
    var special=term>=0 && term%4%2===1;
    if(special) box.classList.add("plan-special");
    if(term>=0) box.classList.add("status-"+(state.semesterStatus[term]||"todo"));
    function level(code){var m=code.match(/\d{4}/);return m?Number(m[0]):9999;}
    var entries=Object.keys(state.entries).filter(function(c){return state.entries[c].term===term;}).sort(function(a,b){return term===-2 ? (level(a)-level(b) || a.localeCompare(b)) : a.localeCompare(b);});
    var units=entries.reduce(function(sum,c){return sum+(core.isCounted(state,c)?state.entries[c].module.units:0);},0);
    if(term>=0){
      var title=el("button","plan-term-title",SLOT_NAMES[term%4]);title.type="button";
      var current=state.semesterStatus[term]||"todo";
      title.title="Click to change semester status";
      title.setAttribute("aria-label",SLOT_NAMES[term%4]+" — "+(current==="done"?"done":current==="doing"?"doing":"not done")+". Click to change.");
      title.addEventListener("click",function(){
        var status=state.semesterStatus[term]||"todo";
        state.semesterStatus[term]=status==="todo"?"doing":status==="doing"?"done":"todo";
        save();
      });
      var wrap=el("span","plan-term-wrap");wrap.appendChild(title);
      var legend=el("span","plan-term-legend");legend.setAttribute("role","tooltip");
      [["todo","Not done"],["doing","Doing"],["done","Done"]].forEach(function(pair){
        var item=el("span");item.appendChild(el("i","dot-"+pair[0]));item.appendChild(document.createTextNode(pair[1]));legend.appendChild(item);
      });
      wrap.appendChild(legend);heading.appendChild(wrap);
    } else heading.appendChild(el("h3",null,label(term)));
    heading.appendChild(el("span",null,units+" units"+(term>=0&&units>24?" · heavy load":"")));
    if(term===-2 && entries.some(function(c){return NODES.some(function(n){return n.id===c && n.f;});})){
      var foundationLegend=el("span","plan-foundation-legend");
      foundationLegend.title="Teal cards are foundation core modules";
      foundationLegend.appendChild(el("i"));
      foundationLegend.appendChild(document.createTextNode("Foundation"));
      heading.appendChild(foundationLegend);
    }
    if(term>=0 && units>24) box.classList.add("overloaded");
    if(term>=0 && entries.length && !special){
      var timetable=el("a",null,"Open timetable ↗");timetable.target="_blank";timetable.rel="noopener";
      timetable.href="https://nusmods.com/timetable/sem-"+(term%4===2?2:1)+"/share?"+entries.filter(function(c){return core.isCounted(state,c);}).map(function(c){return encodeURIComponent(c)+"=";}).join("&");
      timetable.title="Choose lesson slots in NUSMods; its timetable uses the currently available academic year";heading.appendChild(timetable);
    }
    box.appendChild(heading);
    if(!entries.length){
      var emptyLane=el("div","plan-empty");emptyLane.setAttribute("aria-label","Drop modules here");box.appendChild(emptyLane);
    }
    var groups=state.groups.filter(function(g){return g.term===term&&g.codes.some(function(c){return state.entries[c];});}).sort(function(a,b){return a.selected.localeCompare(b.selected);});
    var grouped={};groups.forEach(function(g){g.codes.forEach(function(c){grouped[c]=1;});});
    groups.forEach(function(g){var elGroup=groupCard(g);if(elGroup) box.appendChild(elGroup);});
    entries.filter(function(c){return !grouped[c];}).forEach(function(c){box.appendChild(card(c));});
    var laneButton=el("button","plan-add-lane","+ Add modules");laneButton.type="button";
    laneButton.setAttribute("aria-label","Add modules to "+label(term));
    laneButton.addEventListener("click",function(){addTo=term;render();codeInput.focus();});
    box.appendChild(laneButton);
    box.addEventListener("dragover",function(e){
      if(!Array.from(e.dataTransfer.types).includes("application/x-fa-module")) return;
      e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=e.dataTransfer.effectAllowed==="move"?"move":"copy";box.classList.add("dragover");
    });
    box.addEventListener("dragleave",function(e){if(!box.contains(e.relatedTarget)) box.classList.remove("dragover");});
    box.addEventListener("drop",function(e){
      var code=e.dataTransfer.getData("application/x-fa-module");if(!code) return;
      e.preventDefault();e.stopPropagation();box.classList.remove("dragover");
      var separateId=e.dataTransfer.getData("application/x-fa-separate");
      var separated=separateId?state.groups.find(function(g){return g.id===separateId;}):null;
      if(separated&&separated.codes.indexOf(code)>=0){
        separated.codes=separated.codes.filter(function(c){return c!==code;});
        state.entries[code].term=term;
        if(separated.codes.length<=1) state.groups=state.groups.filter(function(g){return g!==separated;});
        else if(separated.selected===code) separated.selected=separated.codes[0];
        save();return;
      }
      var group=core.groupFor(state,code);
      if(group){group.term=term;group.codes.forEach(function(c){state.entries[c].term=term;});save();}
      else if(state.entries[code]){state.entries[code].term=term;save();}
      else add(code,term).catch(report);
    });
    return box;
  }
  function removeYear(year,base){
    var affected=Object.keys(state.entries).filter(function(c){var t=state.entries[c].term;return t>=base && t<base+4;});
    if(affected.length && !window.confirm("Move "+affected.length+" module"+(affected.length===1?"":"s")+" from Y"+(year+1)+" to Unplanned and remove the year?")) return;
    Object.keys(state.entries).forEach(function(code){
      var term=state.entries[code].term;
      if(term>=base && term<base+4) state.entries[code].term=-2;
      else if(term>=base+4) state.entries[code].term=term-4;
    });
    var shifted={};
    Object.keys(state.semesterStatus).forEach(function(key){
      var term=Number(key);
      if(term>=base && term<base+4) return;
      shifted[term>=base+4?term-4:term]=state.semesterStatus[key];
    });
    state.semesterStatus=shifted;
    state.groups=state.groups.filter(function(g){
      if(g.term>=base && g.term<base+4) return false;
      if(g.term>=base+4) g.term-=4;
      return true;
    });
    state.years--;
    save();
  }
  function render(){
    if(addTo>=state.years*4) addTo=-2;
    codeInput.setAttribute("aria-label","Search modules by code or name — press Enter to add to "+label(addTo));
    codeInput.setAttribute("aria-controls","planSearchResults");
    var summary=document.getElementById("planSummary"), total=core.totals(state);summary.replaceChildren();
    [[total.completed,"earned"],[total.doing,"in progress"],[total.scheduled-total.doing,"scheduled"],[total.unplanned,"unplanned"],[total.remaining,"still to plan"]].forEach(function(pair){
      var item=el("span");item.append(el("b",null,pair[0]),document.createTextNode(pair[1]));summary.appendChild(item);
    });
    var progress=document.getElementById("planProgress");progress.max=state.target;progress.value=Math.min(state.target,total.completed);
    var full=progress.value>=state.target;
    if(wasFull===null) wasFull=full;
    else if(full&&!wasFull){wasFull=true;celebrate();}
    else if(!full) wasFull=false;
    var pillarWrap=document.getElementById("planPillars");pillarWrap.replaceChildren();
    core.pillars(state).forEach(function(p){
      var card=el("section","plan-pillar pillar-"+p.key);
      var head=el("div","plan-pillar-head");head.append(el("h3",null,p.name),el("b",null,Math.min(p.units,p.effectiveTarget)+"/"+p.effectiveTarget));
      var bar=el("div","plan-pillar-bar"),fill=el("i");fill.style.width=Math.min(100,p.effectiveTarget?p.units/p.effectiveTarget*100:0)+"%";bar.appendChild(fill);
      if(p.key==="common"){
        var mini=el("div","plan-common-mini");
        core.commonRequirements(state).forEach(function(req){
          var shownUnits=req.fulfilled?req.units:(req.plannedUnits||0);
          var label=req.key==="idcd"?"ID/CD "+Math.min(shownUnits,12)+"/12":req.name;
          var item=el("span","plan-common-item "+(req.fulfilled?"fulfilled":req.planned?"planned":"missing"),label);
          var detail=req.fulfilled?" · done: "+req.codes.join(", "):req.planned?" · planned: "+req.plannedCodes.join(", "):" · not planned";
          item.title=req.key==="idcd"?req.units+"/12 done units · "+req.plannedUnits+"/12 planned units · "+req.idCount+" ID · "+req.cdCount+" CD":req.name+detail;
          mini.appendChild(item);
        });
        card.append(head,bar,mini);
      } else if(p.key==="ue"){
        var creditLabel=el("label","plan-ue-toggle");
        var creditInput=el("input");creditInput.type="checkbox";creditInput.checked=(state.ueCredit||0)>=20;
        creditInput.title="Apply 20 advanced-standing units to Unrestricted Electives";
        creditInput.addEventListener("change",function(){state.ueCredit=creditInput.checked?20:0;save();});
        creditLabel.append(creditInput,document.createTextNode("20 UE credit"));card.append(head,bar,creditLabel);
      } else {
        card.append(head,bar);
      }
      pillarWrap.appendChild(card);
    });
    document.getElementById("plannerBuckets").replaceChildren(lane(-1),lane(-2));
    var semesters=document.getElementById("plannerSemesters");semesters.replaceChildren();
    for(var year=0;year<state.years;year++){
      var group=el("section","plan-year"), head=el("div","plan-year-head");
      var base=year*4;
      var yearEntries=Object.values(state.entries).filter(function(e){return e.term>=base && e.term<base+4;});
      var units=yearEntries.reduce(function(sum,e){return sum+(core.isCounted(state,Object.keys(state.entries).find(function(c){return state.entries[c]===e;}))?e.module.units:0);},0);
      head.append(el("h3",null,"Y"+(year+1)),el("span","plan-year-units",units+" units"));
      if(state.years>1){
        var remove=el("button","plan-year-remove","×");remove.type="button";
        remove.title="Remove Y"+(year+1);remove.setAttribute("aria-label","Remove Y"+(year+1));
        remove.addEventListener("click",(function(y,b){return function(){removeYear(y,b);};})(year,base));
        head.appendChild(remove);
      }
      var terms=el("div","plan-year-terms");
      var first=el("div","plan-term-column"),second=el("div","plan-term-column");
      first.append(lane(base),lane(base+1));
      second.append(lane(base+2),lane(base+3));
      terms.append(first,second);
      group.append(head,terms);semesters.appendChild(group);
    }
    var addButton=el("button","plan-year-add","+ Year");addButton.type="button";
    addButton.setAttribute("aria-label","Add another academic year");
    addButton.addEventListener("click",addYear);
    semesters.appendChild(addButton);
    document.getElementById("exportPlanner").disabled=!Object.keys(state.entries).length;
  }
  var foundationPending=null;
  function slotFoundations(){
    if(foundationPending) return foundationPending;
    var foundations=NODES.filter(function(n){return n.f;}), fset=new Set(foundations.map(function(n){return n.id;}));
    var missing=foundations.map(function(n){return n.id;}).filter(function(c){return !state.entries[c] || state.entries[c].term===-2;});
    if(!missing.length) return Promise.resolve(0);
    foundationPending=(async function(){
      var loaded={},failed=[];
      for(var offset=0;offset<missing.length;offset+=5){
        await Promise.all(missing.slice(offset,offset+5).map(async function(code){
          try{loaded[code]=await metadata(code);}catch(error){failed.push(code);}
        }));
      }
      if(failed.length) throw new Error("Could not load "+failed.join(", ")+".");
      missing.forEach(function(code){state.entries[code]={term:-2,module:loaded[code]};});
      var deps={};
      foundations.forEach(function(n){deps[n.id]=EDGES.filter(function(e){return e[1]===n.id && fset.has(e[0]);}).map(function(e){return e[0];});});
      var depth={};
      function getDepth(code){
        if(depth[code]!==undefined) return depth[code];
        depth[code]=0;
        deps[code].forEach(function(p){depth[code]=Math.max(depth[code],getDepth(p)+1);});
        return depth[code];
      }
      var assigned={};
      foundations.forEach(function(n){
        var e=state.entries[n.id];
        if(e && e.term===-1) assigned[n.id]=-1;
        else if(e && e.term>=0) assigned[n.id]=e.term;
      });
      function termUnits(term){return Object.keys(state.entries).filter(function(c){return state.entries[c].term===term&&core.isCounted(state,c);}).reduce(function(sum,c){return sum+state.entries[c].module.units;},0);}
      missing.sort(function(a,b){return getDepth(a)-getDepth(b) || a.localeCompare(b);});
      missing.forEach(function(code){
        var m=loaded[code],term=null;
        for(var candidate=0;candidate<state.years*2;candidate++){
          var year=Math.floor(candidate/2),slot=candidate%2?2:0,candidateTerm=year*4+slot;
          var ready=deps[code].every(function(p){return assigned[p]!==undefined && assigned[p]<candidateTerm;});
          if(ready && termUnits(candidateTerm)+m.units<=20){term=candidateTerm;break;}
        }
        if(term===null){
          state.years++;
          term=(state.years-1)*4;
          while(termUnits(term)+m.units>20) term+=2;
        }
        state.entries[code].term=term;assigned[code]=term;
      });
      save();return missing.length;
    })().finally(function(){foundationPending=null;});
    return foundationPending;
  }
  document.getElementById("addFoundations").addEventListener("click",async function(){
    var button=this;button.disabled=true;
    try{var count=await slotFoundations();status.textContent=count?"Foundations slotted.":"All foundations are already planned.";}
    catch(error){report(error);}
    button.disabled=false;
  });
  var importButton=document.getElementById("importPlanner"), planFile=document.getElementById("planFile");
  importButton.addEventListener("click",function(){planFile.click();});
  planFile.addEventListener("change",async function(){
    var file=planFile.files[0];if(!file) return;
    importButton.disabled=true;
    var before=revision;
    try{
      if(file.size>2000000) throw new Error("Planner file is too large.");
      var parsed=core.importSlots(JSON.parse(await file.text())), entries={};
      status.textContent="Loading imported modules…";
      for(var offset=0;offset<parsed.slots.length;offset+=6){
        await Promise.all(parsed.slots.slice(offset,offset+6).map(async function(slot){
          var m;
          try{m=await metadata(slot.code);}
          catch(error){
            if(!slot.custom) throw error;
            m={title:slot.code,units:slot.custom.moduleCredit,prereqTree:null,prerequisite:"",preclusion:"",corequisite:"",semesters:[],dataUnavailable:true};
          }
          if(slot.custom) m=Object.assign({},m,{title:slot.custom.title||m.title,units:slot.custom.moduleCredit});
          entries[slot.code]={term:slot.term,module:m};
        }));
      }
      if(before!==revision) throw new Error("Your plan changed during import. Please retry.");
      if(Object.keys(state.entries).length && !window.confirm("Replace your current plan with this file? Export your current plan first if you want to keep it.")){
        status.textContent="Import cancelled.";return;
      }
      state={version:2,startYear:parsed.startYear,years:parsed.years,target:160,semesterStatus:{},entries:entries,groups:[],groupSeq:1,ueCredit:0};
      addTo=-2;save();
      status.textContent="Imported "+parsed.slots.length+" modules.";
    }catch(error){report(error);}
    finally{importButton.disabled=false;planFile.value="";}
  });
  document.getElementById("exportPlanner").addEventListener("click",function(){
    var data=JSON.stringify(core.exportPlan(state),null,2);
    var url=URL.createObjectURL(new Blob([data],{type:"application/json"}));
    var link=el("a");link.href=url;link.download="nusmods_planner.json";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
    status.textContent="Exported. Upload the file in NUSMods Planner.";
  });
  render();syncGraph();
  if(!Object.keys(state.entries).length) slotFoundations().catch(function(){});
})();
