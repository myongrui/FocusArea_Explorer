/**
 * CS Focus Area Explorer — UI logic.
 * Consumes the globals AREAS / NODES / EDGES defined in data.js.
 *
 * Pipeline on every change:
 *   computeVisible()  which modules to show (active areas' primaries + the
 *                     transitive prerequisite closure of those primaries)
 *   layout()          longest-path tiering (x) + barycenter ordering (y)
 *   update()          reconcile DOM nodes, tier headers, stats
 *   animateTo()       glide nodes to target positions; edges redraw each frame
 *
 * No framework, no dependencies — DOM <div> nodes + inline <svg> edges.
 */
(function(){
  "use strict";

  var isDark = function(){
    var t = document.documentElement.getAttribute("data-theme");
    if(t==="dark") return true; if(t==="light") return false;
    return matchMedia("(prefers-color-scheme: dark)").matches;
  };

  // ---- indexes derived from the data ----
  var areaByKey = {}; AREAS.forEach(function(a){ areaByKey[a.k]=a; });
  var nodeById = {}; NODES.forEach(function(n){ nodeById[n.id]=n; });
  var FND = NODES.filter(function(n){return n.f;}).map(function(n){return n.id;});

  var inadj={}, outadj={};
  NODES.forEach(function(n){ inadj[n.id]=[]; outadj[n.id]=[]; });
  EDGES.forEach(function(e){ inadj[e[1]].push(e[0]); outadj[e[0]].push(e[1]); });

  // ---- mutable UI state ----
  var active = {};           // set of active area keys
  var cur = {};              // id -> animated {x,y}
  var nodeEls = {};          // id -> element
  var visIds = [], visEdges = [];
  var pinned = null, hovered = null;
  var fitMode = false, lastW = 0, lastH = 0;   // fit-to-view scaling

  // ---- geometry constants ----
  var BW=158, BH=40, STEPX=210, STEPY=54, PADX=26, PADY=30;

  var stage=document.getElementById("stage"),
      canvas=document.getElementById("canvas"),
      nodeLayer=document.getElementById("nodeLayer"),
      svg=document.getElementById("edges"),
      empty=document.getElementById("empty"),
      drophint=document.getElementById("drophint"),
      scrollEl=document.getElementById("scroll");

  function areaColor(k){ return isDark()? areaByKey[k].dark : areaByKey[k].light; }

  // ---------- palette: user-defined categories ----------
  // Categories are created by the user at runtime and persisted in
  // localStorage. `assign` maps an area key -> category id; areas with no (or a
  // stale) assignment fall into the "Uncategorized" pool. Dragging a chip onto
  // a category files it there; dragging onto the canvas activates it.
  var LS_KEY="csfae:categories:v1";
  var categories=[];   // [{ id, name }]
  var assign={};       // areaKey -> categoryId
  var catSeq=1;

  function loadCats(){
    try{
      var o=JSON.parse(localStorage.getItem(LS_KEY));
      if(o){ categories=o.categories||[]; assign=o.assign||{}; catSeq=o.seq||(categories.length+1); }
    }catch(e){/* localStorage unavailable (e.g. some file:// contexts) — in-memory only */}
  }
  function saveCats(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({categories:categories, assign:assign, seq:catSeq})); }catch(e){}
  }
  function catExists(id){ return categories.some(function(c){return c.id===id;}); }
  function areasIn(catId){
    return AREAS.filter(function(a){
      var c=assign[a.k];
      return catId===null ? (!c || !catExists(c)) : c===catId;
    });
  }

  function chipEl(a){
    var chip=document.createElement("div");
    chip.className="chip"+(active[a.k]?" on":"");
    chip.setAttribute("draggable","true"); chip.dataset.k=a.k;
    chip.style.setProperty("--c", "var(--a-"+a.k+")");
    chip.innerHTML='<span class="dot"></span><span class="nm">'+a.name+'</span><span class="ct">'+a.prim.length+'</span><button class="x" title="remove from canvas" aria-label="remove">&times;</button>';
    chip.addEventListener("click", function(e){
      if(e.target.classList.contains("x")){ setActive(a.k,false); return; }
      toggle(a.k);
    });
    chip.addEventListener("dragstart", function(e){
      chip.classList.add("drag"); dragKey=a.k;
      e.dataTransfer.setData("text/plain", a.k);
      e.dataTransfer.effectAllowed="copyMove";
    });
    chip.addEventListener("dragend", function(){ chip.classList.remove("drag"); stage.classList.remove("dropok"); });
    return chip;
  }

  // a palette drop zone that files the dragged area into `catId` (null = un-file)
  function makeDropTarget(el, catId){
    el.addEventListener("dragover", function(e){ if(!dragKey) return; e.preventDefault(); e.stopPropagation(); el.classList.add("dragover"); });
    el.addEventListener("dragleave", function(e){ if(!el.contains(e.relatedTarget)) el.classList.remove("dragover"); });
    el.addEventListener("drop", function(e){
      if(!dragKey) return;
      e.preventDefault(); e.stopPropagation(); el.classList.remove("dragover");
      if(catId===null) delete assign[dragKey]; else assign[dragKey]=catId;
      saveCats(); renderPalette();
    });
  }

  function renderPalette(){
    var body=document.getElementById("palBody");
    body.innerHTML="";

    // Uncategorized pool (also a drop target, so chips can be un-filed)
    var pool=document.createElement("div"); pool.className="cat";
    if(categories.length){
      var ph=document.createElement("div"); ph.className="cat-hd";
      ph.innerHTML='<span class="cat-name" style="cursor:default">Uncategorized</span>';
      pool.appendChild(ph);
    }
    var poolBody=document.createElement("div");
    var uncat=areasIn(null);
    uncat.forEach(function(a){ poolBody.appendChild(chipEl(a)); });
    if(!uncat.length && categories.length){
      var pe=document.createElement("div"); pe.className="cat-empty"; pe.textContent="everything's filed"; poolBody.appendChild(pe);
    }
    pool.appendChild(poolBody);
    makeDropTarget(pool, null);
    body.appendChild(pool);

    // User categories
    categories.forEach(function(cat){
      var box=document.createElement("div"); box.className="cat box"; box.dataset.id=cat.id;
      var hd=document.createElement("div"); hd.className="cat-hd";
      var name=document.createElement("span");
      name.className="cat-name"; name.contentEditable="true"; name.spellcheck=false; name.textContent=cat.name;
      name.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); name.blur(); } });
      name.addEventListener("blur", function(){ var v=name.textContent.trim()||"Untitled"; name.textContent=v; cat.name=v; saveCats(); });
      var del=document.createElement("button"); del.className="cat-del"; del.title="delete category"; del.innerHTML="&times;";
      del.addEventListener("click", function(){
        Object.keys(assign).forEach(function(k){ if(assign[k]===cat.id) delete assign[k]; });
        categories=categories.filter(function(c){return c.id!==cat.id;});
        saveCats(); renderPalette();
      });
      hd.appendChild(name); hd.appendChild(del); box.appendChild(hd);

      var cb=document.createElement("div");
      var mine=areasIn(cat.id);
      mine.forEach(function(a){ cb.appendChild(chipEl(a)); });
      if(!mine.length){
        var ce=document.createElement("div"); ce.className="cat-empty"; ce.textContent="drop focus areas here"; cb.appendChild(ce);
      }
      box.appendChild(cb);
      makeDropTarget(box, cat.id);
      body.appendChild(box);
    });
  }

  // lightweight: just sync .on state on existing chips (no full rebuild)
  function refreshActive(){
    document.querySelectorAll(".chip").forEach(function(c){ c.classList.toggle("on", !!active[c.dataset.k]); });
  }

  function addCategory(){
    var id="c"+(catSeq++);
    categories.push({id:id, name:"New category"});
    saveCats(); renderPalette();
    var boxes=document.querySelectorAll(".cat.box"), last=boxes[boxes.length-1];
    if(last){
      var nm=last.querySelector(".cat-name"); if(!nm) return;
      nm.focus();
      var r=document.createRange(); r.selectNodeContents(nm);
      var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  }

  function toggle(k){ setActive(k, !active[k]); }
  function setActive(k, on){
    if(on) active[k]=true; else delete active[k];
    refreshActive(); update(true);
  }

  // ---------- drag-drop onto the stage ----------
  var dragKey=null;
  stage.addEventListener("dragover", function(e){
    e.preventDefault(); e.dataTransfer.dropEffect="copy";
    stage.classList.add("dropok");
    if(dragKey) drophint.textContent="Drop to add "+areaByKey[dragKey].name;
  });
  stage.addEventListener("dragleave", function(e){
    if(!stage.contains(e.relatedTarget)) stage.classList.remove("dropok");
  });
  stage.addEventListener("drop", function(e){
    e.preventDefault(); stage.classList.remove("dropok");
    var k=e.dataTransfer.getData("text/plain")||dragKey;
    if(k && areaByKey[k]) setActive(k,true);
  });
  document.addEventListener("dragstart", function(e){ var c=e.target.closest&&e.target.closest(".chip"); dragKey=c?c.dataset.k:null; });
  document.addEventListener("dragend", function(){ dragKey=null; });

  document.getElementById("btnAddCat").addEventListener("click", addCategory);
  document.getElementById("btnFit").addEventListener("click", function(){
    fitMode=!fitMode;
    this.classList.toggle("on", fitMode);
    this.textContent = fitMode? "100%" : "Fit";
    applyFit();
  });
  window.addEventListener("resize", function(){ if(fitMode) applyFit(); });
  document.getElementById("btnAll").addEventListener("click", function(){
    AREAS.forEach(function(a){ active[a.k]=true; }); refreshActive(); update(true);
  });
  document.getElementById("btnClear").addEventListener("click", function(){
    active={}; refreshActive(); update(true);
  });

  // ---------- visibility ----------
  // Active areas' primaries, plus the transitive prerequisite closure of those
  // primaries (so foundations and support/bridge modules pull in automatically).
  // Empty selection shows only the foundation core as a teaser.
  function computeVisible(){
    var keys=Object.keys(active);
    if(keys.length===0){ return {ids:FND.slice(), edges: EDGES.filter(function(e){return nodeById[e[0]].f&&nodeById[e[1]].f;}) }; }
    var vis={};
    keys.forEach(function(k){ areaByKey[k].prim.forEach(function(id){ vis[id]=1; }); });
    var stack=Object.keys(vis);
    while(stack.length){ var n=stack.pop(); inadj[n].forEach(function(p){ if(!vis[p]){ vis[p]=1; stack.push(p);} }); }
    var ids=Object.keys(vis);
    var ve=EDGES.filter(function(e){ return vis[e[0]]&&vis[e[1]]; });
    return {ids:ids, edges:ve};
  }

  // A module's role depends on the CURRENT selection:
  //   fnd      foundation common core
  //   support  visible only as a prerequisite; its own area isn't active
  //   primary  primary of exactly one active area  (area-coloured)
  //   shared   primary of several active areas      (gradient)
  function roleOf(id){
    var n=nodeById[id];
    if(n.f) return {k:"fnd", areas:[]};
    var act=n.a.filter(function(x){return active[x];});
    if(act.length===0) return {k:"support", areas:[]};
    if(act.length===1) return {k:"primary", areas:act};
    return {k:"shared", areas:act};
  }

  // ---------- layout: longest-path tiers (x) + barycenter ordering (y) ----------
  function layout(ids, ve){
    var vin={}, vout={};
    ids.forEach(function(i){ vin[i]=[]; vout[i]=[]; });
    ve.forEach(function(e){ vin[e[1]].push(e[0]); vout[e[0]].push(e[1]); });

    var layer={}, tmp={};
    function lay(n){
      if(n in layer) return layer[n];
      if(tmp[n]) return 0;                 // cycle guard (data is a DAG)
      tmp[n]=1;
      var v=0; vin[n].forEach(function(p){ v=Math.max(v, lay(p)+1); });
      layer[n]=v; return v;
    }
    ids.forEach(lay);
    var maxL=0; ids.forEach(function(i){ maxL=Math.max(maxL, layer[i]); });

    var tiers=[]; for(var i=0;i<=maxL;i++) tiers.push([]);
    ids.forEach(function(i){ tiers[layer[i]].push(i); });

    // seed order: cluster by first active area, supports/foundations last
    function grpKey(id){
      var r=roleOf(id);
      if(r.k==="primary"||r.k==="shared") return r.areas[0];
      return "~"+r.k;
    }
    tiers.forEach(function(t){ t.sort(function(a,b){ var ga=grpKey(a),gb=grpKey(b); return ga<gb?-1:ga>gb?1:(a<b?-1:1); }); });

    function pos(t){ var m={}; t.forEach(function(id,i){m[id]=i;}); return m; }
    function bary(id, adj, idx){
      var ns=adj[id]; if(!ns.length) return 1e6+id.charCodeAt(2);
      var s=0,c=0; ns.forEach(function(x){ if(x in idx){ s+=idx[x]; c++; } });
      return c? s/c : 1e6;
    }
    // alternate down/up passes to reduce edge crossings
    for(var s=0;s<10;s++){
      if(s%2===0){
        for(var l=1;l<=maxL;l++){
          var pi=pos(tiers[l-1]);
          tiers[l].sort(function(a,b){ return bary(a,vin,pi)-bary(b,vin,pi); });
        }
      } else {
        for(var l2=maxL-1;l2>=0;l2--){
          var ni=pos(tiers[l2+1]);
          tiers[l2].sort(function(a,b){ return bary(a,vout,ni)-bary(b,vout,ni); });
        }
      }
    }

    var maxRows=0; tiers.forEach(function(t){ maxRows=Math.max(maxRows,t.length); });
    var H = Math.max(maxRows*STEPY + PADY*2, 320);
    var target={};
    tiers.forEach(function(t, li){
      var startY = (H - t.length*STEPY)/2;
      t.forEach(function(id, ri){
        target[id] = { x: PADX + li*STEPX, y: startY + ri*STEPY };
      });
    });
    var W = PADX*2 + maxL*STEPX + BW;
    return {target:target, W:W, H:H, layer:layer, maxL:maxL, tiers:tiers};
  }

  // ---------- render ----------
  var TIER_NAMES=["Foundation","Gateway","Core","Advanced","Specialised","Capstone","Capstone","Capstone"];
  function update(animate){
    var vis=computeVisible();
    visIds=vis.ids; visEdges=vis.edges;
    empty.style.display = Object.keys(active).length? "none":"flex";

    var lay=layout(visIds, visEdges);
    canvas.style.width=lay.W+"px"; canvas.style.height=lay.H+"px";
    svg.setAttribute("width",lay.W); svg.setAttribute("height",lay.H);
    lastW=lay.W; lastH=lay.H;

    document.getElementById("sN").textContent=visIds.length;
    document.getElementById("sE").textContent=visEdges.length;
    document.getElementById("sA").textContent=Object.keys(active).length;

    // tier headers
    [].slice.call(canvas.querySelectorAll(".tier-hd")).forEach(function(e){e.remove();});
    for(var li=0; li<=lay.maxL; li++){
      if(!lay.tiers[li] || !lay.tiers[li].length) continue;
      var hd=document.createElement("div"); hd.className="tier-hd";
      hd.style.left=(PADX + li*STEPX + BW/2)+"px";
      hd.textContent = TIER_NAMES[li] || ("Tier "+li);
      canvas.appendChild(hd);
    }

    // reconcile node elements
    var want={}; visIds.forEach(function(id){want[id]=1;});
    Object.keys(nodeEls).forEach(function(id){
      if(!want[id]){
        var el=nodeEls[id]; el.classList.add("faded");
        setTimeout((function(el){return function(){ if(el.parentNode) el.parentNode.removeChild(el);};})(el),260);
        delete nodeEls[id]; delete cur[id];
      }
    });
    visIds.forEach(function(id){
      if(!nodeEls[id]) createNode(id, lay.target[id]);
      styleNode(id);
    });

    animateTo(lay.target, animate?380:0);
    applyFit();
  }

  // ---------- fit-to-view: scale the whole canvas to fit the visible pane ----------
  // In fit mode the pane stops scrolling (overflow hidden) and the canvas is
  // scaled by a single factor so the entire tree is visible; nodes + SVG edges
  // are children of .canvas, so one transform scales them together.
  function applyFit(){
    if(!fitMode){ scrollEl.classList.remove("fit"); canvas.style.transform="none"; return; }
    scrollEl.classList.add("fit");
    var paneW=scrollEl.clientWidth-8, paneH=scrollEl.clientHeight-8;
    var s=Math.min(paneW/lastW, paneH/lastH, 1);
    if(!isFinite(s) || s<=0) s=1;
    canvas.style.transform="scale("+s+")";   // origin 0,0 set in CSS
  }

  function createNode(id, tgt){
    var n=nodeById[id];
    var el=document.createElement("div");
    el.className="node new";
    el.dataset.id=id;
    var url="https://nusmods.com/courses/"+id;
    el.innerHTML='<div class="row1"><span class="badge"></span>'+
      '<a class="code" href="'+url+'" target="_blank" rel="noopener">'+id+'</a>'+
      '<span class="role"></span></div>'+
      '<div class="ttl">'+n.t+'</div>';
    el.style.transform='translate('+tgt.x+'px,'+tgt.y+'px)';
    cur[id]={x:tgt.x, y:tgt.y};
    el.addEventListener("mouseenter", function(){ hovered=id; applyHighlight(); });
    el.addEventListener("mouseleave", function(){ hovered=null; applyHighlight(); });
    el.addEventListener("click", function(e){
      if(e.target.classList.contains("code")) return;   // let the link work
      pinned = (pinned===id)? null : id; applyHighlight();
    });
    nodeLayer.appendChild(el);
    nodeEls[id]=el;
    setTimeout(function(){ el.classList.remove("new"); }, 360);
  }

  function styleNode(id){
    var el=nodeEls[id]; if(!el) return;
    var r=roleOf(id);
    el.classList.remove("k-fnd","k-support","k-primary","k-shared");
    el.style.removeProperty("--c"); el.style.removeProperty("--grad");
    var roleEl=el.querySelector(".role");
    if(r.k==="fnd"){ el.classList.add("k-fnd"); roleEl.textContent="CORE"; }
    else if(r.k==="support"){ el.classList.add("k-support"); roleEl.textContent="SUPPORT"; }
    else if(r.k==="primary"){ el.classList.add("k-primary"); el.style.setProperty("--c", areaColor(r.areas[0])); roleEl.textContent="PRIMARY"; }
    else {
      el.classList.add("k-shared");
      var cols=r.areas.map(areaColor);
      var stops=cols.map(function(c,i){ var a=Math.round(i/cols.length*100), b=Math.round((i+1)/cols.length*100); return c+" "+a+"%, "+c+" "+b+"%"; }).join(", ");
      el.style.setProperty("--grad","linear-gradient(180deg, "+stops+")");
      el.style.setProperty("--c", cols[0]);
      roleEl.textContent=r.areas.length+" AREAS";
    }
  }

  // ---------- edges ----------
  function edgePath(s,t){
    var a=cur[s], b=cur[t]; if(!a||!b) return "";
    var x1=a.x+BW, y1=a.y+BH/2, x2=b.x, y2=b.y+BH/2;
    var dx=Math.max(40,(x2-x1)*0.5);
    return "M"+x1+" "+y1+" C"+(x1+dx)+" "+y1+" "+(x2-dx)+" "+y2+" "+x2+" "+y2;
  }
  function drawEdges(){
    var chain=highlightSet();
    var buf="";
    for(var i=0;i<visEdges.length;i++){
      var e=visEdges[i], s=e[0], t=e[1], alt=e[2];
      var col="var(--edge)", w=1.5, op=0.55;
      var rt=roleOf(t);
      if(rt.k==="primary"||rt.k==="shared") col=areaColor(rt.areas[0]);
      var on = chain && (chain[s]&&chain[t]);
      if(chain){ op = on? 0.95 : 0.06; if(on) w=2.3; }
      buf += '<path d="'+edgePath(s,t)+'" stroke="'+col+'" stroke-width="'+w+'" opacity="'+op+'"'+(alt?' stroke-dasharray="4 3"':'')+'></path>';
    }
    svg.innerHTML=buf;
  }

  // ---------- highlight: full up + downstream chain of the focused node ----------
  function highlightSet(){
    var focus = hovered || pinned;
    if(!focus || !nodeById[focus]) return null;
    var vset={}; visIds.forEach(function(i){vset[i]=1;});
    var set={}; set[focus]=1;
    var st=[focus], n;
    while(st.length){ n=st.pop(); inadj[n].forEach(function(p){ if(vset[p]&&!set[p]){set[p]=1; st.push(p);} }); }
    st=[focus];
    while(st.length){ n=st.pop(); outadj[n].forEach(function(c){ if(vset[c]&&!set[c]){set[c]=1; st.push(c);} }); }
    return set;
  }
  function applyHighlight(){
    var chain=highlightSet();
    visIds.forEach(function(id){
      var el=nodeEls[id]; if(!el) return;
      if(!chain){ el.classList.remove("faded","hot"); return; }
      if(chain[id]){ el.classList.remove("faded"); el.classList.toggle("hot", id===(hovered||pinned)); }
      else { el.classList.add("faded"); el.classList.remove("hot"); }
    });
    drawEdges();
  }

  // ---------- animation: glide nodes to targets; edges follow each frame ----------
  var raf=null;
  function animateTo(target, dur){
    if(raf) cancelAnimationFrame(raf);
    var from={};
    Object.keys(target).forEach(function(id){ from[id]= cur[id]? {x:cur[id].x,y:cur[id].y} : {x:target[id].x,y:target[id].y}; });
    var t0=performance.now();
    function frame(now){
      var k = dur<=0?1:Math.min(1,(now-t0)/dur);
      var e = 1-Math.pow(1-k,3);   // ease-out cubic
      Object.keys(target).forEach(function(id){
        var f=from[id], tg=target[id];
        var x=f.x+(tg.x-f.x)*e, y=f.y+(tg.y-f.y)*e;
        cur[id]={x:x,y:y};
        var el=nodeEls[id]; if(el) el.style.transform='translate('+x+'px,'+y+'px)';
      });
      drawEdges();
      if(k<1) raf=requestAnimationFrame(frame); else raf=null;
    }
    raf=requestAnimationFrame(frame);
  }

  // ---------- re-theme on OS / toggle change ----------
  var restyle=function(){ Object.keys(nodeEls).forEach(styleNode); drawEdges(); };
  new MutationObserver(restyle).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", restyle);

  // ---------- boot ----------
  loadCats(); renderPalette(); update(false);
})();
