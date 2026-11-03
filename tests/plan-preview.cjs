"use strict";
// 用内置默认布局导出一张图，检查校徽+校名的排版
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createCanvas,Image}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,".."),elements=new Map(),frames=[],storage=new Map(),downloads=[];
class El{
  constructor(t="div"){this.tagName=t.toUpperCase();this.style={};this.dataset={};this.children=[];this.listeners={};this.clientWidth=1200;this.clientHeight=850;this.value="";this.files=[];this.hidden=false;this.classes=new Set();
    this.classList={add:(...x)=>x.forEach(y=>this.classes.add(y)),remove:(...x)=>x.forEach(y=>this.classes.delete(y)),toggle:(x,v)=>{const on=v===undefined?!this.classes.has(x):v;on?this.classes.add(x):this.classes.delete(x);return on;}};}
  set innerHTML(v){ this._html=v; this.children.length=0; } get innerHTML(){ return this._html||""; }
  set className(v){this.classes=new Set(v.split(" "));} get className(){return [...this.classes].join(" ");}
  appendChild(x){this.children.push(x);return x;} remove(){} addEventListener(k,f){(this.listeners[k]||=[]).push(f);} removeEventListener(){}
  setAttribute(k,v){this[k]=v;} getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  querySelector(){return new El("img");} focus(){} select(){}
  click(){if(this.tagName==="A")downloads.push({href:this.href});}
  async emit(t,e={}){for(const fn of this.listeners[t]||[])await fn.call(this,{target:this,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...e});}
}
const document={createElement:t=>t==="canvas"?Object.assign(createCanvas(1,1),{style:{},setAttribute(){},addEventListener(){}}):new El(t),
  getElementById:id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id);},querySelectorAll:()=>[],documentElement:new El(),body:new El()};
const window=new El("window");window.setTimeout=()=>1;
const sandbox=vm.createContext({window,document,Image,console,performance,Uint8Array,Uint8ClampedArray,ArrayBuffer,Blob,URL,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
for(const f of ["vendor/konva.min.js","assets.js","draw.js","paths.js","water.js"])vm.runInContext(fs.readFileSync(path.join(root,"js",f),"utf8"),sandbox,{filename:f});
window.DEFAULT_LAYOUT = JSON.parse(fs.readFileSync(process.argv[3] || path.join(root,"assets","plan-layout.json"), "utf8"));
const files={"assets/grass.webp":"grass-probe.png","assets/cloud-sea.webp":"cloud-sea-probe.png","assets/brick-left.webp":"brick-left-probe.png","assets/brick-right.webp":"brick-right-probe.png","assets/round.webp":"round-probe.png","assets/tree.webp":"tree-probe.png","assets/new-building.webp":"new-building-probe.png"};
const bitmaps={};
const loadAsset=src=>new Promise(res=>{const f=files[src];if(!f)return res(null);const img=new Image();img.onload=()=>{bitmaps[src]=img;res(img);};img.onerror=()=>res(null);img.src=fs.readFileSync(path.join(__dirname,"fixtures",f));});
window.MapAssets={load:loadAsset,loadAll:l=>Promise.all(Array.from(new Set(l.filter(Boolean))).map(loadAsset)),get:s=>bitmaps[s]||null,ready:s=>!!bitmaps[s],subscribe:(s,fn)=>{if(bitmaps[s])fn(bitmaps[s]);return()=>{};},stats:()=>({files:0,decoded:0})};
sandbox.Konva=window.Konva;window.Konva.autoDrawEnabled=false;
vm.runInContext(fs.readFileSync(path.join(root,"js/app.js"),"utf8"),sandbox,{filename:"app.js"});
(async()=>{
  for (const k of Object.keys(files)) await loadAsset(k);
  const el=id=>document.getElementById(id);
  for(let i=0;i<4&&frames.length;i++){const b=frames.splice(0);b.forEach(fn=>fn());}
  await el("exportPngBtn").emit("click");
  const d=downloads.find(x=>x.href&&x.href.startsWith("data:image/png"));
  if(!d) throw new Error("export failed");
  fs.mkdirSync(path.join(__dirname,"artifacts"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"artifacts","plan-preview.png"),Buffer.from(d.href.split(",")[1],"base64"));
  console.log(JSON.stringify({ok:true,items:el("itemCount").textContent,orientation:el("orientationLabel").textContent}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});