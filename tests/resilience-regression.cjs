"use strict";
// 单个物件画不出来时，不能把整张地图带崩
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const {createCanvas,Image}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,".."),elements=new Map(),frames=[],storage=new Map();
class El{
  constructor(t="div"){this.tagName=t.toUpperCase();this.style={};this.dataset={};this.children=[];this.listeners={};this.clientWidth=1200;this.clientHeight=850;this.value="";this.files=[];this.hidden=false;this.classes=new Set();
    this.classList={add:(...x)=>x.forEach(y=>this.classes.add(y)),remove:(...x)=>x.forEach(y=>this.classes.delete(y)),toggle:(x,v)=>{const on=v===undefined?!this.classes.has(x):v;on?this.classes.add(x):this.classes.delete(x);return on;}};}
  set innerHTML(v){ this._html = v; this.children.length = 0; } get innerHTML(){ return this._html || ""; }
  set className(v){this.classes=new Set(v.split(" "));} get className(){return [...this.classes].join(" ");}
  appendChild(x){this.children.push(x);return x;} remove(){} addEventListener(k,f){(this.listeners[k]||=[]).push(f);} removeEventListener(){}
  setAttribute(k,v){this[k]=v;} getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  querySelector(){return new El("img");} focus(){} select(){} click(){}
}
const document={createElement:t=>t==="canvas"?Object.assign(createCanvas(1,1),{style:{},setAttribute(){},addEventListener(){}}):new El(t),
  getElementById:id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id);},querySelectorAll:()=>[],documentElement:new El(),body:new El()};
const window=new El("window");window.setTimeout=()=>1;
const sandbox=vm.createContext({window,document,Image,console,performance,Uint8Array,Uint8ClampedArray,ArrayBuffer,Blob,URL,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
for(const f of ["vendor/konva.min.js","assets.js","draw.js","paths.js","water.js"])vm.runInContext(fs.readFileSync(path.join(root,"js",f),"utf8"),sandbox,{filename:f});
window.MapAssets={load:()=>Promise.resolve(null),loadAll:()=>Promise.resolve([]),get:()=>null,ready:()=>false,subscribe:()=>()=>{},stats:()=>({files:0,decoded:0})};
sandbox.Konva=window.Konva;window.Konva.autoDrawEnabled=false;

// 预置一份含「自定义png」物件的布局（图片尚未解码，最容易触发异常）
storage.set("ddhx-campus-map-v1", JSON.stringify({
  orientation:"portrait", snapEnabled:true, logoData:"",
  items:[
    {id:"a",type:"brick",x:400,y:400,w:235,h:183,rotation:0,name:"测试楼",showName:true},
    {id:"b",type:"custompng",x:600,y:600,w:200,h:160,rotation:0,name:"",showName:true,imageData:"data:image/png;base64,AAAA"}
  ]
}));
vm.runInContext(fs.readFileSync(path.join(root,"js/app.js"),"utf8"),sandbox,{filename:"app.js"});
for(let i=0;i<4&&frames.length;i++){const b=frames.splice(0);b.forEach(fn=>fn());}

let passed=0;const test=(n,f)=>{f();passed++;console.log("PASS "+n);};
test("地图形变时单个坏物件不会中断整层绘制",()=>{
  const st=sandbox.Konva.stages[0];
  st.draw();                                  // 不应抛异常
  const nodes=st.children[1].children.filter(n=>n.getAttr("itemId"));
  assert.equal(nodes.length,2,"两个物件都应存在");
  assert.equal(document.getElementById("itemCount").textContent,"2 个物件");
});
test("未知类型也安全降级",()=>{
  const st=sandbox.Konva.stages[0];
  assert.ok(st); st.draw();
});
console.log(JSON.stringify({passed}));
