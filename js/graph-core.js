/**
 * Pure graph algorithms for the CS Focus Area Explorer.
 *
 * Extracted from app.js so the prerequisite-closure, layout, and highlight
 * logic can be unit-tested in plain Node. The DOM layer in app.js stays in
 * charge of state (which areas are active, what is pinned/hovered) and passes
 * it in as plain data — nothing here touches the DOM.
 *
 * Mirrors the export pattern of planner-core.js: assigns to module.exports when
 * running under Node, otherwise attaches to globalThis.GraphCore.
 */
(function(root){
  "use strict";

  // in/out adjacency from a list of node ids + EDGES [source, target].
  function buildIndexes(nodeIds, edges){
    var inadj={}, outadj={};
    nodeIds.forEach(function(id){ inadj[id]=[]; outadj[id]=[]; });
    edges.forEach(function(e){ inadj[e[1]].push(e[0]); outadj[e[0]].push(e[1]); });
    return {inadj:inadj, outadj:outadj};
  }

  // A module's role depends on the current selection:
  //   fnd      foundation common core
  //   support  visible only as a prerequisite; its own area isn't active
  //   primary  primary of exactly one active area
  //   shared   primary of several active areas
  function roleOf(nodeById, active, id){
    var n=nodeById[id];
    if(n.f) return {k:"fnd", areas:[]};
    var act=n.a.filter(function(x){return active[x];});
    if(act.length===0) return {k:"support", areas:[]};
    if(act.length===1) return {k:"primary", areas:act};
    return {k:"shared", areas:act};
  }

  // Foundations + active areas' primaries + their transitive prerequisite
  // closure (or just the foundation subgraph when nothing is active).
  function computeVisible(opts){
    var active=opts.active, areaByKey=opts.areaByKey, nodeById=opts.nodeById,
        inadj=opts.inadj, edges=opts.edges, fnd=opts.fnd,
        planFocus=opts.planFocus, planned=opts.planned, csOnly=opts.csOnly;
    var keys=Object.keys(active);
    var focusIds=Array.from(planFocus).filter(function(id){return nodeById[id];});
    var plannedIds=Array.from(planned).filter(function(id){return nodeById[id];});
    if(keys.length===0 && !focusIds.length && !plannedIds.length){
      return {ids:fnd.slice(), edges: edges.filter(function(e){return nodeById[e[0]].f&&nodeById[e[1]].f;}) };
    }
    var vis={};
    fnd.forEach(function(id){ vis[id]=1; });
    focusIds.forEach(function(id){ vis[id]=1; });
    plannedIds.forEach(function(id){ vis[id]=1; });
    keys.forEach(function(k){ areaByKey[k].prim.forEach(function(id){ vis[id]=1; }); });
    var stack=Object.keys(vis);
    while(stack.length){
      var n=stack.pop();
      inadj[n].forEach(function(p){
        if(csOnly && !nodeById[p].f && (!p.startsWith("CS") || p==="CS1010" || p==="CS2113")) return;
        if(!vis[p]){ vis[p]=1; stack.push(p); }
      });
    }
    var ids=Object.keys(vis);
    var ve=edges.filter(function(e){ return vis[e[0]]&&vis[e[1]]; });
    return {ids:ids, edges:ve};
  }

  // Longest-path tiering (x) + barycenter ordering (y). roleOfFn orders nodes
  // within a tier by clustering on their first active area.
  function layout(ids, ve, roleOfFn){
    var vin={}, vout={};
    ids.forEach(function(i){ vin[i]=[]; vout[i]=[]; });
    ve.forEach(function(e){ vin[e[1]].push(e[0]); vout[e[0]].push(e[1]); });

    var layer={}, tmp={};
    function lay(n){
      if(n in layer) return layer[n];
      if(tmp[n]) return 0;
      tmp[n]=1;
      var v=0; vin[n].forEach(function(p){ v=Math.max(v, lay(p)+1); });
      layer[n]=v; return v;
    }
    ids.forEach(lay);
    var maxL=0; ids.forEach(function(i){ maxL=Math.max(maxL, layer[i]); });

    var tiers=[]; for(var i=0;i<=maxL;i++) tiers.push([]);
    ids.forEach(function(i){ tiers[layer[i]].push(i); });

    function grpKey(id){
      var r=roleOfFn(id);
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
    var H = Math.max(maxRows*68 + 60, 320);
    var target={};
    tiers.forEach(function(t, li){
      var startY = (H - t.length*68)/2;
      t.forEach(function(id, ri){
        target[id] = { x: 26 + li*210, y: startY + ri*68 };
      });
    });
    var W = 26*2 + maxL*210 + 158;
    return {target:target, W:W, H:H, layer:layer, maxL:maxL, tiers:tiers};
  }

  // Full "up + downstream" set of a focused/pinned node. Returns null when there
  // is nothing to highlight.
  function highlightSet(opts){
    var focus=opts.focus, visIds=opts.visIds, inadj=opts.inadj, outadj=opts.outadj;
    if(!focus.length) return null;
    var vset={}; visIds.forEach(function(i){vset[i]=1;});
    var set={};
    function trace(adj){
      var seen={}, stack=focus.slice();
      while(stack.length){
        var n=stack.pop();
        if(seen[n]) continue;
        seen[n]=1; set[n]=1;
        adj[n].forEach(function(next){ if(vset[next]&&!seen[next]) stack.push(next); });
      }
    }
    trace(inadj); trace(outadj);
    return set;
  }

  var api={buildIndexes:buildIndexes, roleOf:roleOf, computeVisible:computeVisible, layout:layout, highlightSet:highlightSet};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.GraphCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
