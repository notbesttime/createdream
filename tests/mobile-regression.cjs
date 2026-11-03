"use strict";
// Real Konva + Canvas; emulate only DOM sizing and native pointer events.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const { createCanvas, Image } = require(process.env.CANVAS_MODULE || process.argv[2] || "canvas");
const root = path.join(__dirname, "..");
const elements = new Map(), all = [], frames = [], timers = [], storage = new Map();
let screenWidth = 390, screenHeight = 844, coarsePointer = true, prompts = ["手机地图"], passed = 0;
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.style = {}; this.dataset = {}; this.children = []; this.listeners = {};
    this.clientWidth = 390; this.clientHeight = 640; this.hidden = false; this.files = []; this.value = ""; this.classes = new Set(); all.push(this);
    this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x),
      toggle: (x, v) => { const on = v === undefined ? !this.classes.has(x) : v; on ? this.classes.add(x) : this.classes.delete(x); return on; } };
  }
  set innerHTML(v) { this._html = v; this.children = []; } get innerHTML() { return this._html || ""; }
  set className(v) { this.classes = new Set(v.split(" ")); } get className() { return [...this.classes].join(" "); }
  appendChild(el) { this.children.push(el); el.parentElement = this; return el; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); } removeEventListener() {}
  setAttribute(k, v) { this[k] = String(v); } getAttribute(k) { return this[k] === undefined ? null : this[k]; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight }; }
  querySelector() { return new Element("img"); } closest() { return null; } focus() {} select() {} click() {} setPointerCapture() {}
  async emit(type, extra = {}) {
    let stopped = false;
    const evt = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { stopped = true; }, ...extra };
    for (const fn of this.listeners[type] || []) { await fn.call(this, evt); if (stopped) break; }
  }
}
const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
const workspace = new Element(); el("stageWrap").parentElement = workspace;
const document = { createElement: tag => tag === "canvas" ? Object.assign(createCanvas(1, 1), { style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) : new Element(tag),
  getElementById: el, querySelectorAll: selector => all.filter(x => x.classes.has("asset-card") && (!selector.includes("is-drawing") || x.classes.has("is-drawing"))), body: new Element(), documentElement: new Element() };
const window = new Element("window"); window.devicePixelRatio = 1; window.confirm = () => true; window.prompt = () => prompts.shift(); window.setTimeout = fn => { timers.push(fn); return timers.length; };
window.matchMedia = query => ({ matches: query.includes("max-width") ? screenWidth <= 900 || (query.includes("max-height") && coarsePointer && screenHeight <= 500) : query.includes("coarse") && coarsePointer, addEventListener() {} });
const sandbox = vm.createContext({ window, document, Image, console, performance, Uint8Array, Uint8ClampedArray, Float32Array, Float64Array, ArrayBuffer, Blob, URL,
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {} });
for (const file of ["vendor/konva.min.js", "assets.js", "draw.js", "paths.js", "water.js", "default-layout.js"]) vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), sandbox, { filename: file });
const bitmaps = {}, loads = new Map();
function load(src) {
  if (loads.has(src)) return loads.get(src);
  const promise = new Promise(resolve => {
    const file = path.join(__dirname, "fixtures", path.basename(src, ".webp") + "-probe.png");
    if (!fs.existsSync(file)) return resolve(null);
    const img = new Image(); img.onload = () => { bitmaps[src] = img; resolve(img); }; img.onerror = () => resolve(null); img.src = fs.readFileSync(file);
  }); loads.set(src, promise); return promise;
}
window.MapAssets = { load, loadAll: list => Promise.all([...new Set(list.filter(Boolean))].map(load)), get: src => bitmaps[src] || null, ready: src => !!bitmaps[src] };
sandbox.Konva = window.Konva; sandbox.Konva.autoDrawEnabled = false;
vm.runInContext(fs.readFileSync(path.join(root, "js", "app.js"), "utf8"), sandbox, { filename: "app.js" });
const stage = sandbox.Konva.stages[0], layer = stage.children[1];
const flush = () => { for (let i = 0; i < 8 && frames.length; i++) frames.splice(0).forEach(fn => fn()); stage.draw(); };
const state = async () => { await el("saveBtn").emit("click"); const data = JSON.parse(storage.get("ddhx-campus-maps-v2")); return data.maps.find(m => m.id === data.activeId).data; };
const card = type => all.filter(x => x.classes.has("asset-card") && x.dataset.type === type).at(-1);
const touch = (type, id, x, y) => el("stageContainer").emit(type, { pointerType: "touch", pointerId: id, button: 0, clientX: x, clientY: y });
async function test(name, run) { timers.splice(0).forEach(fn => fn()); await run(); passed++; console.log("PASS " + name); }
(async () => {
  flush();
  await test("portrait starts with the default map and closed mobile panels", async () => {
    assert.equal((await state()).items.length, 32); assert.ok(stage.scaleX() < .5); assert.equal(el("mobileInspectorBtn").disabled, true);
    assert.ok(!workspace.classList.contains("mobile-layers-open"));
  });
  await test("mobile drawers are mutually exclusive and report their state", async () => {
    await el("mobilePaletteBtn").emit("click"); assert.ok(workspace.classList.contains("mobile-palette-open"));
    await el("mobileLayersBtn").emit("click"); assert.ok(!workspace.classList.contains("mobile-palette-open"));
    assert.equal(el("mobileLayersBtn").getAttribute("aria-expanded"), "true");
    await el("layersCloseBtn").emit("click"); assert.ok(!workspace.classList.contains("mobile-layers-open"));
  });
  await test("tap a library asset to place it and release the map view", async () => {
    const count = (await state()).items.length; await el("mobilePaletteBtn").emit("click"); await card("tree").emit("click");
    assert.equal((await state()).items.length, count + 1); assert.ok(!workspace.classList.contains("mobile-palette-open"));
    assert.equal(el("mobileInspectorBtn").disabled, false); assert.ok(!workspace.classList.contains("mobile-inspector-open"));
  });
  await test("layers expose selection and up/down controls without native dragging", async () => {
    const row = el("layersList").children[1], id = row.dataset.id; assert.equal(row.draggable, false);
    await row.emit("click"); assert.ok(workspace.classList.contains("mobile-inspector-open"));
    const before = (await state()).items.findIndex(x => x.id === id);
    await el("layersList").children.find(x => x.dataset.id === id).children.find(x => x.className === "layer-nudge").emit("click");
    assert.equal((await state()).items.findIndex(x => x.id === id), before + 1);
    await el("inspectorClose").emit("click"); assert.equal(el("mobileInspectorBtn").disabled, true); assert.ok(!workspace.classList.contains("mobile-inspector-open"));
  });
  await test("a tap button renames a canvas on touch screens", async () => {
    await el("canvasTabsList").children[0].children.find(x => x.className === "tab-rename-button").emit("click");
    assert.equal(JSON.parse(storage.get("ddhx-campus-maps-v2")).maps[0].name, "手机地图");
  });
  await test("pinch zoom and two-finger pan affect only the viewport", async () => {
    const before = await state(), scale = stage.scaleX();
    await touch("pointerdown", 1, 130, 220); await touch("pointerdown", 2, 230, 220);
    await touch("pointermove", 2, 290, 250); assert.ok(stage.scaleX() > scale * 1.5);
    await touch("pointerup", 2, 290, 250); await touch("pointerup", 1, 130, 220);
    assert.deepEqual(await state(), before); assert.equal(stage.draggable(), true);
  });
  await test("rotating the phone refits the viewport without shrinking map objects", async () => {
    const before = await state();
    for (const [width, height] of [[844, 240], [390, 640]]) {
      screenWidth = width; el("stageWrap").clientWidth = width; el("stageWrap").clientHeight = height;
      await window.emit("resize"); flush(); assert.equal(stage.width(), width); assert.equal(stage.height(), height);
      assert.ok(stage.scaleX() * 1500 <= height + 1); assert.deepEqual(await state(), before);
    }
  });
  await test("drawing is canceled when a second finger starts navigation", async () => {
    const before = (await state()).items.length;
    await el("mobilePaletteBtn").emit("click"); await card("road").emit("click");
    await touch("pointerdown", 1, 130, 220); await touch("pointermove", 1, 180, 270);
    await touch("pointerdown", 2, 250, 260); await touch("pointermove", 2, 300, 280);
    await touch("pointerup", 1, 180, 270); await touch("pointerup", 2, 300, 280);
    assert.equal((await state()).items.length, before);
    await touch("pointerdown", 3, 130, 220); await touch("pointermove", 3, 210, 300); await touch("pointerup", 3, 240, 330);
    assert.equal((await state()).items.length, before + 1);
  });
  await test("a canceled touch does not leave a partial road in storage", async () => {
    const before = (await state()).items.length; await card("road").emit("click");
    await touch("pointerdown", 1, 130, 220); await touch("pointermove", 1, 200, 300); await touch("pointercancel", 1, 200, 300);
    assert.equal((await state()).items.length, before); await el("drawCancelBtn").emit("click");
  });
  await test("click-through objects stay locked after drawing mode and a pinch", async () => {
    const data = await state(), road = data.items.find(x => x.type === "road");
    await el("layersList").children.find(x => x.dataset.id === road.id).emit("click");
    el("noHitInput").checked = true; await el("noHitInput").emit("change");
    await card("lake").emit("click"); await el("drawCancelBtn").emit("click");
    await touch("pointerdown", 1, 130, 220); await touch("pointerdown", 2, 230, 220);
    await touch("pointerup", 1, 130, 220); await touch("pointerup", 2, 230, 220);
    const node = layer.children.find(x => x.getAttr("itemId") === road.id); assert.equal(node.draggable(), false); assert.equal(node.listening(), false);
  });
  await test("new mobile canvas inherits the current layout but stays independent", async () => {
    const before = await state();
    await el("canvasAddBtn").emit("click");
    assert.equal((await state()).items.length, before.items.length, "新画布沿用当前布局");
    await card("tree").emit("click");
    assert.equal((await state()).items.length, before.items.length + 1, "只修改新画布");
    await el("canvasTabsList").children[0].emit("click");
    const normalized = layout => ({ ...layout, items: layout.items.map(item => {
      const copy = { ...item }; if (!copy.pathPoints) { delete copy.pathBaseW; delete copy.pathBaseH; } return copy;
    }) });
    assert.deepEqual(normalized(await state()), normalized(before));
  });
  await test("native touch stream is blocked during pinch and resumes afterwards", async () => {
    let visits = 0;
    for (const type of ["touchstart", "touchmove", "touchend"]) el("stageContainer").addEventListener(type, () => { visits++; });
    const before = await state();
    await touch("pointerdown", 1, 120, 240);
    await el("stageContainer").emit("touchstart", { touches: [{}] });
    assert.equal(visits, 1);
    await touch("pointerdown", 2, 220, 240);
    await el("stageContainer").emit("touchstart", { touches: [{}, {}] });
    await touch("pointermove", 2, 290, 270);
    await el("stageContainer").emit("touchmove", { touches: [{}, {}] });
    await touch("pointerup", 2, 290, 270);
    await el("stageContainer").emit("touchend", { touches: [{}] });
    await touch("pointerup", 1, 120, 240);
    await el("stageContainer").emit("touchend", { touches: [] });
    assert.equal(visits, 1, "pinch events must not reach Konva or its Transformer");
    assert.deepEqual(await state(), before);
    timers.splice(0).forEach(fn => fn());
    await el("stageContainer").emit("touchstart", { touches: [{}] });
    assert.equal(visits, 2);
  });
  await test("932px and 956px phone landscape keep mobile tools", async () => {
    const before = await state();
    for (const [width, height] of [[932, 430], [956, 440]]) {
      screenWidth = width; screenHeight = height;
      el("stageWrap").clientWidth = width; el("stageWrap").clientHeight = height - 150;
      await window.emit("resize"); flush();
      assert.equal(el("layersList").children[0].draggable, false);
      await el("mobileLayersBtn").emit("click"); assert.ok(workspace.classList.contains("mobile-layers-open"));
      await el("layersList").children[0].emit("click"); assert.ok(workspace.classList.contains("mobile-inspector-open"));
      assert.deepEqual(await state(), before);
    }
  });
  await test("returning to desktop restores native row dragging", async () => {
    screenWidth = 1280; screenHeight = 900; coarsePointer = false; el("stageWrap").clientWidth = 1036; el("stageWrap").clientHeight = 760;
    await window.emit("resize"); flush();
    assert.equal(el("layersList").children[0].draggable, true);
  });
  console.log(JSON.stringify({ passed }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
