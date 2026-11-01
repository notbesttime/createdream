"use strict";
// Run: node tests/path-regression.cjs /path/to/node_modules/canvas
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const { createCanvas } = require(process.env.CANVAS_MODULE || process.argv[2] || "canvas");
const root = path.join(__dirname, "..");
const sandbox = vm.createContext({ window: {}, document: { createElement: () => createCanvas(1, 1) }, console, Math, JSON });
["draw.js", "paths.js"].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), sandbox, { filename: f }));
const P = sandbox.window.MapPaths;
const W = 800, H = 600;
const data = canvas => new Uint8ClampedArray(canvas.getContext("2d").getImageData(0, 0, W, H).data);
const px = (d, x, y) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
function median(d, cx, cy, r) {
  const out = [[], [], [], []];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const p = px(d, x, y); for (let i = 0; i < 4; i++) out[i].push(p[i]);
  }
  return out.map(a => { a.sort((m, n) => m - n); return a[a.length >> 1]; });
}
const lum = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114);
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }

const seg = (x1, x2, y = 300) => [{ x: x1, y: y }, { x: (x1 + x2) / 2, y: y }, { x: x2, y: y }];

test("a single road fills its body with the road surface", () => {
  const d = data(P.renderRoads(W, H, [{ points: seg(120, 680), thickness: 42 }]));
  const body = median(d, 400, 300, 2);
  assert.ok(body[3] > 240, "alpha " + body[3]);
  assert.ok(lum(body) > 180, "body too dark " + body);
});
test("two joined road segments have no internal seam", () => {
  const one = data(P.renderRoads(W, H, [{ points: seg(120, 680), thickness: 42 }]));
  const two = data(P.renderRoads(W, H, [{ points: seg(120, 400), thickness: 42 }, { points: seg(400, 680), thickness: 42 }]));
  const a = median(one, 400, 300, 2), b = median(two, 400, 300, 2);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 12, "channel " + i + " " + a[i] + " vs " + b[i]);
  assert.ok(Math.abs(lum(a) - lum(b)) <= 10, "joint darker than a continuous road");
});
test("roads are clipped at the board edge", () => {
  const d = data(P.renderRoads(W, H, [{ points: [{ x: 600, y: 300 }, { x: 900, y: 300 }, { x: 1100, y: 300 }], thickness: 42 }]));
  assert.equal(px(d, 799, 300)[3], 255, "inside should be painted");
  assert.equal(px(d, 820, 300)[3], 0);
});
test("a duplicated road never double-darkens the shared overlap", () => {
  const once = data(P.renderRoads(W, H, [{ points: seg(120, 680), thickness: 42 }]));
  const twice = data(P.renderRoads(W, H, [{ points: seg(120, 680), thickness: 42 }, { points: seg(120, 680), thickness: 42 }]));
  const a = median(once, 400, 300, 2), b = median(twice, 400, 300, 2);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 2, "channel " + i);
});
test("a single bridge draws a solid deck", () => {
  const d = data(P.renderBridges(W, H, [{ points: [{ x: 120, y: 300 }, { x: 680, y: 300 }], thickness: 58 }]));
  const deck = median(d, 400, 296, 2);
  assert.equal(deck[3], 255); assert.ok(lum(deck) > 60, "deck " + deck);
});
test("joined bridge segments leave no vertical cut at the joint", () => {
  const one = data(P.renderBridges(W, H, [{ points: [{ x: 120, y: 300 }, { x: 680, y: 300 }], thickness: 58 }]));
  const two = data(P.renderBridges(W, H, [{ points: [{ x: 120, y: 300 }, { x: 400, y: 300 }], thickness: 58 },
                                          { points: [{ x: 400, y: 300 }, { x: 680, y: 300 }], thickness: 58 }]));
  const a = median(one, 400, 296, 2), b = median(two, 400, 296, 2);
  assert.ok(Math.abs(lum(a) - lum(b)) <= 26, "joint luminance " + lum(a).toFixed(1) + " vs " + lum(b).toFixed(1));
});
test("bridges are clipped at the board edge", () => {
  const d = data(P.renderBridges(W, H, [{ points: [{ x: 600, y: 300 }, { x: 950, y: 300 }], thickness: 58 }]));
  assert.equal(px(d, 820, 300)[3], 0);
});
test("empty path sets render as a fully transparent canvas", () => {
  for (const canvas of [P.renderRoads(W, H, []), P.renderBridges(W, H, [])]) {
    const d = new Uint8ClampedArray(canvas.getContext("2d").getImageData(0, 0, W, H).data);
    assert.ok(d.every(v => v === 0));
  }
});
test("unchanged geometry reuses the cached canvas", () => {
  const list = [{ points: seg(120, 680), thickness: 42 }];
  assert.equal(P.renderRoads(W, H, list), P.renderRoads(W, H, list));
  const bridges = [{ points: [{ x: 120, y: 300 }, { x: 680, y: 300 }], thickness: 58 }];
  assert.equal(P.renderBridges(W, H, bridges), P.renderBridges(W, H, bridges));
});
console.log(JSON.stringify({ passed }));
