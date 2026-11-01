"use strict";
// Dev-only visual: how overlapping / out-of-board roads and bridges looked before vs after.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createCanvas}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,"..");
const sandbox=vm.createContext({window:{},document:{createElement:()=>createCanvas(1,1)},console,Math,JSON});
["draw.js","paths.js"].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,"js",f),"utf8"),sandbox,{filename:f}));
const ART=sandbox.window.MapArt, P=sandbox.window.MapPaths;
const W=880,H=430;
function board(){const c=createCanvas(W,H),x=c.getContext("2d");x.fillStyle="#aebf88";x.fillRect(0,0,W,H);
  for(let i=0;i<900;i++){const px=(i*71+17)%W,py=(i*127+29)%H;x.strokeStyle="rgba(80,111,75,.18)";x.lineWidth=.7;x.beginPath();x.moveTo(px,py);x.lineTo(px+1,py-3);x.stroke();}
  return c;}
function label(c,text){const x=c.getContext("2d");x.fillStyle="#26332a";x.font="600 15px sans-serif";x.fillText(text,16,26);}
const joined=[{points:[{x:60,y:120},{x:430,y:120}],thickness:42},{points:[{x:430,y:120},{x:820,y:120}],thickness:42}];
const cross=[{points:[{x:60,y:250},{x:820,y:250}],thickness:38},{points:[{x:430,y:250},{x:430,y:400}],thickness:38}];
const bridge=[{points:[{x:60,y:350},{x:420,y:352}],thickness:52},{points:[{x:420,y:352},{x:800,y:356}],thickness:52}];
function before(items,kind){const c=board();const x=c.getContext("2d");
  items.forEach(s=>ART.draw[kind](x,W,H,{pathPoints:s.points,pathBaseW:W,pathBaseH:H,pathThickness:s.thickness}));return c;}
function after(items,kind){const c=board();const x=c.getContext("2d");
  x.drawImage(kind==="road"?P.renderRoads(W,H,items):P.renderBridges(W,H,items),0,0);return c;}
const out=createCanvas(W*2+30,H*3+40),o=out.getContext("2d");
o.fillStyle="#f4f2e6";o.fillRect(0,0,out.width,out.height);
const cells=[[before(joined,"road"),after(joined,"road"),"道路接缝：逐条绘制（有接缝）","道路接缝：合并绘制（无缝）"],
             [before(cross,"road"),after(cross,"road"),"道路交叉：后画的压出边线","道路交叉：自动合并成一体"],
             [before(bridge,"bridge"),after(bridge,"bridge"),"桥梁相接：逐段绘制（有断口）","桥梁相接：合并绘制（连续）"]];
cells.forEach((row,i)=>{
  o.drawImage(row[0],10,10+i*(H+10));
  o.drawImage(row[1],W+20,10+i*(H+10));
  o.fillStyle="rgba(20,30,22,.78)";o.fillRect(10,10+i*(H+10),W,30);o.fillRect(W+20,10+i*(H+10),W,30);
  o.fillStyle="#fff";o.font="600 15px sans-serif";o.fillText(row[2],20,31+i*(H+10));o.fillText(row[3],W+30,31+i*(H+10));
});
const file=path.join(__dirname,"artifacts","path-merge-preview.png");
fs.writeFileSync(file,out.toBuffer("image/png"));
console.log(JSON.stringify({file}));
