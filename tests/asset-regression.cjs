"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const {createCanvas}=require(process.env.CANVAS_MODULE||process.argv[2]||"canvas");
const root=path.join(__dirname,"..");
let constructed=[];
class FakeImage{
  constructor(){this.width=64;this.height=48;this.naturalWidth=64;this.decoding="";constructed.push(this);}
  set src(v){this._src=v;this.complete=!v.includes("missing");setTimeout(()=>{if(this.complete&&this.onload)this.onload();else if(!this.complete&&this.onerror)this.onerror();},0);}
  get src(){return this._src;}
}
const sandbox=vm.createContext({window:{},document:{createElement:()=>createCanvas(1,1)},Image:FakeImage,console,Promise,setTimeout});
vm.runInContext(fs.readFileSync(path.join(root,"js","assets.js"),"utf8"),sandbox,{filename:"assets.js"});
const A=sandbox.window.MapAssets;
let passed=0;function test(name,run){run();passed++;console.log("PASS "+name);}
(async()=>{
  test("nothing is decoded before a request",()=>{assert.equal(A.get("assets/a.webp"),null);assert.equal(A.ready("assets/a.webp"),false);assert.equal(JSON.stringify(A.stats()),'{"files":0,"decoded":0}');});
  const first=A.load("assets/a.webp");
  test("repeated requests share one in-flight load",()=>{const second=A.load("assets/a.webp");assert.equal(first,second);assert.equal(constructed.length,1);});
  const image=await first;
  test("a finished load is cached and reused",()=>{assert.equal(A.get("assets/a.webp"),image);assert.equal(A.ready("assets/a.webp"),true);assert.equal(constructed.length,1);});
  const before=constructed.length;
  const again=await A.load("assets/a.webp");
  test("later placements never decode the file twice",()=>{assert.equal(again,image);assert.equal(constructed.length,before);});
  const list=await A.loadAll(["assets/a.webp","assets/b.webp","assets/a.webp",null,""]);
  test("batch preload deduplicates the file list",()=>{assert.equal(list.length,2);assert.equal(constructed.length,2);assert.equal(JSON.stringify(A.stats()),'{"files":2,"decoded":2}');});
  let fired=0;
  A.subscribe("assets/a.webp",()=>{fired+=1;});
  test("subscribers on ready files fire immediately",()=>assert.equal(fired,1));
  let late=0;
  A.subscribe("assets/c.webp",()=>{late+=1;});
  test("subscribers on pending files wait for the single load",()=>assert.equal(late,0));
  await A.load("assets/c.webp");await Promise.resolve();
  test("pending subscribers fire exactly once after decode",()=>assert.equal(late,1));
  const failed=await A.load("assets/missing.webp");
  test("decode failures resolve null and never retry the same file",()=>{assert.equal(failed,null);assert.equal(A.get("assets/missing.webp"),null);assert.equal(A.load("assets/missing.webp"),A.load("assets/missing.webp"));});
  console.log(JSON.stringify({passed,decoded:A.stats().decoded,images:constructed.length}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
