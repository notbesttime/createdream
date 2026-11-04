(function (global) {
  "use strict";

  const DEFINITIONS = [
    { group: "水系与地形", type: "lake", label: "湖面", w: 420, h: 290, color: "#8dbec5", drawMode: true },
    { group: "水系与地形", type: "field", label: "田径场", w: 330, h: 220, color: "#829b75" },
    { group: "建筑", type: "brick2", label: "砖楼(左)", w: 250, h: 183, color: "#9a6d58", src: "assets/brick-left.webp" },
    { group: "建筑", type: "brick", label: "砖楼(右)", w: 235, h: 183, color: "#9a6d58", src: "assets/brick-right.webp" },
    { group: "建筑", type: "round", label: "圆形楼", w: 240, h: 156, color: "#f2f1ea", src: "assets/round.webp" },
    { group: "建筑", type: "newbuilding", label: "新楼", w: 280, h: 184, color: "#9a6d58", src: "assets/new-building.webp" },
    { group: "建筑", type: "glasshouse", label: "玻璃房", w: 280, h: 208, color: "#83b5bd", src: "assets/glass-house.webp" },
    { group: "建筑", type: "roundside", label: "圆形楼·侧视", w: 240, h: 147, color: "#f2f1ea", src: "assets/round-side.webp" },
    { group: "建筑", type: "brickbacka", label: "砖楼·背面A", w: 235, h: 176, color: "#9a6d58", src: "assets/brick-back-a.webp" },
    { group: "建筑", type: "brickbackb", label: "砖楼·背面B", w: 235, h: 175, color: "#9a6d58", src: "assets/brick-back-b.webp" },
    { group: "道路与桥梁", type: "road", label: "道路", w: 320, h: 46, color: "#d8cfb9", drawMode: true },
    { group: "道路与桥梁", type: "bridge", label: "木桥", w: 250, h: 62, color: "#a88d69", drawMode: true },
    { group: "绿化", type: "tree", label: "树木", w: 78, h: 90, color: "#778e68", src: "assets/tree.webp" },
    { group: "绿化", type: "garden", label: "绿地", w: 205, h: 145, color: "#a3b47f" },
    { group: "自绘", type: "sketch", label: "自绘区域", w: 210, h: 150, color: "#a8b889", drawMode: true },
    { group: "自绘", type: "custompng", label: "自定义png贴图", w: 200, h: 160, color: "#c9bcd8", upload: true }
  ];

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function smoothClosed(ctx, pts) {
    if (!pts || pts.length < 3) return;
    const mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const start = mid(pts[pts.length - 1], pts[0]);
    ctx.beginPath(); ctx.moveTo(start.x, start.y);
    for (let i = 0; i < pts.length; i++) {
      const next = mid(pts[i], pts[(i + 1) % pts.length]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, next.x, next.y);
    }
    ctx.closePath();
  }

  function smoothOpen(ctx, pts) {
    if (!pts || !pts.length) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) return;
    for (let i = 1; i < pts.length - 1; i++) {
      const next = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, next.x, next.y);
    }
    const last = pts[pts.length - 1]; ctx.lineTo(last.x, last.y);
  }

  function makeDefaultLake(w, h) {
    return [[.12,.2],[.25,.09],[.44,.12],[.59,.04],[.76,.14],[.92,.24],[.88,.42],[.98,.58],[.83,.76],[.73,.9],[.52,.86],[.36,.96],[.2,.86],[.08,.71],[.13,.53],[.03,.37]].map(function(p){return{x:p[0]*w,y:p[1]*h};});
  }

  function withPathScale(ctx, item, w, h, draw) {
    const baseW = Math.max(1, item.pathBaseW || w), baseH = Math.max(1, item.pathBaseH || h);
    const pts = item.pathPoints || [];
    ctx.save(); ctx.scale(w / baseW, h / baseH);
    draw(ctx, pts, baseW, baseH, item.pathThickness || 40);
    ctx.restore();
  }

  function washShape(ctx, pts, w, h, top, middle, edge) {
    smoothClosed(ctx, pts);
    ctx.fillStyle = "#e3e5d4"; ctx.fill();
    ctx.lineWidth = Math.max(3, Math.min(w,h) * .045); ctx.strokeStyle = "rgba(245,244,227,.9)"; ctx.stroke();
    ctx.save(); smoothClosed(ctx, pts); ctx.clip();
    const g = ctx.createLinearGradient(w*.12, h*.06, w*.92, h*.98);
    g.addColorStop(0, top); g.addColorStop(.52, middle); g.addColorStop(1, edge);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i=0;i<7;i++) {
      const x=w*(.14+((i*29)%72)/100), y=h*(.13+((i*43)%68)/100), r=Math.min(w,h)*(.12+(i%3)*.025);
      const wash=ctx.createRadialGradient(x,y,1,x,y,r);
      wash.addColorStop(0,i%2?"rgba(230,246,233,.16)":"rgba(65,132,151,.08)");wash.addColorStop(1,"rgba(230,246,233,0)");
      ctx.fillStyle=wash;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.strokeStyle="rgba(239,249,245,.42)";ctx.lineWidth=Math.max(1,Math.min(w,h)*.006);ctx.lineCap="round";
    for(let i=0;i<10;i++) {
      const x=w*(.11+((i*31)%77)/100), y=h*(.16+((i*47)%67)/100), rw=w*(.025+(i%3)*.006);
      ctx.beginPath();ctx.moveTo(x-rw,y);ctx.quadraticCurveTo(x,y-h*.018,x+rw*1.4,y+h*.004);ctx.stroke();
    }
    ctx.restore();
    smoothClosed(ctx, pts);ctx.lineWidth=Math.max(1,Math.min(w,h)*.008);ctx.strokeStyle="rgba(104,145,127,.36)";ctx.stroke();
  }

  function drawLake(ctx, w, h, item) {
    const lake = function(c, pts, bw, bh) {
      washShape(c, pts.length>2?pts:makeDefaultLake(bw,bh), bw, bh, "#b8d9dc", "#8bbfc6", "#78aeb7");
    };
    if (item && item.pathPoints && item.pathPoints.length>2) withPathScale(ctx,item,w,h,lake);
    else lake(ctx,makeDefaultLake(w,h),w,h);
  }

  function brushLine(ctx, pts, color, width, alpha) {
    if (!pts || pts.length < 2) return;
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha==null?1:alpha;smoothOpen(ctx,pts);ctx.stroke();ctx.restore();
  }

  function pathOffset(pts, amount) {
    return pts.map(function(p,i){
      const prev=pts[Math.max(0,i-1)], next=pts[Math.min(pts.length-1,i+1)];
      let dx=next.x-prev.x,dy=next.y-prev.y,len=Math.sqrt(dx*dx+dy*dy)||1;
      return {x:p.x-dy/len*amount,y:p.y+dx/len*amount};
    });
  }

  function pathLength(pts) {
    let total=0;for(let i=1;i<pts.length;i++){const dx=pts[i].x-pts[i-1].x,dy=pts[i].y-pts[i-1].y;total+=Math.sqrt(dx*dx+dy*dy);}return total;
  }

  function pointsAtStep(pts, step) {
    const out=[];let carry=0;
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);if(!len)continue;
      let d=step-carry;
      while(d<len) { const t=d/len;out.push({x:a.x+dx*t,y:a.y+dy*t,tx:dx/len,ty:dy/len});d+=step; }
      carry=(carry+len)%step;
    }
    return out;
  }

  function drawRoadPath(ctx, pts, thickness, w, h) {
    if(!pts||pts.length<2)pts=[{x:8,y:h/2},{x:w-8,y:h/2}];
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
    ctx.shadowColor="rgba(84,79,62,.15)";ctx.shadowBlur=Math.max(3,thickness*.12);ctx.shadowOffsetY=3;
    brushLine(ctx,pts,"#a79c85",thickness+8,.6);
    ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    brushLine(ctx,pts,"#d0c7b3",thickness+2,1);
    brushLine(ctx,pts,"#e5decc",thickness-5,1);
    brushLine(ctx,pathOffset(pts,-thickness*.31),"rgba(255,252,238,.68)",Math.max(1,thickness*.035),.75);
    brushLine(ctx,pathOffset(pts,thickness*.31),"rgba(132,121,99,.28)",Math.max(1,thickness*.03),.7);
    const marks=pointsAtStep(pts,Math.max(18,thickness*.75));
    ctx.strokeStyle="rgba(154,141,117,.24)";ctx.lineWidth=Math.max(1,thickness*.025);
    marks.forEach(function(p){ctx.beginPath();ctx.moveTo(p.x-p.ty*thickness*.24,p.y+p.tx*thickness*.24);ctx.lineTo(p.x+p.ty*thickness*.24,p.y-p.tx*thickness*.24);ctx.stroke();});
    ctx.restore();
  }

  function drawRoad(ctx,w,h,item) {
    const draw=function(c,pts,bw,bh,t){drawRoadPath(c,pts,t||Math.min(bh*.78,38),bw,bh);};
    if(item&&item.pathPoints&&item.pathPoints.length>1)withPathScale(ctx,item,w,h,draw);
    else drawRoadPath(ctx,[{x:12,y:h/2},{x:w-12,y:h/2}],item&&item.pathThickness||Math.min(h*.74,38),w,h);
  }

  function drawBridgePath(ctx, pts, thickness) {
    if(!pts||pts.length<2)return;
    let curve=pts.filter(function(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y);}).map(function(p){return{x:p.x,y:p.y};});
    curve=curve.reduce(function(out,p){const last=out[out.length-1];if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.25)out.push(p);return out;},[]);
    if(curve.length<2)return;
    const requestedWidth=Number(thickness),width=Number.isFinite(requestedWidth)&&requestedWidth>0?Math.max(6,requestedWidth):36,half=width*.5;
    const depth=Math.max(2,width*.12),railHeight=Math.max(5,width*.31),railWidth=Math.max(1.5,width*.065);
    // Corner cutting stays inside the drawn path's hull and preserves both ends.
    for(let pass=0;pass<2&&curve.length>2;pass++){
      const smooth=[curve[0]];
      for(let i=0;i<curve.length-1;i++){
        const a=curve[i],b=curve[i+1];
        smooth.push({x:a.x*.82+b.x*.18,y:a.y*.82+b.y*.18},{x:a.x*.18+b.x*.82,y:a.y*.18+b.y*.82});
      }
      smooth.push(curve[curve.length-1]);curve=smooth;
    }
    const frames=[],spacing=Math.max(2,width*.08);
    for(let i=0;i<curve.length-1;i++){
      const a=curve[i],b=curve[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/spacing));
      for(let j=0;j<steps;j++){
        const t=j/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},last=frames[frames.length-1];
        if(!last||Math.hypot(p.x-last.x,p.y-last.y)>=spacing*.7)frames.push(p);
      }
    }
    frames.push(curve[curve.length-1]);
    let length=0;
    frames.forEach(function(p,i){
      const a=frames[Math.max(0,i-1)],b=frames[Math.min(frames.length-1,i+1)];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      p.nx=-dy/len;p.ny=dx/len;
      if(i)length+=Math.hypot(p.x-frames[i-1].x,p.y-frames[i-1].y);p.s=length;
    });
    if(length<.5)return;
    function at(s){
      let lo=0,hi=frames.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(frames[mid].s<s)lo=mid;else hi=mid;}
      const a=frames[lo],b=frames[hi],t=Math.max(0,Math.min(1,(s-a.s)/(b.s-a.s||1)));
      const nx=a.nx+(b.nx-a.nx)*t,ny=a.ny+(b.ny-a.ny)*t,n=Math.hypot(nx,ny)||1;
      return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,nx:nx/n,ny:ny/n};
    }
    function edge(p,side,lift){return{x:p.x+p.nx*half*side,y:p.y+p.ny*half*side-(lift||0)};}
    function trace(points){ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();}
    function fill(points,color){trace(points);ctx.fillStyle=color;ctx.fill();}
    function stroke(points,color,size){ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();}
    const left=frames.map(function(p){return edge(p,1);}),right=frames.map(function(p){return edge(p,-1);});
    const deck=left.concat(right.slice().reverse());
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
    ctx.shadowColor="rgba(40,51,40,.24)";ctx.shadowBlur=width*.18;ctx.shadowOffsetY=width*.08;
    fill(deck.map(function(p){return{x:p.x+depth*.4,y:p.y+depth+railHeight*.3};}),"rgba(46,57,43,.18)");
    ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    fill(deck.map(function(p){return{x:p.x,y:p.y+depth};}),"#715039");
    // Extrusion is screen-down, not perpendicular to the route: this is an oblique top view.
    [-1,1].forEach(function(side){
      for(let i=0;i<frames.length-1;i++){
        const a=frames[i],b=frames[i+1];if((a.ny+b.ny)*side<0)continue;
        const p=edge(a,side),q=edge(b,side);
        fill([p,q,{x:q.x,y:q.y+depth},{x:p.x,y:p.y+depth}],"#896044");
        stroke([{x:p.x,y:p.y+depth*.75},{x:q.x,y:q.y+depth*.75}],"rgba(59,40,28,.28)",Math.max(.6,width*.018));
      }
    });
    const rails=[];
    [-1,1].forEach(function(side){
      for(let i=0;i<frames.length-1;i++){
        const a=frames[i],b=frames[i+1];
        rails.push({a:a,b:b,side:side,front:(a.ny+b.ny)*side>=0});
      }
    });
    const postCount=Math.max(1,Math.ceil(length/Math.max(15,width*.72)));
    function railing(front){
      for(let i=0;i<=postCount;i++){
        const p=at(length*i/postCount);
        [-1,1].forEach(function(side){
          if((p.ny*side>=0)!==front)return;
          const base=edge(p,side),postW=Math.max(2,width*.07),bottom=base.y+(front?depth*.7:0);
          ctx.fillStyle="#745039";ctx.fillRect(base.x-postW*.5,base.y-railHeight,postW,bottom-base.y+railHeight);
          ctx.fillStyle="#bc9364";ctx.fillRect(base.x-postW*.5,base.y-railHeight,postW*.36,bottom-base.y+railHeight);
          ctx.fillStyle="#d2b084";ctx.fillRect(base.x-postW*.5,base.y-railHeight,postW,Math.max(.8,postW*.3));
        });
      }
      rails.forEach(function(r){
        if(r.front!==front)return;
        stroke([edge(r.a,r.side,railHeight*.45),edge(r.b,r.side,railHeight*.45)],"#95704c",railWidth*.62);
        const a=edge(r.a,r.side,railHeight),b=edge(r.b,r.side,railHeight);
        stroke([a,b],"#765038",railWidth);
        stroke([{x:a.x,y:a.y-railWidth*.2},{x:b.x,y:b.y-railWidth*.2}],"#dab98a",Math.max(.65,railWidth*.29));
      });
    }
    // Far posts are hidden by the deck; near posts and rails cover its front edge.
    railing(false);
    fill(deck,"#b99060");
    ctx.save();trace(deck);ctx.clip();
    const pitch=Math.max(6,width*.23),colors=["#b99164","#c39d6e","#b78d5f","#c8a576","#bc9668"];
    for(let s=0,index=0;s<length;s+=pitch,index++){
      const a=at(s),b=at(Math.min(length,s+pitch)),mid=at(Math.min(length,s+pitch*.5));
      fill([edge(a,-1),edge(a,1),edge(b,1),edge(b,-1)],colors[index%colors.length]);
      stroke([edge(a,-1),edge(a,1)],"rgba(86,57,35,.65)",Math.max(.65,width*.021));
      const shine=at(Math.min(length,s+.9));
      stroke([edge(shine,-1),edge(shine,1)],"rgba(238,208,162,.65)",Math.max(.5,width*.015));
      for(let grain=0;grain<2;grain++){
        const p=at(Math.min(length,s+pitch*(.32+grain*.32))),span=half*(.68+(index%3)*.06),wave=Math.sin(index*2.3+grain)*pitch*.08;
        ctx.beginPath();ctx.moveTo(p.x-p.nx*span,p.y-p.ny*span);
        ctx.quadraticCurveTo(p.x-p.ny*wave,p.y+p.nx*wave,p.x+p.nx*span,p.y+p.ny*span);
        ctx.strokeStyle=grain?"rgba(245,216,173,.29)":"rgba(108,72,40,.23)";ctx.lineWidth=Math.max(.45,width*.012);ctx.stroke();
      }
      if(index%5===2){
        const offset=Math.sin(index*1.7)*half*.45;
        ctx.beginPath();ctx.ellipse(mid.x+mid.nx*offset,mid.y+mid.ny*offset,width*.045,pitch*.09,Math.atan2(mid.ny,mid.nx),0,Math.PI*2);
        ctx.strokeStyle="rgba(99,63,34,.36)";ctx.lineWidth=Math.max(.55,width*.013);ctx.stroke();
      }
      [-1,1].forEach(function(side){const p=edge(mid,side*.84);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.45,width*.011),0,Math.PI*2);ctx.fillStyle="rgba(80,62,43,.63)";ctx.fill();});
    }
    ctx.restore();
    stroke(left,"rgba(88,58,35,.68)",Math.max(.8,width*.035));stroke(right,"rgba(88,58,35,.68)",Math.max(.8,width*.035));
    railing(true);
    ctx.restore();
  }

  function drawBridge(ctx,w,h,item) {
    const draw=function(c,pts,bw,bh,t){drawBridgePath(c,pts,t||Math.min(bh*.7,54));};
    if(item&&item.pathPoints&&item.pathPoints.length>1)withPathScale(ctx,item,w,h,draw);
    else drawBridgePath(ctx,[{x:10,y:h/2},{x:w-10,y:h/2}],item&&item.pathThickness||Math.min(h*.68,48));
  }

  function brickCourse(ctx,x,y,w,h,base) {
    ctx.save();roundRect(ctx,x,y,w,h,2);ctx.fillStyle=base;ctx.fill();ctx.strokeStyle="rgba(91,64,52,.48)";ctx.lineWidth=Math.max(1,Math.min(w,h)*.012);ctx.stroke();
    ctx.save();roundRect(ctx,x,y,w,h,2);ctx.clip();
    const rows=5,rowH=h/rows;
    for(let r=1;r<rows;r++) {
      const yy=y+r*rowH+(r%2?.8:-.5);ctx.strokeStyle="rgba(239,214,190,.44)";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+2,yy);ctx.quadraticCurveTo(x+w*.52,yy+((r%2)*.7),x+w-2,yy);ctx.stroke();
      const offset=r%2?w*.18:0;
      for(let xx=x+offset;xx<x+w;xx+=w*.35){ctx.beginPath();ctx.moveTo(xx,yy-rowH);ctx.lineTo(xx,yy);ctx.stroke();}
    }
    ctx.restore();ctx.restore();
  }

  function drawBrickFacade(ctx,x,y,w,h,balcony) {
    brickCourse(ctx,x,y,w,h,"#ad7a61");
    ctx.fillStyle="#8b5f4b";ctx.fillRect(x,y,w,h*.075);
    ctx.fillStyle="rgba(238,213,190,.28)";ctx.fillRect(x+2,y+2,w-4,h*.035);
    const winY=y+h*.2,winW=w*.13,winH=h*.25;
    [x+w*.15,x+w*.72].forEach(function(xx){
      ctx.fillStyle="#d8d9d1";ctx.fillRect(xx,winY,winW,winH);ctx.strokeStyle="#735b4e";ctx.lineWidth=1;ctx.strokeRect(xx,winY,winW,winH);
      ctx.fillStyle="#87918c";ctx.fillRect(xx+winW*.13,winY+winH*.13,winW*.74,winH*.72);
      ctx.strokeStyle="rgba(242,231,213,.8)";ctx.beginPath();ctx.moveTo(xx+winW*.5,winY);ctx.lineTo(xx+winW*.5,winY+winH);ctx.stroke();
    });
    const doorW=w*.19,doorH=h*(balcony?.43:.36),doorX=x+(w-doorW)/2,doorY=y+h*(balcony?.28:.59);
    ctx.fillStyle="#6f5548";ctx.fillRect(doorX,doorY,doorW,doorH);ctx.strokeStyle="rgba(239,216,188,.7)";ctx.lineWidth=1;ctx.strokeRect(doorX,doorY,doorW,doorH);
    ctx.fillStyle="#d9c5a5";ctx.beginPath();ctx.arc(doorX+doorW*.78,doorY+doorH*.56,Math.max(1,w*.008),0,Math.PI*2);ctx.fill();
    if(balcony){
      const bx=x+w*.19,bw=w*.62,deckY=y+h*.78,railY=y+h*.68,postW=Math.max(1,w*.012);
      ctx.fillStyle="#c7b293";ctx.fillRect(bx,deckY,bw,h*.055);ctx.fillStyle="#80654f";ctx.fillRect(bx,deckY+h*.04,bw,h*.025);
      ctx.strokeStyle="#705847";ctx.lineWidth=Math.max(1.4,w*.012);ctx.beginPath();ctx.moveTo(bx,railY);ctx.lineTo(bx+bw,railY);ctx.stroke();
      ctx.strokeStyle="#ead9bd";ctx.lineWidth=postW;
      for(let i=0;i<=8;i++){const xx=bx+bw*i/8;ctx.beginPath();ctx.moveTo(xx,railY);ctx.lineTo(xx,deckY+h*.04);ctx.stroke();}
      ctx.fillStyle="#705847";ctx.fillRect(bx-postW,railY-h*.018,postW,h*.04);ctx.fillRect(bx+bw,railY-h*.018,postW,h*.04);
    }
    ctx.fillStyle="#865e4d";ctx.fillRect(x,y+h*.94,w,h*.06);
    ctx.strokeStyle="rgba(242,222,201,.56)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+h*.94);ctx.lineTo(x+w,y+h*.94);ctx.stroke();
  }
  function drawBrickSide(ctx,x,y,w,h,dx,dy) {
    ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x+w+dx,y-dy);ctx.lineTo(x+w+dx,y+h-dy);ctx.lineTo(x+w,y+h);ctx.closePath();
    const shade=ctx.createLinearGradient(x+w,y,x+w+dx,y);shade.addColorStop(0,"#94664f");shade.addColorStop(1,"#775441");ctx.fillStyle=shade;ctx.fill();ctx.strokeStyle="rgba(82,57,44,.5)";ctx.lineWidth=1.2;ctx.stroke();
    ctx.save();ctx.clip();ctx.strokeStyle="rgba(235,207,181,.3)";ctx.lineWidth=1;
    for(let row=1;row<6;row++){const yy=y+h*row/6;ctx.beginPath();ctx.moveTo(x+w,yy);ctx.lineTo(x+w+dx,yy-dy);ctx.stroke();}
    ctx.strokeStyle="rgba(76,52,42,.27)";
    for(let col=1;col<4;col++){const t=col/4;ctx.beginPath();ctx.moveTo(x+w+dx*t,y-dy*t);ctx.lineTo(x+w+dx*t,y+h-dy*t);ctx.stroke();}
    ctx.restore();
  }
  function drawBrickRoof(ctx,x,y,w,dx,dy) {
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y-dy);ctx.lineTo(x+w+dx,y-dy);ctx.lineTo(x+w,y);ctx.closePath();
    const roof=ctx.createLinearGradient(x,y-dy,x+w,y);roof.addColorStop(0,"#b9876a");roof.addColorStop(.55,"#a87860");roof.addColorStop(1,"#92654f");ctx.fillStyle=roof;ctx.fill();ctx.strokeStyle="rgba(86,59,46,.55)";ctx.lineWidth=1.4;ctx.stroke();
    ctx.save();ctx.clip();ctx.strokeStyle="rgba(239,213,188,.38)";ctx.lineWidth=1;
    for(let i=1;i<6;i++){const xx=x+w*i/6;ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx+dx,y-dy);ctx.stroke();}
    ctx.strokeStyle="rgba(79,54,43,.26)";
    for(let row=1;row<4;row++){const t=row/4;ctx.beginPath();ctx.moveTo(x+dx*t,y-dy*t);ctx.lineTo(x+w+dx*t,y-dy*t);ctx.stroke();}
    ctx.restore();
    ctx.strokeStyle="rgba(244,220,194,.72)";ctx.lineWidth=Math.max(1.5,w*.012);ctx.beginPath();ctx.moveTo(x+dx*.5,y-dy*.5);ctx.lineTo(x+w+dx*.5,y-dy*.5);ctx.stroke();
    ctx.strokeStyle="#805a48";ctx.lineWidth=Math.max(2,w*.018);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
  }
  function drawBrickBuilding(ctx,w,h,levels) {
    ctx.save();ctx.fillStyle="rgba(61,55,46,.16)";ctx.beginPath();ctx.ellipse(w*.51,h*.86,w*.38,h*.055,-.03,0,Math.PI*2);ctx.fill();
    const x=w*.08,frontW=w*.72,dx=w*.12,dy=h*.13,top=h*.3,base=h*.85,frontH=base-top,storyH=frontH/levels;
    drawBrickSide(ctx,x,top,frontW,frontH,dx,dy);
    drawBrickRoof(ctx,x,top,frontW,dx,dy);
    for(let i=0;i<levels;i++){
      const y=top+i*storyH;drawBrickFacade(ctx,x,y,frontW,storyH,levels===2&&i===0);
      if(i>0){ctx.fillStyle="#87604d";ctx.fillRect(x,y,frontW,h*.018);ctx.fillStyle="rgba(242,218,193,.72)";ctx.fillRect(x,y,frontW,h*.007);}
    }
    ctx.restore();
  }
  function drawBrick(ctx,w,h) { drawBrickBuilding(ctx,w,h,1); }
  function drawBrickDouble(ctx,w,h) { drawBrickBuilding(ctx,w,h,2); }

  function drawRound(ctx,w,h) {
    ctx.save();
    const unit=Math.min(w,h),cx=w*.39,cy=h*.44,rx=unit*.29,ry=unit*.235,wall=unit*.105;
    ctx.fillStyle="rgba(68,72,70,.18)";ctx.beginPath();ctx.ellipse(cx+unit*.04,cy+wall+ry*.55,rx*1.12,ry*.57,.02,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(cx-rx,cy);ctx.lineTo(cx-rx,cy+wall);ctx.ellipse(cx,cy+wall,rx,ry,0,Math.PI,0,true);ctx.lineTo(cx+rx,cy);ctx.closePath();
    ctx.fillStyle="#c5c7c1";ctx.fill();ctx.strokeStyle="#9a9d98";ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fillStyle="#f3f2ec";ctx.fill();ctx.strokeStyle="#969a95";ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,rx*.86,ry*.82,0,0,Math.PI*2);ctx.clip();
    const roof=ctx.createLinearGradient(cx-rx,cy-ry,cx+rx,cy+ry);roof.addColorStop(0,"#fffef9");roof.addColorStop(1,"#d9dcd5");ctx.fillStyle=roof;ctx.fillRect(cx-rx,cy-ry,rx*2,ry*2);
    ctx.strokeStyle="rgba(145,150,144,.38)";ctx.lineWidth=1;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry);ctx.stroke();}
    ctx.beginPath();ctx.ellipse(cx,cy,rx*.43,ry*.42,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    ctx.beginPath();ctx.ellipse(cx,cy-wall*.04,rx*.16,ry*.16,0,0,Math.PI*2);ctx.fillStyle="#deded7";ctx.fill();ctx.strokeStyle="#a4a69f";ctx.lineWidth=1;ctx.stroke();
    const doorW=unit*.09,doorH=unit*.075,doorX=cx+rx*.7,doorY=cy-doorH*.48;
    ctx.fillStyle="#b7bab2";roundRect(ctx,doorX,doorY,doorW,doorH,2);ctx.fill();ctx.strokeStyle="#92968f";ctx.lineWidth=1;ctx.stroke();
    const p0={x:cx+rx*.9,y:cy-ry*.06},p1={x:w*.88,y:cy-ry*.02},p2={x:w*.95,y:h*.68},p3={x:w*.75,y:h*.82};
    const curveAt=function(t){const u=1-t;return{x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};};
    const tangentAt=function(t){const u=1-t;return{x:3*u*u*(p1.x-p0.x)+6*u*t*(p2.x-p1.x)+3*t*t*(p3.x-p2.x),y:3*u*u*(p1.y-p0.y)+6*u*t*(p2.y-p1.y)+3*t*t*(p3.y-p2.y)};};
    const halfStep=unit*.052,railA=[],railB=[],stairPoints=[];
    for(let i=0;i<=48;i++){const t=i/48,p=curveAt(t),v=tangentAt(t),len=Math.hypot(v.x,v.y)||1,nx=-v.y/len,ny=v.x/len;railA.push({x:p.x+nx*halfStep,y:p.y+ny*halfStep});railB.push({x:p.x-nx*halfStep,y:p.y-ny*halfStep});stairPoints.push(p);}
    ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(stairPoints[0].x,stairPoints[0].y);stairPoints.slice(1).forEach(function(p){ctx.lineTo(p.x,p.y);});
    ctx.strokeStyle="rgba(55,59,55,.22)";ctx.lineWidth=unit*.145;ctx.stroke();ctx.strokeStyle="#c9cbc4";ctx.lineWidth=unit*.112;ctx.stroke();ctx.strokeStyle="#e8e8e2";ctx.lineWidth=unit*.087;ctx.stroke();
    const strokeRail=function(points){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(function(p){ctx.lineTo(p.x,p.y);});ctx.stroke();};
    ctx.strokeStyle="#8d9189";ctx.lineWidth=Math.max(1.5,unit*.012);strokeRail(railA);strokeRail(railB);
    ctx.strokeStyle="rgba(255,255,248,.72)";ctx.lineWidth=Math.max(1,unit*.005);
    for(let i=1;i<15;i++){const t=i/15,p=curveAt(t),v=tangentAt(t),len=Math.hypot(v.x,v.y)||1,nx=-v.y/len,ny=v.x/len;ctx.beginPath();ctx.moveTo(p.x+nx*halfStep*.9,p.y+ny*halfStep*.9);ctx.lineTo(p.x-nx*halfStep*.9,p.y-ny*halfStep*.9);ctx.stroke();ctx.strokeStyle="rgba(113,117,109,.74)";ctx.lineWidth=Math.max(1,unit*.008);ctx.beginPath();ctx.moveTo(p.x+nx*halfStep*.9,p.y+ny*halfStep*.9);ctx.lineTo(p.x-nx*halfStep*.9,p.y-ny*halfStep*.9);ctx.stroke();ctx.strokeStyle="rgba(255,255,248,.72)";ctx.lineWidth=Math.max(1,unit*.005);}
    const landing=function(x,y,lw,lh){roundRect(ctx,x,y,lw,lh,2);ctx.fillStyle="#d7d8d1";ctx.fill();ctx.strokeStyle="#91958e";ctx.lineWidth=1.2;ctx.stroke();ctx.strokeStyle="rgba(251,250,243,.78)";ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+lw*.12,y+lh*i/4);ctx.lineTo(x+lw*.88,y+lh*i/4);ctx.stroke();}};
    landing(cx+rx*.73,cy-ry*.22,unit*.19,unit*.09);
    landing(w*.66,h*.76,unit*.19,unit*.105);
    ctx.restore();
  }

  function drawTree(ctx,w,h) {
    ctx.save();
    const canopy=[[.5,.07],[.68,.12],[.82,.22],[.91,.4],[.83,.56],[.89,.7],[.69,.83],[.5,.92],[.32,.84],[.13,.73],[.19,.56],[.08,.4],[.2,.22],[.34,.12]].map(function(p){return{x:p[0]*w,y:p[1]*h};});
    smoothClosed(ctx,canopy);const wash=ctx.createLinearGradient(w*.12,h*.08,w*.86,h*.92);wash.addColorStop(0,"#a5b08a");wash.addColorStop(.52,"#82936f");wash.addColorStop(1,"#6d805e");ctx.fillStyle=wash;ctx.fill();ctx.strokeStyle="rgba(86,104,72,.62)";ctx.lineWidth=1.2;ctx.stroke();
    ctx.save();smoothClosed(ctx,canopy);ctx.clip();
    const light=ctx.createRadialGradient(w*.36,h*.3,1,w*.42,h*.4,w*.53);light.addColorStop(0,"rgba(224,225,190,.26)");light.addColorStop(1,"rgba(224,225,190,0)");ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
    for(let i=0;i<22;i++) {
      const a=i*2.399,r=.08+(i%5)*.052,x=w*(.5+Math.cos(a)*r),y=h*(.49+Math.sin(a)*r*.82),leafW=w*(.018+(i%3)*.006),leafH=h*(.012+(i%2)*.006);
      ctx.beginPath();ctx.ellipse(x,y,leafW,leafH,a*.5,0,Math.PI*2);ctx.fillStyle=i%3===0?"rgba(218,221,185,.28)":"rgba(48,78,53,.13)";ctx.fill();
    }
    ctx.strokeStyle="rgba(237,237,212,.25)";ctx.lineWidth=.7;
    for(let i=0;i<8;i++){const x=w*(.22+(i*17%57)/100),y=h*(.24+(i*29%49)/100);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+3,y-3,x+6,y);ctx.stroke();}
    ctx.restore();ctx.restore();
  }

  function drawField(ctx,w,h) {
    ctx.save();
    roundRect(ctx,2,2,w-4,h-4,Math.min(22,h*.12));ctx.fillStyle="#879a76";ctx.fill();ctx.strokeStyle="#ede7d5";ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*.39,h*.39,0,0,Math.PI*2);ctx.fillStyle="#b98670";ctx.fill();ctx.strokeStyle="rgba(248,239,218,.8)";ctx.lineWidth=1.5;ctx.stroke();
    [0,.07,.14].forEach(function(r){ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*(.33-r),h*(.31-r),0,0,Math.PI*2);ctx.stroke();});
    const x=w*.14,y=h*.19,iw=w*.72,ih=h*.62;roundRect(ctx,x,y,iw,ih,2);ctx.fillStyle="#a9bd8d";ctx.fill();ctx.strokeStyle="#f0ead8";ctx.lineWidth=1.4;ctx.stroke();
    ctx.beginPath();ctx.moveTo(w/2,y);ctx.lineTo(w/2,y+ih);ctx.stroke();ctx.beginPath();ctx.arc(w/2,h/2,Math.min(iw,ih)*.12,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle="rgba(245,239,222,.85)";ctx.strokeRect(x,y+ih*.31,iw*.12,ih*.38);ctx.strokeRect(x+iw*.88,y+ih*.31,iw*.12,ih*.38);
    ctx.restore();
  }

  function drawGarden(ctx,w,h,item) {
    const pts=item&&item.pathPoints;
    const fillArea=function(c,p,bw,bh,color){
      if(!p||p.length<3)p=[{x:bw*.1,y:bh*.18},{x:bw*.31,y:bh*.06},{x:bw*.54,y:bh*.13},{x:bw*.82,y:bh*.07},{x:bw*.93,y:bh*.4},{x:bw*.84,y:bh*.78},{x:bw*.61,y:bh*.88},{x:bw*.3,y:bh*.82},{x:bw*.09,y:bh*.58}];
      smoothClosed(c,p);c.fillStyle=color||"#a9b88a";c.fill();c.strokeStyle="rgba(93,119,83,.55)";c.lineWidth=2;c.stroke();
      c.save();smoothClosed(c,p);c.clip();
      for(let i=0;i<50;i++){const x=bw*(.08+(i*37%84)/100),y=bh*(.08+(i*23%84)/100);c.strokeStyle=i%3?"rgba(80,113,75,.22)":"rgba(235,233,203,.46)";c.lineWidth=.8;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+2,y-4,x-1,y-7);c.stroke();}
      c.restore();
    };
    if(pts&&pts.length>2)withPathScale(ctx,item,w,h,function(c,p,bw,bh){fillArea(c,p,bw,bh,item.tint);});
    else fillArea(ctx,null,w,h,item&&item.tint);
  }

  function drawSketch(ctx,w,h,item) {
    drawGarden(ctx,w,h,item);
    if(item&&item.pathPoints&&item.pathPoints.length>2) {
      withPathScale(ctx,item,w,h,function(c,pts,bw,bh){
        c.save();smoothClosed(c,pts);c.clip();
        c.strokeStyle="rgba(76,101,68,.28)";c.lineWidth=1;
        for(let y=8;y<bh;y+=14){c.beginPath();c.moveTo(0,y);c.quadraticCurveTo(bw*.5,y-3,bw,y+2);c.stroke();}
        c.restore();
      });
    }
  }

  const DRAW={lake:drawLake,field:drawField,brick:drawBrick,brick2:drawBrickDouble,round:drawRound,road:drawRoad,bridge:drawBridge,tree:drawTree,garden:drawGarden,sketch:drawSketch};

  function coastPoints(w,h) {
    const raw=[[.07,.04],[.23,.025],[.38,.045],[.55,.02],[.72,.04],[.91,.035],[.97,.13],[.95,.27],[.985,.4],[.96,.56],[.98,.72],[.94,.89],[.84,.96],[.69,.94],[.53,.98],[.37,.95],[.2,.975],[.06,.92],[.025,.79],[.055,.63],[.02,.48],[.045,.33],[.018,.18]];
    return raw.map(function(p){return{x:p[0]*w,y:p[1]*h};});
  }

  function drawWater(ctx,width,height) {
    const m=Math.min(width,height);
    const ground=ctx.createLinearGradient(0,0,width,height);ground.addColorStop(0,"#cbd4b4");ground.addColorStop(.48,"#c5d0aa");ground.addColorStop(1,"#b9c89f");ctx.fillStyle=ground;ctx.fillRect(0,0,width,height);
    ctx.save();ctx.globalAlpha=.25;
    for(let i=0;i<28;i++){
      const x=(i*173+41)%width,y=(i*241+67)%height,r=m*(.035+(i%4)*.018);
      const wash=ctx.createRadialGradient(x,y,1,x,y,r);wash.addColorStop(0,i%3?"rgba(242,238,208,.34)":"rgba(122,151,105,.2)");wash.addColorStop(1,"rgba(210,220,184,0)");ctx.fillStyle=wash;ctx.beginPath();ctx.ellipse(x,y,r,r*.62,(i%5)*.22,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=.17;ctx.strokeStyle="#829b78";ctx.lineWidth=Math.max(1,m*.003);
    for(let i=0;i<19;i++){
      const y=height*(.05+(i*47%88)/100),start=-width*.1+(i*83%30)*width*.01;
      ctx.beginPath();ctx.moveTo(start,y);ctx.bezierCurveTo(width*.27,y-m*(.018+(i%3)*.012),width*.66,y+m*(.02+(i%4)*.01),width*1.1,y-m*.012);ctx.stroke();
    }
    ctx.globalAlpha=.12;ctx.strokeStyle="#f8f5df";ctx.lineWidth=Math.max(1,m*.006);
    for(let i=0;i<24;i++){const x=(i*97+31)%width,y=(i*173+47)%height,span=width*(.018+(i%4)*.007);ctx.beginPath();ctx.moveTo(x-span,y);ctx.quadraticCurveTo(x,y-5-(i%3)*3,x+span,y+1);ctx.stroke();}
    ctx.restore();
  }
  function drawBoundaryVeil(ctx,coast,width,height) {
    const m=Math.min(width,height);
    ctx.save();ctx.filter="blur("+(m*.045)+"px)";ctx.strokeStyle="rgba(243,241,218,.58)";ctx.lineWidth=m*.15;smoothClosed(ctx,coast);ctx.stroke();
    ctx.filter="blur("+(m*.018)+"px)";ctx.strokeStyle="rgba(122,143,100,.16)";ctx.lineWidth=m*.1;smoothClosed(ctx,coast);ctx.stroke();ctx.restore();
  }
  function drawCloud(ctx,x,y,size,opacity) {
    const path=function(){
      ctx.beginPath();ctx.moveTo(x-size*.52,y+size*.1);
      ctx.bezierCurveTo(x-size*.67,y-size*.01,x-size*.49,y-size*.2,x-size*.28,y-size*.14);
      ctx.bezierCurveTo(x-size*.23,y-size*.39,x+size*.05,y-size*.42,x+size*.18,y-size*.21);
      ctx.bezierCurveTo(x+size*.35,y-size*.38,x+size*.56,y-size*.22,x+size*.48,y-size*.04);
      ctx.bezierCurveTo(x+size*.67,y+size*.01,x+size*.57,y+size*.16,x+size*.38,y+size*.17);
      ctx.bezierCurveTo(x+size*.24,y+size*.26,x+size*.08,y+size*.18,x-size*.04,y+size*.2);
      ctx.bezierCurveTo(x-size*.2,y+size*.27,x-size*.34,y+size*.16,x-size*.42,y+size*.2);
      ctx.bezierCurveTo(x-size*.56,y+size*.23,x-size*.64,y+size*.15,x-size*.52,y+size*.1);ctx.closePath();
    };
    ctx.save();ctx.fillStyle="#fff";ctx.globalAlpha=opacity*.26;ctx.filter="blur("+(size*.1)+"px)";path();ctx.fill();
    ctx.globalAlpha=opacity*.7;ctx.filter="blur("+(size*.014)+"px)";path();ctx.fill();ctx.restore();
  }
  function drawClouds(ctx,width,height) {
    const m=Math.min(width,height);
    [[.025,.12,.18,.72],[.975,.2,.2,.76],[.01,.43,.17,.7],[.99,.62,.18,.74],[.12,.985,.2,.76],[.88,.985,.22,.8],[.03,.78,.16,.7],[.97,.08,.16,.72],[.5,.015,.25,.52],[.5,.99,.24,.56]].forEach(function(c){drawCloud(ctx,width*c[0],height*c[1],m*c[2],c[3]);});
  }
  function drawBoardEdgeFade(ctx,width,height) {
    const edge=Math.min(width,height)*.085;
    const mask=function(g){g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(.72,"rgba(255,255,255,.62)");g.addColorStop(1,"rgba(255,255,255,1)");return g;};
    ctx.save();ctx.globalCompositeOperation="destination-in";
    ctx.fillStyle=mask(ctx.createLinearGradient(0,0,edge,0));ctx.fillRect(0,0,width,height);
    ctx.fillStyle=mask(ctx.createLinearGradient(width,0,width-edge,0));ctx.fillRect(0,0,width,height);
    ctx.fillStyle=mask(ctx.createLinearGradient(0,0,0,edge));ctx.fillRect(0,0,width,height);
    ctx.fillStyle=mask(ctx.createLinearGradient(0,height,0,height-edge));ctx.fillRect(0,0,width,height);ctx.restore();
  }
  function drawGrassBoard(width,height) {
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");drawWater(ctx,width,height);
    const coast=coastPoints(width,height);
    drawBoundaryVeil(ctx,coast,width,height);
    smoothClosed(ctx,coast);ctx.save();ctx.fillStyle="#d0c4a2";ctx.shadowColor="rgba(49,65,57,.3)";ctx.shadowBlur=Math.min(width,height)*.042;ctx.shadowOffsetY=Math.min(width,height)*.009;ctx.fill();ctx.restore();
    smoothClosed(ctx,coast);ctx.lineWidth=5;ctx.strokeStyle="rgba(238,237,216,.48)";ctx.stroke();
    smoothClosed(ctx,coast);ctx.lineWidth=1.4;ctx.strokeStyle="rgba(255,253,240,.38)";ctx.stroke();
    ctx.save();smoothClosed(ctx,coast);ctx.clip();
    const grass=ctx.createLinearGradient(0,0,width,height);grass.addColorStop(0,"#bcc995");grass.addColorStop(.5,"#aebf88");grass.addColorStop(1,"#9eaf7c");ctx.fillStyle=grass;ctx.fillRect(0,0,width,height);
    for(let i=0;i<26;i++){const x=(i*193+83)%width,y=(i*317+51)%height,r=Math.min(width,height)*(.035+(i%3)*.012);const g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,i%2?"rgba(231,232,190,.2)":"rgba(83,119,77,.11)");g.addColorStop(1,"rgba(225,231,194,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle="rgba(80,111,75,.22)";ctx.lineWidth=.8;
    for(let i=0;i<700;i++){const x=(i*71+17)%width,y=(i*127+29)%height,len=3+(i%5);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+2,y-len/2,x+((i%3)-1)*2,y-len);ctx.stroke();}
    ctx.restore();
    smoothClosed(ctx,coast);ctx.lineWidth=1.3;ctx.strokeStyle="rgba(106,128,88,.26)";ctx.stroke();
    drawClouds(ctx,width,height);
    drawBoardEdgeFade(ctx,width,height);
    return canvas;
  }

  function drawCompass(ctx,x,y,size) {
    const unit=size/82,w=82,h=w*1.04;
    ctx.save();ctx.translate(x,y);ctx.scale(unit,unit);
    ctx.shadowColor="rgba(47,61,54,.16)";ctx.shadowBlur=8;ctx.shadowOffsetY=2;
    roundRect(ctx,0,0,w,h,5);ctx.fillStyle="rgba(250,249,241,.96)";ctx.fill();ctx.shadowColor="transparent";
    ctx.strokeStyle="rgba(118,121,107,.42)";ctx.lineWidth=1;ctx.stroke();
    const cx=w*.5,cy=h*.48,r=w*.34;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle="#f7f5ec";ctx.fill();ctx.strokeStyle="#a6a394";ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,r*.78,0,Math.PI*2);ctx.strokeStyle="rgba(155,153,136,.45)";ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-r*.78);ctx.lineTo(cx+r*.17,cy);ctx.lineTo(cx,cy-r*.18);ctx.lineTo(cx-r*.17,cy);ctx.closePath();ctx.fillStyle="#a55243";ctx.fill();
    ctx.beginPath();ctx.moveTo(cx,cy+r*.78);ctx.lineTo(cx-r*.17,cy);ctx.lineTo(cx,cy+r*.18);ctx.lineTo(cx+r*.17,cy);ctx.closePath();ctx.fillStyle="#d9d3c3";ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,2.1,0,Math.PI*2);ctx.fillStyle="#5b5e55";ctx.fill();
    ctx.fillStyle="#7c5145";ctx.font="600 8px Microsoft YaHei, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("南",cx,7);
    ctx.fillStyle="#62645a";ctx.font="600 7px Microsoft YaHei, sans-serif";ctx.fillText("北",cx,h-5);
    ctx.restore();
  }

  function thumbnail(type) {
    const canvas=document.createElement("canvas");canvas.width=180;canvas.height=106;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#f1f0e8";ctx.fillRect(0,0,180,106);
    const def=DEFINITIONS.find(function(d){return d.type===type;});
    if(!def||!DRAW[type])return canvas.toDataURL("image/png");
    const scale=Math.min(145/def.w,76/def.h),w=def.w*scale,h=def.h*scale;
    ctx.save();ctx.translate((180-w)/2,(106-h)/2);ctx.scale(scale,scale);DRAW[type](ctx,def.w,def.h,{pathThickness:type==="bridge"?48:34,tint:def.color});ctx.restore();
    return canvas.toDataURL("image/png");
  }

  function lakePath(ctx, w, h, item) {
    let points = makeDefaultLake(w, h);
    if (item && item.pathPoints && item.pathPoints.length > 2) {
      const sx = w / Math.max(1, item.pathBaseW || w), sy = h / Math.max(1, item.pathBaseH || h);
      points = item.pathPoints.map(function (p) { return { x: p.x * sx, y: p.y * sy }; });
    }
    smoothClosed(ctx, points);
  }

  global.MapArt={definitions:DEFINITIONS,draw:DRAW,lakePath:lakePath,drawGrassBoard:drawGrassBoard,fadeBoardEdge:drawBoardEdgeFade,drawWater:drawWater,drawCompass:drawCompass,thumbnail:thumbnail,roundRect:roundRect,pathHelpers:{smoothOpen:smoothOpen,pathOffset:pathOffset,pointsAtStep:pointsAtStep,brushLine:brushLine}};
})(window);
