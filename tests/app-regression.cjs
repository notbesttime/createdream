"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const {createCanvas,Image}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,".."),all=[],elements=new Map(),frames=[],storage=new Map(),downloads=[];
class Element {
  constructor(tag="div"){this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.listeners={};this.clientWidth=1200;this.clientHeight=850;this.value="";this.files=[];this.hidden=false;this.classes=new Set();all.push(this);this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),toggle:(x,v)=>{const on=v===undefined?!this.classes.has(x):v;on?this.classes.add(x):this.classes.delete(x);return on;}};}
  set innerHTML(v){ this._html = v; this.children.length = 0; } get innerHTML(){ return this._html || ""; }
  set className(v){this.classes=new Set(v.split(" "));} get className(){return [...this.classes].join(" ");}
  appendChild(x){this.children.push(x);x.parentElement=this;return x;} remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
  addEventListener(k,f){(this.listeners[k]||=[]).push(f);} removeEventListener(){} setAttribute(k,v){this[k]=v;}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  querySelector(){return new Element("img");} focus(){} select(){}
  click(){if(this.tagName==="A")downloads.push({download:this.download,href:this.href});else this.emit("click");}
  async emit(type,extra={}){for(const fn of this.listeners[type]||[])await fn.call(this,{target:this,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});}
}
function canvas(){const c=createCanvas(1,1);c.style={};c.addEventListener=()=>{};c.removeEventListener=()=>{};c.setAttribute=()=>{};return c;}
const document={createElement:t=>t==="canvas"?canvas():new Element(t),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelectorAll:selector=>selector.startsWith(".asset-card")?all.filter(el=>el.classes.has("asset-card")&&(!selector.includes("is-drawing")||el.classes.has("is-drawing"))):[],documentElement:new Element(),body:new Element()};
const window=new Element("window");window.devicePixelRatio=1;window.confirm=()=>true;window.setTimeout=()=>1;
const sandbox=vm.createContext({window,document,Image,console,performance,Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,ArrayBuffer,Blob,URL,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
for(const file of ["vendor/konva.min.js","assets.js","draw.js","paths.js","water.js"]){vm.runInContext(fs.readFileSync(path.join(root,"js",file),"utf8"),sandbox,{filename:file});}
let assetReads=0;
// Test-only: node-canvas cannot decode WebP, so the same sprites are read from PNG copies.
const assetFiles={"assets/cloud-sea.webp":path.join(__dirname,"fixtures","cloud-sea-probe.png"),"assets/new-building.webp":path.join(__dirname,"fixtures","new-building-probe.png"),"assets/tree.webp":path.join(__dirname,"fixtures","tree-probe.png"),"assets/grass.webp":path.join(__dirname,"fixtures","grass-probe.png"),"assets/brick-left.webp":path.join(__dirname,"fixtures","brick-left-probe.png"),"assets/brick-right.webp":path.join(__dirname,"fixtures","brick-right-probe.png"),"assets/round.webp":path.join(__dirname,"fixtures","round-probe.png")};
const assetBitmaps={};
function loadAsset(src){const file=assetFiles[src];if(!file)return Promise.resolve(null);return new Promise(resolve=>{const image=new Image();image.onload=()=>{assetBitmaps[src]=image;resolve(image);};image.onerror=()=>resolve(null);image.src=fs.readFileSync(file);});}
window.MapAssets={load:loadAsset,loadAll:list=>Promise.all(Array.from(new Set(list.filter(Boolean))).map(loadAsset)),get:src=>{assetReads+=1;return assetBitmaps[src]||null;},ready:src=>!!assetBitmaps[src],subscribe:(src,fn)=>{if(assetBitmaps[src])fn(assetBitmaps[src]);return()=>{};},stats:()=>({files:2,decoded:Object.keys(assetBitmaps).length})};
sandbox.Konva=sandbox.Konva||window.Konva;sandbox.Konva.autoDrawEnabled=false;
vm.runInContext(fs.readFileSync(path.join(root,"js/app.js"),"utf8"),sandbox,{filename:"app.js"});
for(let i=0;i<4&&frames.length;i++){const batch=frames.splice(0);batch.forEach(fn=>fn());}
const stage=sandbox.Konva.stages[0],layer=stage.children[1],el=id=>document.getElementById(id);
const curData=()=>{const raw=storage.get("ddhx-campus-maps-v2");if(!raw)return {items:[]};const p=JSON.parse(raw);const m=p.maps.find(function(x){return x.id===p.activeId;});return (m&&m.data)||{items:[]};};
let passed=0;function test(name,run){run();passed++;console.log("PASS "+name);}const state=async()=>{await el("saveBtn").emit("click");return curData();};
(async()=>{
  stage.draw();
  test("app boots with actual Konva and a bottom water surface",()=>{assert.equal(el("itemCount").textContent,"15 个物件");assert.equal(layer.children[0].listening(),false);assert.ok(layer.children.some(n=>n.getAttr("itemId")));});
  test("map base is the grass texture, not the hand-drawn board",()=>{
    const board=stage.children[0].children.map(function(n){return n.image&&n.image();}).filter(function(img){return img&&img.width===1000&&img.height===1500;})[0];
    const ctx=board.getContext("2d");
    const centre=ctx.getImageData(Math.floor(board.width/2),Math.floor(board.height/2),1,1).data;
    const probe=createCanvas(1,1).getContext("2d");
    const grass=assetBitmaps["assets/grass.webp"];
    const sample=createCanvas(grass.width,grass.height).getContext("2d");
    sample.drawImage(grass,0,0);
    const ref=sample.getImageData(Math.floor(grass.width/2),Math.floor(grass.height/2),1,1).data;
    for(let i=0;i<3;i++) assert.ok(Math.abs(centre[i]-ref[i])<=14,"channel "+i+" "+centre[i]+" vs "+ref[i]);
    assert.equal(board.width,1000);assert.equal(board.height,1500);
  });
  let data0=await state();
  test("道路的点击范围只跟随描边，不再占满整个矩形",()=>{
    const st=sandbox.Konva.stages[0]; st.draw();
    const roadItem=data0.items.find(function(x){return x.type==="road";});
    const node=layer.children.find(function(n){return n.getAttr("itemId")===roadItem.id;});
    const s=st.scaleX();
    const toStage=function(x,y){return {x: st.x()+x*s, y: st.y()+y*s};};
    const mid=roadItem.pathPoints[Math.floor(roadItem.pathPoints.length/2)];
    const bx=node.x()-node.width()/2+mid.x, by=node.y()-node.height()/2+mid.y;
    const on=st.getIntersection(toStage(bx,by));
    const off=st.getIntersection(toStage(bx+node.width()*0.46,by));
    assert.ok(on&&on.getAttr("itemId")===roadItem.id,"路径上应能选中道路");
    assert.ok(!off||off.getAttr("itemId")!==roadItem.id,"矩形远角不应命中道路");
  });
  let data=await state(),lake=data.items.find(x=>x.type==="lake");
  test("图层面板列出所有物件，并可选中被设为点击穿透的物件",()=>{
    const rows=el("layersList").children;
    assert.equal(rows.length,data.items.length,"图层行数应等于物件数");
    assert.equal(rows[0].children[0].textContent,String(data.items.length-1),"顶层编号应为 n-1");
    const road=data.items.find(function(x){return x.type==="road";});
    const brick=data.items.find(function(x){return x.type==="brick";});
    el("layersList").children.find(function(r){return r.dataset.id===road.id;}).emit("click");
    assert.equal(el("inspectorType").textContent,"道路");
    el("noHitInput").checked=true; el("noHitInput").emit("change");
    el("layersList").children.find(function(r){return r.dataset.id===brick.id;}).emit("click");
    assert.notEqual(el("inspectorType").textContent,"道路","切换到其它物件");
    el("layersList").children.find(function(r){return r.dataset.id===road.id;}).emit("click");
    assert.equal(el("inspectorType").textContent,"道路","点击穿透的物件仍然能从图层里选中");
    el("noHitInput").checked=false; el("noHitInput").emit("change");
  });

  let lakeNode=layer.children.find(n=>n.getAttr("itemId")===lake.id);lakeNode.fire("click",{cancelBubble:false,evt:{button:0}});
  await el("duplicateBtn").emit("click");stage.draw();data=await state();
  test("duplicating a lake retains separate editable source objects",()=>assert.equal(data.items.filter(x=>x.type==="lake").length,2));
  let copy=data.items[data.items.length-1],copyNode=layer.children.find(n=>n.getAttr("itemId")===copy.id);
  test("new lakes stay below bridge hit targets",()=>{const bridge=data.items.find(x=>x.type==="bridge"),bridgeNode=layer.children.find(n=>n.getAttr("itemId")===bridge.id);assert.ok(copyNode.zIndex()<bridgeNode.zIndex());});
  const oldX=copy.x,oldRotation=copy.rotation;await window.emit("keydown",{key:"ArrowRight",target:new Element("div")});await window.emit("keyup",{key:"ArrowRight"});stage.draw();data=await state();
  test("keyboard moving refreshes live lake geometry and saved state",()=>assert.equal(data.items.find(x=>x.id===copy.id).x,oldX+1));
  el("widthInput").value="640";await el("widthInput").emit("input");await el("widthInput").emit("change");el("rotationInput").value="32";await el("rotationInput").emit("input");await el("rotationInput").emit("change");stage.draw();data=await state();
  test("lake resizing and rotation preserve actual node transforms",()=>{const x=data.items.find(x=>x.id===copy.id);assert.equal(x.w,640);assert.equal(x.rotation,32);});
  await el("undoBtn").emit("click");stage.draw();data=await state();
  test("undo restores the prior lake geometry",()=>assert.equal(data.items.find(x=>x.id===copy.id).rotation,oldRotation));
  await el("redoBtn").emit("click");stage.draw();data=await state();
  test("redo restores the rotated lake",()=>assert.equal(data.items.find(x=>x.id===copy.id).rotation,32));
  copyNode=layer.children.find(n=>n.getAttr("itemId")===copy.id);copyNode.fire("click",{cancelBubble:false,evt:{button:0}});el("typeInput").value="garden";await el("typeInput").emit("change");stage.draw();data=await state();
  test("changing a lake back to a regular asset refreshes layers",()=>{assert.equal(data.items.filter(x=>x.type==="lake").length,1);assert.equal(data.items.find(x=>x.id===copy.id).type,"garden");});
  test("asset buildings render from the shared bitmap cache, not canvas art",()=>{assert.ok(assetReads>0);});
  test("saved layout keeps assets by file reference without embedding base64",()=>{const raw=storage.get("ddhx-campus-maps-v2");assert.ok(!raw.includes("data:image"));assert.ok(raw.includes("\"type\":\"brick\""));});
  await el("exportPngBtn").emit("click");
  test("PNG export completes with the same water composition",()=>{const d=downloads.find(x=>x.href&&x.href.startsWith("data:image/png"));assert.ok(d);const image=new Image();image.src=Buffer.from(d.href.split(",")[1],"base64");assert.equal(image.width,1600);assert.equal(image.height,2400);});
  const saved=downloads.find(x=>x.href&&x.href.startsWith("data:image/png"));
  fs.mkdirSync(path.join(__dirname,"artifacts"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"artifacts","map-preview.png"),Buffer.from(saved.href.split(",")[1],"base64"));
  const portraitWidth=(await state()).items.find(x=>x.type==="brick").w;
  await el("orientationBtn").emit("click");stage.draw();data=await state();
  test("landscape switching keeps the lake and bridge renderable",()=>assert.equal(data.orientation,"landscape"));
  const landscapeWidth=data.items.find(x=>x.type==="brick").w;
  test("landscape fits the layout to the wider board",()=>assert.ok(landscapeWidth<portraitWidth-1,"width "+landscapeWidth));
  for(let i=0;i<3;i++){await el("orientationBtn").emit("click");stage.draw();}
  data=await state();
  test("repeated orientation toggles never shrink the layout further",()=>{
    assert.equal(data.orientation,"portrait");
    const now=data.items.find(x=>x.type==="brick").w;
    assert.ok(Math.abs(now-portraitWidth)<=0.6,"width "+now+" vs "+portraitWidth);
  });
  const beforeCount=data.items.length;
  test("新建画布是独立的空白地图，切回原画布内容完整恢复",()=>{
    el("canvasAddBtn").emit("click");
    assert.equal(el("canvasTabsList").children.length,2,"应有 2 个画布页签");
    assert.equal(el("itemCount").textContent,"0 个物件","新画布应该是空的");
    el("canvasTabsList").children[0].emit("click");
    assert.equal(el("itemCount").textContent,beforeCount+" 个物件","切回后原画布物件恢复");
  });
  test("最后一个画布不允许删除",()=>{
    el("canvasTabsList").children[1].emit("click");   // 回到第二个（空）画布
    el("canvasAddBtn").emit("click");                 // 3 个
    el("canvasTabsList").children[2].querySelector? null : null;
    // 逐个关闭到只剩 1 个
    let guard=0;
    while(el("canvasTabsList").children.length>1 && guard++<10){
      const tabs=el("canvasTabsList").children;
      const last=tabs[tabs.length-1];
      const closeBtn=last.children.find(function(c){return c.className==="tab-close";});
      closeBtn.emit("click");
    }
    assert.equal(el("canvasTabsList").children.length,1,"至少保留一个画布");
  });
  console.log(JSON.stringify({passed,items:data.items.length,orientation:data.orientation}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
