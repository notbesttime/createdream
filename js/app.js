(function () {
  "use strict";

  const ART = window.MapArt;
  const STORE_KEY = "ddhx-campus-map-v1";
  const SIZE = { portrait: { w: 1000, h: 1500 }, landscape: { w: 1500, h: 1000 } };
  const FONT = "Microsoft YaHei, PingFang SC, sans-serif";
  const GRASS_SRC = "assets/grass.webp";
  const $ = function (id) { return document.getElementById(id); };
  const stageWrap = $("stageWrap");
  const stageContainer = $("stageContainer");
  const labelsOverlay = $("labelsOverlay");
  const palette = $("palette");
  const inspector = $("inspector");

  let orientation = "portrait";
  let board = SIZE[orientation];
  let snapEnabled = true;
  let logoData = "";
  let selectedId = null;
  let nextId = 1;
  let items = [];
  let toastTimer = 0;
  let history = [];
  let redoHistory = [];
  let saveTimer = 0;
  let drawMode = null;
  let isDrawing = false;
  let drawPoints = [];
  let draftNode = null;
  let suppressStageClick = false;

  const stage = new Konva.Stage({ container: stageContainer, width: stageWrap.clientWidth, height: stageWrap.clientHeight, draggable: true });
  const mapLayer = new Konva.Layer({ listening: false });
  const objectsLayer = new Konva.Layer();
  stage.add(mapLayer); stage.add(objectsLayer);
  let boardImage = null;
  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    flipEnabled: false,
    padding: 1,
    borderStroke: "#3d8057",
    borderStrokeWidth: 1.5,
    anchorStroke: "#3d8057",
    anchorFill: "#ffffff",
    anchorSize: 9,
    anchorCornerRadius: 2,
    rotateAnchorOffset: 25,
    boundBoxFunc: function (oldBox, newBox) {
      if (Math.abs(newBox.width) < 24 || Math.abs(newBox.height) < 24) return oldBox;
      return newBox;
    }
  });
  objectsLayer.add(transformer);
  const lakeRenderer = window.MapWater.createRenderer();
  const waterSurface = new Konva.Shape({
    listening: false,
    sceneFunc: function (ctx) {
      const raw = ctx._context || ctx;
      raw.drawImage(lakeRenderer.render(board.w, board.h, lakeSnapshots()), 0, 0);
    }
  });
  objectsLayer.add(waterSurface); waterSurface.moveToBottom();
  const roadSurface = new Konva.Shape({
    listening: false,
    sceneFunc: function (ctx) {
      const raw = ctx._context || ctx;
      raw.drawImage(window.MapPaths.renderRoads(board.w, board.h, pathSnapshots("road")), 0, 0);
    }
  });
  const bridgeSurface = new Konva.Shape({
    listening: false,
    sceneFunc: function (ctx) {
      const raw = ctx._context || ctx;
      raw.drawImage(window.MapPaths.renderBridges(board.w, board.h, pathSnapshots("bridge")), 0, 0);
    }
  });
  objectsLayer.add(roadSurface); objectsLayer.add(bridgeSurface);

  function isSharedLake(item) { return item.type === "lake" && !item.imageData; }
  function isSharedPath(item) { return (item.type === "road" || item.type === "bridge") && !item.imageData; }
  function absolutePath(item) {
    const node = item.node, pts = item.pathPoints || [];
    if (!node || pts.length < 2) return null;
    const sx = node.width() / (item.pathBaseW || node.width() || 1);
    const sy = node.height() / (item.pathBaseH || node.height() || 1);
    const ang = (node.rotation() || 0) * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang);
    const ox = -node.width() / 2, oy = -node.height() / 2;
    return pts.map(function (p) {
      const x = p.x * sx + ox, y = p.y * sy + oy;
      return { x: node.x() + x * cos - y * sin, y: node.y() + x * sin + y * cos };
    });
  }
  function pathSnapshots(kind) {
    return items.filter(function (item) { return isSharedPath(item) && item.type === kind; }).map(function (item) {
      const points = absolutePath(item) || [];
      const node = item.node;
      const sx = node ? node.width() / (item.pathBaseW || node.width() || 1) : 1;
      const sy = node ? node.height() / (item.pathBaseH || node.height() || 1) : 1;
      return { points: points, thickness: Math.max(4, (item.pathThickness || 48) * (sx + sy) / 2) };
    }).filter(function (s) { return s.points.length >= 2; });
  }
  function assetSrc(type) {
    const def = ART.definitions.find(function (d) { return d.type === type; });
    return def && def.src ? def.src : "";
  }
  function assetImageFor(type) {
    const src = assetSrc(type);
    return src ? window.MapAssets.get(src) : null;
  }
  function ensureAsset(type) {
    const src = assetSrc(type);
    if (!src || window.MapAssets.ready(src)) return;
    window.MapAssets.load(src).then(function () { objectsLayer.batchDraw(); });
  }
  function lakeSnapshots() {
    const lakes = items.filter(isSharedLake).map(function (item) {
      const node = item.node;
      return { x: node ? node.x() : item.x, y: node ? node.y() : item.y,
        w: node ? node.width() * node.scaleX() : item.w, h: node ? node.height() * node.scaleY() : item.h,
        rotation: node ? node.rotation() : item.rotation || 0,
        pathPoints: item.pathPoints || null, pathBaseW: item.pathBaseW, pathBaseH: item.pathBaseH };
    });
    if (isDrawing && drawMode === "lake" && drawPoints.length > 2) {
      lakes.push({ x: board.w / 2, y: board.h / 2, w: board.w, h: board.h, rotation: 0, pathPoints: drawPoints, pathBaseW: board.w, pathBaseH: board.h });
    }
    return lakes;
  }

  function id() {
    return "item-" + (Date.now().toString(36)) + "-" + (nextId++).toString(36);
  }
  function copyData() {
    return JSON.stringify({ orientation: orientation, snapEnabled: snapEnabled, logoData: logoData, items: items.map(function (item) {
      return { id: item.id, type: item.type, x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation, name: item.name, showName: item.showName, pathPoints: item.pathPoints || null, pathBaseW: item.pathBaseW || null, pathBaseH: item.pathBaseH || null, pathThickness: item.pathThickness || null, tint: item.tint || null, imageData: item.imageData || "" };
    }) });
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, copyData());
      $("saveState").textContent = "已自动保存";
    } catch (err) {
      $("saveState").textContent = "本地空间不足";
    }
  }
  function scheduleSave() {
    $("saveState").textContent = "保存中…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  }
  function record() {
    const snapshot = copyData();
    if (history[history.length - 1] !== snapshot) {
      history.push(snapshot);
      if (history.length > 60) history.shift();
      redoHistory = [];
    }
    scheduleSave();
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $("undoBtn").disabled = history.length < 2;
    $("redoBtn").disabled = redoHistory.length === 0;
  }
  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("visible"); }, 1900);
  }
  function boardCanvas() {
    const grass = window.MapAssets.get(GRASS_SRC);
    if (!grass) return ART.drawGrassBoard(board.w, board.h);
    const canvas = document.createElement("canvas");
    canvas.width = board.w; canvas.height = board.h;
    const ctx = canvas.getContext("2d");
    if (orientation === "portrait") {
      // The base art is 3:2 landscape; portrait boards reuse the same bitmap turned a quarter turn.
      ctx.save(); ctx.translate(board.w, 0); ctx.rotate(Math.PI / 2);
      ctx.drawImage(grass, 0, 0, board.h, board.w);
      ctx.restore();
    } else {
      ctx.drawImage(grass, 0, 0, board.w, board.h);
    }
    ART.fadeBoardEdge(ctx, board.w, board.h);
    return canvas;
  }
  function setBoardTexture() {
    board = SIZE[orientation];
    const canvas = boardCanvas();
    if (boardImage) boardImage.destroy();
    boardImage = new Konva.Image({ image: canvas, x: 0, y: 0, width: board.w, height: board.h, listening: false });
    mapLayer.add(boardImage);
    boardImage.moveToBottom();
    $("orientationLabel").textContent = orientation === "portrait" ? "竖版 · 2:3" : "横版 · 3:2";
    $("orientationBtn").innerHTML = orientation === "portrait" ? '<span class="tool-icon">▭</span><span>横屏画布</span>' : '<span class="tool-icon">▯</span><span>竖屏画布</span>';
    mapLayer.batchDraw();
  }
  function ensureItemImage(item) {
    if (!item.imageData) return Promise.resolve(null);
    if (item.imageElement && (item.imageElement.complete === undefined || (item.imageElement.complete && item.imageElement.naturalWidth))) return Promise.resolve(item.imageElement);
    if (item.imageLoadPromise) return item.imageLoadPromise;
    item.imageLoadPromise = new Promise(function (resolve) {
      const image = new Image();
      image.onload = function () { item.imageElement = image; item.imageLoadPromise = null; if (item.node) item.node.getLayer().batchDraw(); resolve(image); };
      image.onerror = function () { item.imageLoadPromise = null; resolve(null); };
      image.src = item.imageData;
    });
    return item.imageLoadPromise;
  }
  function renderShape(item) {
    if (item.imageData) ensureItemImage(item);
    ensureAsset(item.type);
    const shape = new Konva.Shape({
      x: item.x, y: item.y, width: item.w, height: item.h,
      offsetX: item.w / 2, offsetY: item.h / 2,
      rotation: item.rotation || 0, draggable: true,
      sceneFunc: function (ctx, node) {
        const raw = ctx._context || ctx;
        raw.save();
        const customImage = item.imageElement;
        const assetImage = customImage ? null : assetImageFor(item.type);
        if (customImage && (customImage.complete === undefined || (customImage.complete && customImage.naturalWidth))) raw.drawImage(customImage, 0, 0, node.width(), node.height());
        else if (assetImage) raw.drawImage(assetImage, 0, 0, node.width(), node.height());
        else if (!isSharedLake(item) && !isSharedPath(item)) ART.draw[item.type](raw, node.width(), node.height(), item);
        raw.restore();
      },
      hitFunc: function (ctx, node) {
        if (isSharedLake(item)) ART.lakePath(ctx._context || ctx, node.width(), node.height(), item);
        else if (isSharedPath(item) && item.pathPoints && item.pathPoints.length > 1) {
          const raw = ctx._context || ctx;
          const baseW = Math.max(1, item.pathBaseW || node.width()), baseH = Math.max(1, item.pathBaseH || node.height());
          raw.beginPath();
          item.pathPoints.forEach(function (p, i) {
            const x = p.x * node.width() / baseW, y = p.y * node.height() / baseH;
            if (i) raw.lineTo(x, y); else raw.moveTo(x, y);
          });
          raw.lineCap = "round"; raw.lineJoin = "round";
          raw.lineWidth = Math.max(10, (item.pathThickness || 48) * node.width() / baseW);
          raw.strokeStyle = "#000"; raw.stroke();
        } else { ctx.beginPath(); ctx.rect(0, 0, node.width(), node.height()); ctx.closePath(); }
        ctx.fillStrokeShape(node);
      }
    });
    shape.setAttr("itemId", item.id);
    shape.on("mousedown touchstart", function (evt) { evt.cancelBubble = true; selectItem(item.id); });
    shape.on("click tap", function (evt) { evt.cancelBubble = true; selectItem(item.id); });
    shape.on("dblclick dbltap", function () { selectItem(item.id); $("nameInput").focus(); $("nameInput").select(); });
    shape.on("dragmove", updateLabels);
    shape.on("dragend", function () {
      if (snapEnabled) {
        shape.position({ x: Math.round(shape.x() / 10) * 10, y: Math.round(shape.y() / 10) * 10 });
      }
      item.x = shape.x(); item.y = shape.y(); updateLabels(); record(); updateInspector();
    });
    shape.on("transform", function () { updateLabels(); });
    shape.on("transformend", function () {
      const sx = shape.scaleX(), sy = shape.scaleY();
      item.w = Math.max(24, Math.round(item.w * sx));
      item.h = Math.max(24, Math.round(item.h * sy));
      item.x = shape.x(); item.y = shape.y(); item.rotation = shape.rotation();
      shape.width(item.w); shape.height(item.h); shape.offset({ x: item.w / 2, y: item.h / 2 }); shape.scale({ x: 1, y: 1 });
      shape.getLayer().batchDraw(); updateLabels(); updateInspector(); record();
    });
    item.node = shape;
    objectsLayer.add(shape);
    return shape;
  }
  function labelPoint(item) {
    const x = item.node ? item.node.x() : item.x, y = item.node ? item.node.y() : item.y;
    if (item.type === "lake") return { x: x, y: y };
    const rad = (item.node ? item.node.rotation() : item.rotation || 0) * Math.PI / 180;
    const distance = item.h / 2 + 18;
    return { x: x + Math.sin(rad) * distance, y: y - Math.cos(rad) * distance };
  }
  function makeLabel(item) {
    const tag = document.createElement("div");
    tag.className = "map-label";
    tag.dataset.id = item.id;
    tag.addEventListener("pointerdown", function (evt) { evt.stopPropagation(); selectItem(item.id); });
    tag.addEventListener("click", function (evt) { evt.stopPropagation(); selectItem(item.id); });
    labelsOverlay.appendChild(tag);
    item.labelEl = tag;
    updateOneLabel(item);
  }
  function updateOneLabel(item) {
    if (!item.labelEl) return;
    const visible = !!(item.name && item.showName !== false);
    item.labelEl.style.display = visible ? "block" : "none";
    item.labelEl.textContent = item.name || "";
    item.labelEl.classList.toggle("is-selected", item.id === selectedId);
    if (!visible) return;
    const p = labelPoint(item);
    const s = stage.scaleX();
    item.labelEl.style.left = (stage.x() + p.x * s) + "px";
    item.labelEl.style.top = (stage.y() + p.y * s) + "px";
  }
  function updateLabels() { items.forEach(updateOneLabel); }
  function redrawItems() {
    objectsLayer.removeChildren();
    objectsLayer.add(waterSurface); objectsLayer.add(roadSurface); objectsLayer.add(bridgeSurface);
    labelsOverlay.innerHTML = "";
    items.forEach(function (item) { item.node = null; item.labelEl = null; renderShape(item); makeLabel(item); });
    objectsLayer.add(transformer);
    syncZOrder();
    selectItem(selectedId, true);
    objectsLayer.batchDraw(); updateLabels(); updateCount();
  }
  function syncZOrder() {
    waterSurface.moveToBottom();
    roadSurface.zIndex(1); bridgeSurface.zIndex(2);
    const ordered = items.filter(isSharedLake).concat(items.filter(function (item) { return !isSharedLake(item); }));
    ordered.forEach(function (item, index) { if (item.node) item.node.zIndex(index + 3); });
    transformer.moveToTop();
    objectsLayer.batchDraw();
  }
  function updateCount() { $("itemCount").textContent = items.length + " 个物件"; }
  function selectItem(itemId, quiet) {
    selectedId = itemId;
    const item = items.find(function (x) { return x.id === itemId; });
    transformer.nodes(item && item.node ? [item.node] : []);
    if (item) {
      inspector.hidden = false;
      $("inspectorType").textContent = (ART.definitions.find(function (x) { return x.type === item.type; }) || {}).label || "地图物件";
      $("typeInput").value = item.type;
      $("tintInput").value = item.tint || "#a9b88a";
      $("tintField").hidden = item.type !== "garden" && item.type !== "sketch";
      $("nameInput").value = item.name || "";
      $("showNameInput").checked = item.showName !== false;
      $("widthInput").value = Math.round(item.w);
      $("heightInput").value = Math.round(item.h);
      $("rotationInput").value = Math.round(item.node.rotation());
    } else {
      inspector.hidden = true;
    }
    updateLabels(); objectsLayer.batchDraw();
    if (!quiet) updateCount();
  }
  function updateInspector() {
    const item = items.find(function (x) { return x.id === selectedId; });
    if (!item) return;
    $("widthInput").value = Math.round(item.w);
    $("heightInput").value = Math.round(item.h);
    $("rotationInput").value = Math.round(item.node.rotation());
  }
  function setNodeSize(item, w, h) {
    item.w = Math.max(24, Math.min(4000, Number(w) || item.w));
    item.h = Math.max(24, Math.min(4000, Number(h) || item.h));
    item.node.width(item.w); item.node.height(item.h); item.node.offset({ x: item.w/2, y: item.h/2 });
    item.node.scale({ x: 1, y: 1 });
    item.node.getLayer().batchDraw(); updateLabels(); updateInspector();
  }
  function worldPoint(clientX, clientY) {
    const rect = stageContainer.getBoundingClientRect();
    const s = stage.scaleX();
    return { x: (clientX - rect.left - stage.x()) / s, y: (clientY - rect.top - stage.y()) / s };
  }
  const DRAW_TYPES = ["lake", "road", "bridge", "sketch"];
  function enterDrawMode(type) {
    if (drawMode === type) { cancelDrawMode(); return; }
    cancelDrawMode(); drawMode = type; selectItem(null); stage.draggable(false); transformer.nodes([]);
    items.forEach(function (item) { if (item.node) item.node.draggable(false); });
    stageWrap.classList.add("draw-mode");
    document.querySelectorAll(".asset-card").forEach(function (card) { card.classList.toggle("is-drawing", card.dataset.type === type); });
    const messages = { lake: "绘制：湖面", road: "绘制：道路", bridge: "绘制：木桥", sketch: "绘制：自绘区域" };
    $("drawPrompt").textContent = messages[type] || "按住并拖动绘制";
    $("drawBanner").hidden = false;
    showToast(messages[type] + "模式已开启");
  }
  function cancelDrawMode() {
    if (draftNode) { draftNode.destroy(); draftNode = null; }
    drawPoints = []; isDrawing = false; drawMode = null;
    stageWrap.classList.remove("draw-mode"); $("drawBanner").hidden = true;
    document.querySelectorAll(".asset-card.is-drawing").forEach(function (card) { card.classList.remove("is-drawing"); });
    if (stage) stage.draggable(true);
    items.forEach(function (item) { if (item.node) item.node.draggable(true); });
    if (objectsLayer) objectsLayer.batchDraw();
  }
  function pointerWorld(evt) {
    const p = worldPoint(evt.clientX, evt.clientY);
    return { x: Math.max(0, Math.min(board.w, p.x)), y: Math.max(0, Math.min(board.h, p.y)) };
  }
  function updateDraft() {
    if (draftNode) draftNode.destroy();
    if (drawPoints.length < 2) { objectsLayer.batchDraw(); return; }
    if (drawMode === "bridge") {
      const preview = { pathPoints: drawPoints.slice(), pathBaseW: board.w, pathBaseH: board.h, pathThickness: 58 };
      draftNode = new Konva.Shape({ listening: false, sceneFunc: function (ctx) { ART.draw.bridge(ctx._context || ctx, board.w, board.h, preview); } });
      objectsLayer.add(draftNode); transformer.moveToTop(); objectsLayer.batchDraw(); return;
    }
    const type = drawMode, closed = type === "lake" || type === "sketch";
    const flat = []; drawPoints.forEach(function (p) { flat.push(p.x, p.y); });
    const stroke = type === "road" ? "#c9bfa8" : type === "bridge" ? "#917c5d" : type === "lake" ? "#84b7c0" : "#8d9e75";
    draftNode = new Konva.Line({ points: flat, closed: closed, fill: closed && type !== "lake" ? "rgba(156,176,126,.48)" : undefined, stroke: stroke, strokeWidth: type === "road" ? 36 : type === "bridge" ? 50 : 4, lineCap: "round", lineJoin: "round", tension: .28, shadowColor: "rgba(54,68,58,.18)", shadowBlur: 4, listening: false });
    objectsLayer.add(draftNode); transformer.moveToTop(); objectsLayer.batchDraw();
  }
  function makePathItem(type, points, name) {
    const thickness = type === "road" ? 42 : type === "bridge" ? 58 : 0;
    const padding = thickness ? thickness * .62 : 10;
    const xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    const left = Math.min.apply(null, xs) - padding, top = Math.min.apply(null, ys) - padding;
    const w = Math.max(30, Math.max.apply(null, xs) - Math.min.apply(null, xs) + padding * 2);
    const h = Math.max(30, Math.max.apply(null, ys) - Math.min.apply(null, ys) + padding * 2);
    return { id: id(), type: type, x: left + w / 2, y: top + h / 2, w: w, h: h, rotation: 0, name: name || "", showName: true, pathPoints: points.map(function (p) { return { x: p.x - left, y: p.y - top }; }), pathBaseW: w, pathBaseH: h, pathThickness: thickness || undefined, tint: type === "sketch" ? "#a9b88a" : undefined };
  }
  function finishDrawing() {
    const type = drawMode, points = drawPoints.slice();
    if (draftNode) { draftNode.destroy(); draftNode = null; }
    cancelDrawMode();
    const minPoints = type === "lake" || type === "sketch" ? 5 : 2;
    if (points.length < minPoints) { showToast("轨迹太短，请按住并拖动完成绘制"); return; }
    const xSpan = Math.max.apply(null, points.map(function (p) { return p.x; })) - Math.min.apply(null, points.map(function (p) { return p.x; }));
    const ySpan = Math.max.apply(null, points.map(function (p) { return p.y; })) - Math.min.apply(null, points.map(function (p) { return p.y; }));
    if ((type === "lake" || type === "sketch") && (xSpan < 28 || ySpan < 28)) { showToast("区域太小，请重新勾勒"); return; }
    const item = makePathItem(type, points, "");
    items.push(item); renderShape(item); makeLabel(item); syncZOrder(); selectItem(item.id); record();
    showToast((ART.definitions.find(function (d) { return d.type === type; }) || {}).label + "已绘制");
  }
  function startDrawing(evt) {
    if (!drawMode || (evt.button !== 0 && evt.pointerType !== "touch")) return;
    evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
    isDrawing = true; drawPoints = [pointerWorld(evt)];
    if (evt.target && evt.target.setPointerCapture) { try { evt.target.setPointerCapture(evt.pointerId); } catch (e) {} }
    updateDraft();
  }
  function continueDrawing(evt) {
    if (!isDrawing) return;
    evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
    const p = pointerWorld(evt), last = drawPoints[drawPoints.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 3) { drawPoints.push(p); updateDraft(); }
  }
  function endDrawing(evt) {
    if (!isDrawing) return;
    evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
    suppressStageClick = true; window.setTimeout(function () { suppressStageClick = false; }, 100);
    const p = pointerWorld(evt), last = drawPoints[drawPoints.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1) drawPoints.push(p);
    finishDrawing();
  }
  function addItem(type, position) {
    const def = ART.definitions.find(function (d) { return d.type === type; });
    if (!def) return;
    const p = position || worldPoint(stageContainer.getBoundingClientRect().left + stage.width()/2, stageContainer.getBoundingClientRect().top + stage.height()/2);
    const item = { id: id(), type: type, x: p.x, y: p.y, w: def.w, h: def.h, rotation: 0, name: "", showName: true };
    items.push(item); renderShape(item); makeLabel(item); syncZOrder(); selectItem(item.id); record();
    showToast(def.label + "已添加");
  }
  function deleteSelected() {
    if (!selectedId) return;
    const index = items.findIndex(function (x) { return x.id === selectedId; });
    if (index < 0) return;
    const item = items[index];
    if (item.node) item.node.destroy();
    if (item.labelEl) item.labelEl.remove();
    items.splice(index, 1); selectItem(null); syncZOrder(); updateCount(); record();
  }
  function duplicateSelected() {
    const source = items.find(function (x) { return x.id === selectedId; });
    if (!source) return;
    const item = { id: id(), type: source.type, x: source.node.x() + 26, y: source.node.y() + 24, w: source.w, h: source.h, rotation: source.node.rotation(), name: source.name ? source.name + " 副本" : "", showName: source.showName, pathPoints: source.pathPoints ? source.pathPoints.map(function (p) { return { x: p.x, y: p.y }; }) : null, pathBaseW: source.pathBaseW, pathBaseH: source.pathBaseH, pathThickness: source.pathThickness, tint: source.tint, imageData: source.imageData || "", imageElement: source.imageElement || null };
    items.push(item); renderShape(item); makeLabel(item); syncZOrder(); selectItem(item.id); record();
  }
  function moveLayer(direction) {
    const index = items.findIndex(function (x) { return x.id === selectedId; });
    if (index < 0) return;
    const next = Math.max(0, Math.min(items.length - 1, index + direction));
    if (next === index) return;
    const moved = items.splice(index, 1)[0]; items.splice(next, 0, moved); syncZOrder(); record();
  }
  function fitView() {
    const padding = 58;
    const scale = Math.min((stage.width()-padding*2)/board.w, (stage.height()-padding*2)/board.h);
    const s = Math.max(.12, Math.min(scale, 1.3));
    stage.scale({ x: s, y: s });
    stage.position({ x: (stage.width()-board.w*s)/2, y: (stage.height()-board.h*s)/2 });
    stage.batchDraw(); updateLabels(); updateZoomReadout(); updateTransformerScale();
  }
  function updateZoomReadout() { $("zoomReadout").textContent = Math.round(stage.scaleX()*100) + "%"; }
  function updateTransformerScale() {
    const s = stage.scaleX();
    transformer.anchorSize(Math.max(7, Math.min(14, 9 / s)));
    transformer.borderStrokeWidth(1.4 / s);
    transformer.anchorStrokeWidth(1.3 / s);
    transformer.rotateAnchorOffset(24 / s);
  }
  function zoomAt(point, scale) {
    const old = stage.scaleX();
    const mousePointTo = { x: (point.x-stage.x())/old, y: (point.y-stage.y())/old };
    stage.scale({ x: scale, y: scale });
    stage.position({ x: point.x-mousePointTo.x*scale, y: point.y-mousePointTo.y*scale });
    stage.batchDraw(); updateLabels(); updateZoomReadout(); updateTransformerScale();
  }
  function restoreData(data) {
    orientation = data.orientation === "landscape" ? "landscape" : "portrait";
    board = SIZE[orientation];
    snapEnabled = data.snapEnabled !== false;
    logoData = typeof data.logoData === "string" ? data.logoData : "";
    items = Array.isArray(data.items) ? data.items.map(function (x) {
      const def = ART.definitions.find(function (d) { return d.type === x.type; });
      if (!def) return null;
      const pathPoints = Array.isArray(x.pathPoints) ? x.pathPoints.filter(function (p) { return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)); }).map(function (p) { return { x: Number(p.x), y: Number(p.y) }; }) : null;
      const imageData = typeof x.imageData === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(x.imageData) ? x.imageData : "";
      return { id: x.id || id(), type: x.type, x: Number(x.x)||0, y: Number(x.y)||0, w: Math.max(24, Number(x.w)||def.w), h: Math.max(24, Number(x.h)||def.h), rotation: Number(x.rotation)||0, name: String(x.name||""), showName: x.showName !== false, pathPoints: pathPoints, pathBaseW: Math.max(1, Number(x.pathBaseW)||Number(x.w)||def.w), pathBaseH: Math.max(1, Number(x.pathBaseH)||Number(x.h)||def.h), pathThickness: Math.max(0, Number(x.pathThickness)||0), tint: /^#[0-9a-f]{6}$/i.test(x.tint||"") ? x.tint : "", imageData: imageData, imageElement: null };
    }).filter(Boolean) : [];
    selectedId = null;
    orientationTransform = null;
    $("snapBtn").classList.toggle("is-active", snapEnabled);
    $("snapBtn").setAttribute("aria-pressed", String(snapEnabled));
    renderLogo(); setBoardTexture(); redrawItems(); requestAnimationFrame(fitView);
  }
  function undo() {
    if (history.length < 2) return;
    redoHistory.push(history.pop());
    restoreData(JSON.parse(history[history.length-1]));
    updateHistoryButtons(); persist();
  }
  function redo() {
    if (!redoHistory.length) return;
    const snapshot = redoHistory.pop(); history.push(snapshot); restoreData(JSON.parse(snapshot)); updateHistoryButtons(); persist();
  }
  function renderLogo() {
    const slot = $("logoSlot");
    slot.innerHTML = logoData ? '<img alt="学校标识">' : '<span class="logo-placeholder"><b>标识</b><small>上传图片</small></span>';
    if (logoData) slot.querySelector("img").src = logoData;
  }
  function buildPalette() {
    const root = $("paletteGroups");
    ART.definitions.forEach(function (def) { const option = document.createElement("option"); option.value = def.type; option.textContent = def.label; $("typeInput").appendChild(option); });
    const groups = Array.from(new Set(ART.definitions.map(function (d) { return d.group; })));
    groups.forEach(function (group) {
      const title = document.createElement("div"); title.className = "group-title"; title.textContent = group; root.appendChild(title);
      const grid = document.createElement("div"); grid.className = "asset-grid";
      ART.definitions.filter(function (d) { return d.group === group; }).forEach(function (def) {
        const button = document.createElement("button"); button.className = "asset-card"; button.type = "button"; button.draggable = !def.drawMode; button.title = def.drawMode ? "选择后按住拖动绘制：" + def.label : "点击添加或拖到地图上：" + def.label; button.dataset.type = def.type;
        const image = document.createElement("img"); image.className = "asset-preview"; image.alt = ""; image.src = def.src || ART.thumbnail(def.type); image.loading = "lazy"; image.decoding = "async";
        const name = document.createElement("span"); name.className = "asset-name"; name.textContent = def.label;
        button.appendChild(image); button.appendChild(name);
        button.addEventListener("click", function () { if (def.drawMode) enterDrawMode(def.type); else { cancelDrawMode(); addItem(def.type); } });
        if (!def.drawMode) button.addEventListener("dragstart", function (evt) { evt.dataTransfer.setData("application/x-ddhx-item", def.type); evt.dataTransfer.effectAllowed = "copy"; });
        grid.appendChild(button);
      });
      root.appendChild(grid);
    });
  }
  function renderExportLabel(ctx, item) {
    if (!item.name || item.showName === false) return;
    const point=labelPoint(item),px=point.x,py=point.y;
    ctx.save();ctx.font="700 14px " + FONT;const tw=ctx.measureText(item.name).width;const w=tw+20,h=28;
    ctx.translate(px,py);ctx.fillStyle="#f3f0e4";ctx.strokeStyle="rgba(116,119,103,.7)";ctx.lineWidth=1.2;
    ART.roundRect(ctx,-w/2,-h,w,h,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(0,7);ctx.lineTo(6,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle="#465046";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(item.name,0,-h/2+1);ctx.restore();
  }
  function imageFromData(data) {
    return new Promise(function (resolve) { const image = new Image(); image.onload = function () { resolve(image); }; image.onerror = function () { resolve(null); }; image.src = data; });
  }
  let exportTainted = null;
  function assetsTaintExport() {
    if (exportTainted !== null) return exportTainted;
    exportTainted = false;
    try {
      const probe = document.createElement("canvas"); probe.width = 2; probe.height = 2;
      const pctx = probe.getContext("2d");
      const sample = assetImageFor("brick") || assetImageFor("round");
      if (sample) pctx.drawImage(sample, 0, 0, 2, 2);
      probe.toDataURL("image/png");
    } catch (err) { exportTainted = true; }
    return exportTainted;
  }
  async function exportPNG() {
    await Promise.all(items.map(ensureItemImage));
    await window.MapAssets.loadAll(items.map(function (item) { return assetSrc(item.type); }).concat([GRASS_SRC]));
    const usesAssetFiles = items.some(function (item) { return !item.imageData && assetSrc(item.type); });
    if (usesAssetFiles && assetsTaintExport()) {
      showToast("本地双击打开时浏览器禁止导出含图片素材的 PNG：请用本地服务器打开（运行 启动预览.cmd 或 python -m http.server）");
      return;
    }
    const logoImage = logoData ? await imageFromData(logoData) : null;
    const scale = 2;
    const canvas = document.createElement("canvas"); canvas.width = board.w * scale; canvas.height = board.h * scale;
    const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
    ART.drawWater(ctx, board.w, board.h);
    const scene = document.createElement("canvas"); scene.width = board.w; scene.height = board.h;
    const sceneCtx = scene.getContext("2d");
    sceneCtx.drawImage(boardImage.image(), 0, 0, board.w, board.h);
    sceneCtx.drawImage(lakeRenderer.render(board.w, board.h, lakeSnapshots()), 0, 0);
    sceneCtx.drawImage(window.MapPaths.renderRoads(board.w, board.h, pathSnapshots("road")), 0, 0);
    sceneCtx.drawImage(window.MapPaths.renderBridges(board.w, board.h, pathSnapshots("bridge")), 0, 0);
    items.forEach(function (item) {
      if (isSharedLake(item) || isSharedPath(item)) return;
      sceneCtx.save(); sceneCtx.translate(item.node.x(), item.node.y()); sceneCtx.rotate(item.node.rotation() * Math.PI / 180); sceneCtx.translate(-item.w / 2, -item.h / 2);
      const exportAsset = item.imageElement ? null : assetImageFor(item.type);
      if (item.imageElement && (item.imageElement.complete === undefined || (item.imageElement.complete && item.imageElement.naturalWidth))) sceneCtx.drawImage(item.imageElement, 0, 0, item.w, item.h);
      else if (exportAsset) sceneCtx.drawImage(exportAsset, 0, 0, item.w, item.h);
      else ART.draw[item.type](sceneCtx, item.w, item.h, item);
      sceneCtx.restore();
    });
    items.forEach(function (item) { renderExportLabel(sceneCtx, item); });
    sceneCtx.save(); sceneCtx.globalCompositeOperation = "destination-in";
    const fadeX = sceneCtx.createLinearGradient(0, 0, board.w, 0);
    fadeX.addColorStop(0, "rgba(255,255,255,0)"); fadeX.addColorStop(.05, "rgba(255,255,255,1)"); fadeX.addColorStop(.95, "rgba(255,255,255,1)"); fadeX.addColorStop(1, "rgba(255,255,255,0)");
    sceneCtx.fillStyle = fadeX; sceneCtx.fillRect(0, 0, board.w, board.h);
    const fadeY = sceneCtx.createLinearGradient(0, 0, 0, board.h);
    fadeY.addColorStop(0, "rgba(255,255,255,0)"); fadeY.addColorStop(.05, "rgba(255,255,255,1)"); fadeY.addColorStop(.95, "rgba(255,255,255,1)"); fadeY.addColorStop(1, "rgba(255,255,255,0)");
    sceneCtx.fillStyle = fadeY; sceneCtx.fillRect(0, 0, board.w, board.h); sceneCtx.restore();
    const mapScale = .84, mapW = board.w * mapScale, mapH = board.h * mapScale;
    ctx.drawImage(scene, (board.w - mapW) / 2, (board.h - mapH) / 2, mapW, mapH);
    if (logoImage) {
      ctx.save(); ART.roundRect(ctx, 28, 26, 112, 72, 4); ctx.fillStyle = "rgba(249,248,241,.96)"; ctx.fill(); ctx.strokeStyle = "rgba(124,127,111,.48)"; ctx.lineWidth = 1; ctx.stroke();
      const logoScale = Math.min(96 / logoImage.width, 56 / logoImage.height); ctx.drawImage(logoImage, 36 + (96 - logoImage.width * logoScale) / 2, 34 + (56 - logoImage.height * logoScale) / 2, logoImage.width * logoScale, logoImage.height * logoScale); ctx.restore();
    }
    const compassSize = Math.round(Math.min(board.w, board.h) * .128);
    ART.drawCompass(ctx, 30, board.h - compassSize - 28, compassSize);
    let dataUrl = "";
    try { dataUrl = canvas.toDataURL("image/png"); }
    catch (err) { showToast("当前打开方式禁止导出图片，请用本地服务器打开后重试"); return; }
    const a = document.createElement("a"); a.download = "湖南理工大学-南湖创梦空间-校园地图.png"; a.href = dataUrl; a.click();
    showToast("已导出高清地图，地图留白并放大指南针");
  }
  function downloadFile(name, content, type) {
    const blob=new Blob([content],{type:type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  // Fit-to-board is lossy, so the exact mapping is remembered and undone when switching back;
  // otherwise every toggle would shrink the layout by the same ratio again.
  let orientationTransform = null;
  function orientationChange() {
    const from = orientation, next = from === "portrait" ? "landscape" : "portrait", target = SIZE[next];
    const old = board;
    const undo = orientationTransform && orientationTransform.from === next && orientationTransform.to === from;
    let scale, ox, oy;
    if (undo) {
      scale = 1 / orientationTransform.scale;
      ox = -orientationTransform.ox * scale;
      oy = -orientationTransform.oy * scale;
    } else {
      scale = Math.min(target.w / old.w, target.h / old.h);
      ox = (target.w - old.w * scale) / 2;
      oy = (target.h - old.h * scale) / 2;
    }
    items.forEach(function(item){
      item.x=ox+item.node.x()*scale;item.y=oy+item.node.y()*scale;item.w*=scale;item.h*=scale;
      item.node.position({x:item.x,y:item.y});item.node.width(item.w);item.node.height(item.h);item.node.offset({x:item.w/2,y:item.h/2});item.node.scale({x:1,y:1});
    });
    orientationTransform = undo ? null : { from: from, to: next, scale: scale, ox: ox, oy: oy };
    orientation=next;setBoardTexture();syncZOrder();requestAnimationFrame(fitView);record();
    showToast(next==="landscape"?"已切换横版，布局等比适配（切回可还原）":"已切换竖版，布局等比适配（切回可还原）");
  }
  function resizeStage() {
    const w=stageWrap.clientWidth,h=stageWrap.clientHeight;
    stage.size({width:w,height:h});fitView();
  }
  function seedDemo() {
    const defs = [
      ["lake", 330, 790, 500, 615, -4, "南湖"],
      ["field", 305, 405, 300, 205, -7, "东院田径场"],
      ["brick2", 700, 290, 228, 174, 0, "综合楼"],
      ["brick", 700, 505, 232, 176, 1, "1号教学楼"],
      ["brick", 745, 710, 235, 178, -2, "2号教学楼"],
      ["round", 585, 1030, 220, 210, 0, "创梦中心"],
      ["brick", 705, 1280, 236, 180, 0, "图书馆"],
      ["brick", 360, 1370, 218, 168, 0, "学生公寓"],
      ["tree", 800, 935, 82, 88, 0, ""],
      ["tree", 900, 1010, 82, 88, 0, ""],
      ["tree", 520, 540, 78, 84, 0, ""],
      ["garden", 280, 1190, 210, 150, 0, "学生活动区"]
    ];
    items = defs.map(function (d) { return { id: id(), type: d[0], x: d[1], y: d[2], w: d[3], h: d[4], rotation: d[5], name: d[6], showName: true }; });
    items.splice(1, 0, makePathItem("road", [{x:690,y:150},{x:670,y:325},{x:695,y:495},{x:665,y:675},{x:700,y:860},{x:680,y:1050},{x:720,y:1235},{x:760,y:1410}], ""));
    items.splice(2, 0, makePathItem("road", [{x:210,y:1195},{x:340,y:1160},{x:475,y:1185},{x:610,y:1165},{x:755,y:1190},{x:900,y:1160}], ""));
    items.splice(6, 0, makePathItem("bridge", [{x:390,y:765},{x:450,y:774},{x:505,y:805},{x:560,y:832},{x:620,y:838}], "南湖木桥"));
    redrawItems();
  }

  stageContainer.addEventListener("pointerdown", startDrawing, true);
  stageContainer.addEventListener("pointermove", continueDrawing, true);
  stageContainer.addEventListener("pointerup", endDrawing, true);
  stageContainer.addEventListener("pointercancel", endDrawing, true);
  $("drawCancelBtn").addEventListener("click", cancelDrawMode);
  $("paletteGroups").addEventListener("dragover", function (evt) { evt.preventDefault(); });
  stageWrap.addEventListener("dragover", function (evt) { evt.preventDefault(); evt.dataTransfer.dropEffect="copy"; });
  stageWrap.addEventListener("drop", function (evt) {
    evt.preventDefault();const type=evt.dataTransfer.getData("application/x-ddhx-item");if(type)addItem(type,worldPoint(evt.clientX,evt.clientY));
  });
  stage.on("click tap",function(evt){if(suppressStageClick){evt.cancelBubble=true;return;}if(evt.target===stage){selectItem(null);}});
  stage.on("dragmove",updateLabels);
  stage.on("dragend",function(){updateLabels();});
  stage.on("wheel",function(evt){
    evt.evt.preventDefault();const old=stage.scaleX();const pointer=stage.getPointerPosition();const dir=evt.evt.deltaY>0?-1:1;const factor=1.08;const next=Math.max(.18,Math.min(2.5,dir>0?old*factor:old/factor));zoomAt(pointer,next);
  });
  $("paletteToggle").addEventListener("click",function(){palette.classList.add("is-collapsed");});
  $("paletteExpand").addEventListener("click",function(){palette.classList.remove("is-collapsed");palette.classList.add("is-open");});
  $("orientationBtn").addEventListener("click",orientationChange);
  $("snapBtn").addEventListener("click",function(){snapEnabled=!snapEnabled;this.classList.toggle("is-active",snapEnabled);this.setAttribute("aria-pressed",String(snapEnabled));record();showToast(snapEnabled?"网格吸附已开启":"网格吸附已关闭");});
  $("fitBtn").addEventListener("click",fitView);
  $("zoomInBtn").addEventListener("click",function(){zoomAt({x:stage.width()/2,y:stage.height()/2},Math.min(2.5,stage.scaleX()*1.15));});
  $("zoomOutBtn").addEventListener("click",function(){zoomAt({x:stage.width()/2,y:stage.height()/2},Math.max(.18,stage.scaleX()/1.15));});
  $("undoBtn").addEventListener("click",undo);$("redoBtn").addEventListener("click",redo);
  $("saveBtn").addEventListener("click",function(){persist();showToast("布局已保存在此设备");});
  $("exportJsonBtn").addEventListener("click",function(){downloadFile("湖南理工大学-南湖创梦空间-地图布局.json",JSON.stringify(JSON.parse(copyData()),null,2),"application/json");showToast("布局文件已导出");});
  $("importJsonBtn").addEventListener("click",function(){$("jsonInput").click();});
  $("jsonInput").addEventListener("change",function(evt){const file=evt.target.files&&evt.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=function(){try{const parsed=JSON.parse(String(reader.result));restoreData(parsed);history=[copyData()];redoHistory=[];updateHistoryButtons();record();showToast("布局文件已导入");}catch(e){showToast("文件格式无法读取");}};reader.readAsText(file);evt.target.value="";});
  $("exportPngBtn").addEventListener("click",exportPNG);
  $("clearBtn").addEventListener("click",function(){if(!items.length)return;if(!window.confirm("清空当前画布上的所有物件？"))return;items.forEach(function(item){if(item.node)item.node.destroy();if(item.labelEl)item.labelEl.remove();});items=[];selectItem(null);syncZOrder();updateCount();record();showToast("画布已清空");});
  $("inspectorClose").addEventListener("click",function(){selectItem(null);});
  $("nameInput").addEventListener("input",function(){const item=items.find(function(x){return x.id===selectedId;});if(!item)return;item.name=this.value;updateLabels();});
  $("nameInput").addEventListener("change",function(){const item=items.find(function(x){return x.id===selectedId;});if(item){item.name=this.value;record();}});
  $("showNameInput").addEventListener("change",function(){const item=items.find(function(x){return x.id===selectedId;});if(!item)return;item.showName=this.checked;updateLabels();record();});
  $("typeInput").addEventListener("change",function(){
    const item=items.find(function(x){return x.id===selectedId;});if(!item)return;
    const previous=item.type,nextType=this.value,wasClosed=previous==="lake"||previous==="sketch",isClosed=nextType==="lake"||nextType==="sketch";
    item.type=nextType;item.imageData="";item.imageElement=null;item.imageLoadPromise=null;
    if(!DRAW_TYPES.includes(previous)||!DRAW_TYPES.includes(nextType)||wasClosed!==isClosed)item.pathPoints=null;
    item.pathThickness=nextType==="road"?42:nextType==="bridge"?58:0;
    item.tint=nextType==="sketch"||nextType==="garden"?(item.tint||"#a9b88a"):"";
    syncZOrder();selectItem(item.id,true);record();
  });
  $("tintInput").addEventListener("input",function(){const item=items.find(function(x){return x.id===selectedId;});if(!item)return;item.tint=this.value;item.node.getLayer().batchDraw();});
  $("tintInput").addEventListener("change",record);
  $("replaceImageBtn").addEventListener("click",function(){$("replaceImageInput").click();});
  $("replaceImageInput").addEventListener("change",function(evt){
    const file=evt.target.files&&evt.target.files[0],targetId=selectedId;if(!file)return;
    if(!file.type.startsWith("image/")){showToast("请选择图片文件");evt.target.value="";return;}
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=function(){
      const item=items.find(function(x){return x.id===targetId;});
      if(item){const scale=Math.min(1,900/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);item.imageData=canvas.toDataURL("image/webp",0.9);item.imageElement=canvas;item.imageLoadPromise=null;syncZOrder();record();showToast("物件图片已替换");}
      URL.revokeObjectURL(url);
    };
    image.onerror=function(){URL.revokeObjectURL(url);showToast("图片读取失败");};image.src=url;evt.target.value="";
  });
  $("widthInput").addEventListener("input",function(){const item=items.find(function(x){return x.id===selectedId;});if(item)setNodeSize(item,this.value,item.h);});
  $("heightInput").addEventListener("input",function(){const item=items.find(function(x){return x.id===selectedId;});if(item)setNodeSize(item,item.w,this.value);});
  ["widthInput","heightInput"].forEach(function(id){$(id).addEventListener("change",function(){record();});});
  $("rotationInput").addEventListener("input",function(){const item=items.find(function(x){return x.id===selectedId;});if(!item)return;item.node.rotation(Number(this.value)||0);item.rotation=item.node.rotation();objectsLayer.batchDraw();updateLabels();});
  $("rotationInput").addEventListener("change",record);
  $("duplicateBtn").addEventListener("click",duplicateSelected);
  $("frontBtn").addEventListener("click",function(){moveLayer(1);});
  $("backBtn").addEventListener("click",function(){moveLayer(-1);});
  $("deleteBtn").addEventListener("click",deleteSelected);
  $("logoSlot").addEventListener("click",function(){$("logoInput").click();});
  $("logoInput").addEventListener("change",function(evt){const file=evt.target.files&&evt.target.files[0];if(!file)return;const img=new Image();img.onload=function(){const c=document.createElement("canvas");const scale=Math.min(1,360/Math.max(img.width,img.height));c.width=img.width*scale;c.height=img.height*scale;c.getContext("2d").drawImage(img,0,0,c.width,c.height);logoData=c.toDataURL("image/png");renderLogo();record();showToast("学校标识已更新");};img.src=URL.createObjectURL(file);evt.target.value="";});
  window.addEventListener("keydown",function(evt){
    const target=evt.target;const typing=target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable);
    if((evt.ctrlKey||evt.metaKey)&&evt.key.toLowerCase()==="z"){evt.preventDefault();if(evt.shiftKey)redo();else undo();return;}
    if((evt.ctrlKey||evt.metaKey)&&evt.key.toLowerCase()==="d"){evt.preventDefault();duplicateSelected();return;}
    if(evt.key==="Escape"&&drawMode){evt.preventDefault();cancelDrawMode();return;}
    if(typing)return;
    if(evt.key==="Delete"||evt.key==="Backspace"){deleteSelected();return;}
    const item=items.find(function(x){return x.id===selectedId;});if(!item)return;
    const step=evt.shiftKey?10:1;let dx=0,dy=0;
    if(evt.key==="ArrowLeft")dx=-step;else if(evt.key==="ArrowRight")dx=step;else if(evt.key==="ArrowUp")dy=-step;else if(evt.key==="ArrowDown")dy=step;else return;
    evt.preventDefault();item.node.position({x:item.node.x()+dx,y:item.node.y()+dy});item.x=item.node.x();item.y=item.node.y();updateLabels();
  });
  window.addEventListener("keyup",function(evt){if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(evt.key)){const item=items.find(function(x){return x.id===selectedId;});if(item)record();}});
  window.addEventListener("resize",resizeStage);

  buildPalette();
  window.MapAssets.loadAll(ART.definitions.map(function (d) { return d.src; }).concat([GRASS_SRC])).then(function () { setBoardTexture(); objectsLayer.batchDraw(); });
  const stored=localStorage.getItem(STORE_KEY);
  if(stored){try{restoreData(JSON.parse(stored));history=[copyData()];}catch(e){seedDemo();setBoardTexture();requestAnimationFrame(fitView);history=[copyData()];}}
  else {seedDemo();setBoardTexture();requestAnimationFrame(fitView);history=[copyData()];}
  updateHistoryButtons();
})();
