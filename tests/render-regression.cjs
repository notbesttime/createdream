"use strict";
// Run: CANVAS_MODULE=/path/to/canvas node tests/render-regression.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createCanvas } = require(process.env.CANVAS_MODULE || process.argv[2] || "canvas");
const root = path.join(__dirname, "..");
const sandbox = vm.createContext({ window: {}, document: { createElement: () => createCanvas(1, 1) }, console });
["draw.js", "water.js"].forEach(file => vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), sandbox, { filename: file }));
const ART = sandbox.window.MapArt, renderer = sandbox.window.MapWater.createRenderer();
const W = 800, H = 620;
const rect = (x, y, w, h, rotation = 0) => ({ x, y, w, h, rotation, pathBaseW: w, pathBaseH: h,
  pathPoints: [{x:0,y:0},{x:w/2,y:0},{x:w,y:0},{x:w,y:h/2},{x:w,y:h},{x:w/2,y:h},{x:0,y:h},{x:0,y:h/2}] });
const pixels = canvas => new Uint8ClampedArray(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data);
const at = (data, x, y) => Array.from(data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const a = rect(280, 280, 300, 260), b = rect(460, 280, 300, 260);
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const one = pixels(renderer.render(W, H, [b]));
const joined = pixels(renderer.render(W, H, [a,b]));
test("overlap former shoreline has no internal bank or color step", () => {
  for (let y=220; y<=330; y+=5) for (let x=416; x<=444; x+=2) assert.deepEqual(at(joined,x,y), at(one,x,y));
});
const reversed = pixels(renderer.render(W,H,[b,a]));
test("water composition is independent of object order", () => {
  let max=0; for(let i=0;i<joined.length;i++) max=Math.max(max, Math.abs(joined[i]-reversed[i])); assert.ok(max<=1,"maximum pixel delta "+max);
});
const duplicate = pixels(renderer.render(W,H,[b,b]));
test("duplicate water never doubles opacity or darkens the interior", () => {
  for(let y=200;y<360;y+=8) for(let x=360;x<560;x+=8) assert.deepEqual(at(duplicate,x,y),at(one,x,y));
});
const separated = pixels(renderer.render(W,H,[rect(150,280,160,180),rect(650,280,160,180)]));
test("separated lakes retain dry land between them",()=>assert.equal(at(separated,400,280)[3],0));
const ring = [rect(280,310,100,320),rect(520,310,100,320),rect(400,170,320,100),rect(400,450,320,100)];
const island = pixels(renderer.render(W,H,ring));
test("a dry island inside a lake ring stays unpainted",()=>assert.equal(at(island,400,310)[3],0));
const rotated = pixels(renderer.render(W,H,[rect(400,300,330,200,37)]));
test("rotated and resized lake masks render at the current transform",()=>assert.equal(at(rotated,400,300)[3],255));
const empty = pixels(renderer.render(W,H,[]));
test("deleting all lakes clears the cached surface",()=>assert.ok(empty.every(value=>value===0)));
const cached = renderer.render(W,H,[a,b]);
test("unchanged geometry reuses the render surface",()=>assert.equal(renderer.render(W,H,[a,b]),cached));
const restored = pixels(renderer.render(W,H,[a,b]));
test("undo-equivalent geometry returns the original pixels",()=>assert.deepEqual(restored,joined));
test("portrait and landscape canvas changes rebuild the buffers",()=>{
  const landscape=renderer.render(1000,600,[a,b]);assert.equal(landscape.width,1000);assert.equal(landscape.height,600);
  renderer.render(W,H,[a,b]);
});
test("all asset thumbnails remain renderable",()=>ART.definitions.forEach(def=>assert.ok(ART.thumbnail(def.type).startsWith("data:image/png"))));
test("bridge handles curved, vertical, short and repeated-point paths",()=>{
  const ctx=createCanvas(800,620).getContext("2d");
  [[{x:50,y:60},{x:650,y:60}],[{x:400,y:80},{x:400,y:500}],[{x:80,y:90},{x:250,y:260},{x:460,y:120},{x:650,y:340}],[{x:200,y:200},{x:201,y:201}],[{x:300,y:300},{x:300,y:300},{x:400,y:300}]].forEach(points=>ART.draw.bridge(ctx,W,H,{pathPoints:points,pathBaseW:W,pathBaseH:H,pathThickness:58}));
});
const started=performance.now();
for(let i=0;i<8;i++)renderer.render(W,H,[a,rect(460+i,280,300,260)]);
console.log("Mean changed-mask render: "+((performance.now()-started)/8).toFixed(1)+" ms (node-canvas)");
const preview=createCanvas(1160,810), ctx=preview.getContext("2d");
ctx.fillStyle="#f4f1e7";ctx.fillRect(0,0,1160,810);
ctx.fillStyle="#354d42";ctx.font="bold 25px sans-serif";ctx.fillText("LAKE JOIN / HIGH-ANGLE BRIDGE",34,43);
ctx.font="16px sans-serif";ctx.fillText("Before: independent lake edges",34,84);ctx.fillText("After: one continuous water surface",610,84);
function panel(x,y,w,h){ctx.fillStyle="#adbd89";ctx.fillRect(x,y,w,h);}
panel(28,102,535,304);panel(596,102,535,304);
const lakes=[{x:230,y:200,w:350,h:280,rotation:-9},{x:416,y:240,w:350,h:265,rotation:13}];
ctx.save();ctx.translate(28,102);ctx.scale(.84,.72);
lakes.forEach(lake=>{ctx.save();ctx.translate(lake.x,lake.y);ctx.rotate(lake.rotation*Math.PI/180);ctx.translate(-lake.w/2,-lake.h/2);ART.draw.lake(ctx,lake.w,lake.h,lake);ctx.restore();});ctx.restore();
ctx.save();ctx.translate(596,102);ctx.scale(.84,.72);ctx.drawImage(renderer.render(W,H,lakes),0,0);ctx.restore();
ctx.fillStyle="#354d42";ctx.font="16px sans-serif";ctx.fillText("Bridge: visible deck depth, upright posts, front / rear rails",34,450);
panel(28,467,1103,310);
const bridgeLake=[rect(560,150,1060,290)];
ctx.save();ctx.translate(28,467);ctx.drawImage(renderer.render(1103,310,bridgeLake),0,0);
ART.draw.bridge(ctx,1103,310,{pathPoints:[{x:80,y:108},{x:260,y:110},{x:420,y:154},{x:570,y:180},{x:730,y:135},{x:1005,y:145}],pathBaseW:1103,pathBaseH:310,pathThickness:64});ctx.restore();
const out=path.join(__dirname,"artifacts");fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,"lake-bridge-preview.png"),preview.toBuffer("image/png"));
console.log(JSON.stringify({passed,preview:path.join(out,"lake-bridge-preview.png")}));
