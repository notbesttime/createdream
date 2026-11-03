"use strict";
// Dev-only: renders a clean map with the new building sprites into tests/artifacts/map-showcase.png
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createCanvas,Image}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,".."),all=[],elements=new Map(),frames=[],storage=new Map(),downloads=[];
class Element{
  constructor(tag="div"){this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.listeners={};this.clientWidth=1200;this.clientHeight=850;this.value="";this.files=[];this.hidden=false;this.classes=new Set();all.push(this);this.classList={add:(...x)=>x.forEach(y=>this.classes.add(y)),remove:(...x)=>x.forEach(y=>this.classes.delete(y)),toggle:(x,v)=>{const on=v===undefined?!this.classes.has(x):v;on?this.classes.add(x):this.classes.delete(x);return on;}};}
  set innerHTML(v){ this._html = v; this.children.length = 0; } get innerHTML(){ return this._html || ""; }
  set className(v){this.classes=new Set(v.split(" "));} get className(){return [...this.classes].join(" ");}
  appendChild(x){this.children.push(x);x.parentElement=this;return x;} remove(){}
  addEventListener(k,f){(this.listeners[k]||=[]).push(f);} removeEventListener(){} setAttribute(k,v){this[k]=v;}
  getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  querySelector(){return new Element("img");} focus(){} select(){}
  click(){if(this.tagName==="A")downloads.push({href:this.href});else this.emit("click");}
  async emit(type,extra={}){for(const fn of this.listeners[type]||[])await fn.call(this,{target:this,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});}
}
function canvas(){const c=createCanvas(1,1);c.style={};c.addEventListener=()=>{};c.setAttribute=()=>{};return c;}
const document={createElement:t=>t==="canvas"?canvas():new Element(t),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelectorAll:()=>[],documentElement:new Element(),body:new Element()};
const window=new Element("window");window.setTimeout=()=>1;
const sandbox=vm.createContext({window,document,Image,console,performance,Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,ArrayBuffer,Blob,URL,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
for(const f of ["vendor/konva.min.js","assets.js","draw.js","paths.js","water.js"])vm.runInContext(fs.readFileSync(path.join(root,"js",f),"utf8"),sandbox,{filename:f});
const files={"assets/cloud-sea.webp":path.join(__dirname,"fixtures","cloud-sea-probe.png"),"assets/new-building.webp":path.join(__dirname,"fixtures","new-building-probe.png"),"assets/tree.webp":path.join(__dirname,"fixtures","tree-probe.png"),"assets/grass.webp":path.join(__dirname,"fixtures","grass-probe.png"),"assets/brick-left.webp":path.join(__dirname,"fixtures","brick-left-probe.png"),"assets/brick-right.webp":path.join(__dirname,"fixtures","brick-right-probe.png"),"assets/round.webp":path.join(__dirname,"fixtures","round-probe.png")},bitmaps={};
const loadAsset=src=>new Promise(resolve=>{const file=files[src];if(!file)return resolve(null);const image=new Image();image.onload=()=>{bitmaps[src]=image;resolve(image);};image.onerror=()=>resolve(null);image.src=fs.readFileSync(file);});
window.MapAssets={load:loadAsset,loadAll:l=>Promise.all(Array.from(new Set(l.filter(Boolean))).map(loadAsset)),get:s=>bitmaps[s]||null,ready:s=>!!bitmaps[s],subscribe:(s,fn)=>{if(bitmaps[s])fn(bitmaps[s]);return()=>{};},stats:()=>({files:2,decoded:Object.keys(bitmaps).length})};
sandbox.Konva=window.Konva;sandbox.Konva.autoDrawEnabled=false;
vm.runInContext(fs.readFileSync(path.join(root,"js/app.js"),"utf8"),sandbox,{filename:"app.js"});
(async()=>{
  for(const key of Object.keys(files))await loadAsset(key);
  const stage=sandbox.Konva.stages[0];
  const el=id=>document.getElementById(id);
const curData=()=>{const raw=storage.get("ddhx-campus-maps-v2");if(!raw)return {items:[]};const p=JSON.parse(raw);const m=p.maps.find(function(x){return x.id===p.activeId;});return (m&&m.data)||{items:[]};};
  const add=async(type,x,y,w,h,name)=>{const card={dataset:{type},classes:new Set(["asset-card"]),addEventListener(){}};
    const before=curData();
    el("nameInput").value="";el("widthInput").value="";el("heightInput").value="";el("rotationInput").value="";
    return {type,x,y,w,h,name,before};};
  // Add through the palette path so the app builds the nodes itself.
  const state=async()=>{await el("saveBtn").emit("click");return curData();};
  let data=await state();
  const seed=data.items;
  // Replace demo placements with a clean layout using the new sprites.
  const types=["newbuilding","brick","round","brick"];
  const pos=[[330,330,300,197],[700,300,250,163],[430,700,260,202],[720,720,250,163]];
  const Konva=sandbox.Konva;
  for(let i=0;i<types.length;i++){
    const btn=all.find(x=>x.classes.has("asset-card")&&x.dataset.type===types[i]);
    if(btn){await btn.emit("click");}
    await el("saveBtn").emit("click");
    const saved=curData();
    const item=saved.items[saved.items.length-1];
    const node=stage.children[1].children.find(n=>n.getAttr("itemId")===item.id);
    if(node){node.position({x:pos[i][0],y:pos[i][1]});node.width(pos[i][2]);node.height(pos[i][3]);node.offset({x:pos[i][2]/2,y:pos[i][3]/2});node.fire("dragend");}
  }
  await el("exportPngBtn").emit("click");
  const png=downloads.find(d=>d.href&&d.href.startsWith("data:image/png"));
  fs.mkdirSync(path.join(__dirname,"artifacts"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"artifacts","map-showcase.png"),Buffer.from(png.href.split(",")[1],"base64"));
  downloads.length=0;
  await el("orientationBtn").emit("click");
  await el("exportPngBtn").emit("click");
  const wide=downloads.find(d=>d.href&&d.href.startsWith("data:image/png"));
  fs.writeFileSync(path.join(__dirname,"artifacts","map-showcase-landscape.png"),Buffer.from(wide.href.split(",")[1],"base64"));
  await el("saveBtn").emit("click");
  const finalTypes=curData().items.map(function(i){return i.type;});
  console.log(JSON.stringify({ok:true,file:path.join(__dirname,"artifacts","map-showcase.png")}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
