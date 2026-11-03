(function () {
  "use strict";

  const ART = window.MapArt;
  const STORE_KEY = "ddhx-campus-map-v1";
  const MAPS_KEY = "ddhx-campus-maps-v2";
  let maps = [];
  let activeId = null;
  const SIZE = { portrait: { w: 1000, h: 1500 }, landscape: { w: 1500, h: 1000 } };
  const FONT = "Microsoft YaHei, PingFang SC, sans-serif";
  const GRASS_SRC = "assets/grass.webp";
  const DEFAULT_LOGO = "assets/school-logo.png";
  // 云朵全部来自 cloud-sea 贴图，不再单独绘制云朵素材
  const CLOUD_SEA_SRC = "assets/cloud-sea.webp";
  const ZONES_SRC = "assets/zones.svg";
  let zonesVisible = false, zonesImage = null;
  // 整片云海：无缝平铺，作为“飞机视角下的地面云层”
  function paintCloudSea(ctx, w, h) {
    const tile = window.MapAssets.get(CLOUD_SEA_SRC);
    if (!tile) { ctx.fillStyle = "#eef3f8"; ctx.fillRect(0, 0, w, h); return; }
    const size = 620;
    for (let y = -size; y < h + size; y += size) {
      for (let x = -size; x < w + size; x += size) ctx.drawImage(tile, x, y, size, size);
    }
  }
  const $ = function (id) { return document.getElementById(id); };
  const stageWrap = $("stageWrap");
  const stageContainer = $("stageContainer");
  const labelsOverlay = $("labelsOverlay");
  const palette = $("palette");
  const inspector = $("inspector");

  let orientation = "portrait";
  let board = SIZE[orientation];
  let snapEnabled = true;
  let logoData = DEFAULT_LOGO;
  let mapTitle = "南湖创梦空间";
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
  const workspace = stageWrap.parentElement || null;
  const panelPositioners = [];
  const touchPointers = new Map();
  let pinchState = null, touchStartTransforms = [];
  function isMobileLayout() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 900px), (pointer: coarse) and (max-height: 500px)").matches);
  }
  function setMobilePanel(name) {
    if (!workspace) return;
    if (name === "inspector" && !selectedId) return;
    ["palette", "inspector", "layers"].forEach(function (key) {
      const open = key === name;
      workspace.classList.toggle("mobile-" + key + "-open", open);
      const button = $({ palette: "mobilePaletteBtn", inspector: "mobileInspectorBtn", layers: "mobileLayersBtn" }[key]);
      if (button) button.setAttribute("aria-expanded", String(open));
    });
  }
  function toggleMobilePanel(name) {
    if (!workspace) return;
    setMobilePanel(workspace.classList.contains("mobile-" + name + "-open") ? null : name);
  }
  function updateMobileControls() {
    const button = $("mobileInspectorBtn");
    if (button) button.disabled = !selectedId;
    if (!selectedId && workspace && workspace.classList.contains("mobile-inspector-open")) setMobilePanel(null);
  }

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
  const zonesNode = new Konva.Image({ x: 0, y: 0, width: 1500, height: 1000, listening: false, visible: false });
  mapLayer.add(zonesNode);
  function updateZonesNode() {
    zonesNode.width(board.w); zonesNode.height(board.h);
    zonesNode.visible(zonesVisible && !!zonesImage);
    const btn = $("zonesBtn");
    if (btn) { btn.classList.toggle("is-active", zonesVisible); btn.setAttribute("aria-pressed", String(zonesVisible)); }
    mapLayer.batchDraw();
  }
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
  const roadTopSurface = new Konva.Shape({
    listening: false,
    sceneFunc: function (ctx) {
      const raw = ctx._context || ctx;
      raw.drawImage(window.MapPaths.renderRoads(board.w, board.h, pathSnapshots("road", true)), 0, 0);
    }
  });
  const bridgeTopSurface = new Konva.Shape({
    listening: false,
    sceneFunc: function (ctx) {
      const raw = ctx._context || ctx;
      raw.drawImage(window.MapPaths.renderBridges(board.w, board.h, pathSnapshots("bridge", true)), 0, 0);
    }
  });
  objectsLayer.add(roadSurface); objectsLayer.add(bridgeSurface);
  objectsLayer.add(roadTopSurface); objectsLayer.add(bridgeTopSurface);

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
  function pathSnapshots(kind, over) {
    return items.filter(function (item) { return isSharedPath(item) && item.type === kind && (!!item.overItems === !!over); }).map(function (item) {
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
    return JSON.stringify({ orientation: orientation, snapEnabled: snapEnabled, logoData: logoData, title: mapTitle, zones: !!zonesVisible, items: items.map(function (item) {
      return { id: item.id, type: item.type, x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation, name: item.name, showName: item.showName, pathPoints: item.pathPoints || null, pathBaseW: item.pathBaseW || null, pathBaseH: item.pathBaseH || null, pathThickness: item.pathThickness || null, tint: item.tint || null, noHit: !!item.noHit, overItems: !!item.overItems, imageData: item.imageData || "" };
    }) });
  }
  function currentMap() {
    return maps.find(function (m) { return m.id === activeId; });
  }
  function emptyLayout() {
    return { orientation: "portrait", snapEnabled: snapEnabled, logoData: DEFAULT_LOGO, title: "南湖创梦空间", items: [] };
  }
  function saveCurrentMap() {
    const m = currentMap();
    if (m) { try { m.data = JSON.parse(copyData()); } catch (e) {} }
  }
  function persist() {
    try {
      saveCurrentMap();
      localStorage.setItem(MAPS_KEY, JSON.stringify({ maps: maps, activeId: activeId }));
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
    renderLayers();
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
    // 边缘柔化：让陆地融化进云层里，而不是硬边卡片
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
  window.MapAssets.load(ZONES_SRC).then(function (img) {
    if (img) { zonesImage = img; zonesNode.image(img); updateZonesNode(); }
  });
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
      rotation: item.rotation || 0, draggable: !item.noHit, listening: !item.noHit,
      sceneFunc: function (ctx, node) {
        const raw = ctx._context || ctx;
        raw.save();
        // 单个物件画不出来时不能让整个图层崩掉（否则整张地图都不显示）
        try {
          const customImage = item.imageElement;
          const assetImage = customImage ? null : assetImageFor(item.type);
          if (customImage && (customImage.complete === undefined || (customImage.complete && customImage.naturalWidth))) raw.drawImage(customImage, 0, 0, node.width(), node.height());
          else if (assetImage) raw.drawImage(assetImage, 0, 0, node.width(), node.height());
          else if (!isSharedLake(item) && !isSharedPath(item) && typeof ART.draw[item.type] === "function") ART.draw[item.type](raw, node.width(), node.height(), item);
        } catch (err) {
          if (window.console && console.warn) console.warn("item draw failed", item.type, err);
        }
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
          raw.strokeStyle = node.colorKey || "#000";
          raw.stroke();
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
      if (pinchState) return;
      if (snapEnabled) {
        shape.position({ x: Math.round(shape.x() / 10) * 10, y: Math.round(shape.y() / 10) * 10 });
      }
      item.x = shape.x(); item.y = shape.y(); updateLabels(); record(); updateInspector();
    });
    shape.on("transform", function () { updateLabels(); });
    shape.on("transformend", function () {
      if (pinchState) return;
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
  function updateLabels() { items.forEach(updateOneLabel); updateTitlePos(); }

  function updateTitlePos() {
    const el = $("mapTitle");
    if (!el) return;
    const visible = !!(mapTitle && mapTitle.trim());
    el.style.display = visible ? "block" : "none";
    if (!visible) return;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return;
    const s = stage.scaleX();
    const size = Math.max(11, Math.min(72, Math.min(board.w, board.h) * 0.045 * s));
    el.style.fontSize = size + "px";
    el.style.left = (stage.x() + 22 * s) + "px";
    el.style.top = (stage.y() + 16 * s) + "px";
    el.textContent = mapTitle;
  }

  function redrawItems() {
    objectsLayer.removeChildren();
    objectsLayer.add(waterSurface); objectsLayer.add(roadSurface); objectsLayer.add(bridgeSurface);
    objectsLayer.add(roadTopSurface); objectsLayer.add(bridgeTopSurface);
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
    roadTopSurface.moveToTop(); bridgeTopSurface.moveToTop();
    transformer.moveToTop();
    objectsLayer.batchDraw();
  }
  function updateCount() { $("itemCount").textContent = items.length + " 个物件"; }

  // ---------------- 多画布 ----------------
  function renderTabs() {
    const list = $("canvasTabsList");
    if (!list) return;
    list.innerHTML = "";
    maps.forEach(function (m) {
      const tab = document.createElement("div");
      tab.className = "canvas-tab" + (m.id === activeId ? " is-active" : "");
      tab.dataset.id = m.id;
      tab.title = m.name + "（右键或点铅笔重命名）";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(m.id === activeId));
      const name = document.createElement("span");
      name.className = "tab-name"; name.textContent = m.name;
      tab.appendChild(name);
      const rename = document.createElement("button");
      rename.className = "tab-rename-button"; rename.type = "button"; rename.textContent = "✎";
      rename.setAttribute("aria-label", "重命名画布：" + m.name);
      rename.addEventListener("click", function (evt) { evt.stopPropagation(); renameMap(m.id); });
      tab.appendChild(rename);
      const close = document.createElement("button");
      close.className = "tab-close"; close.type = "button"; close.textContent = "×"; close.title = "关闭画布";
      close.setAttribute("aria-label", "关闭画布：" + m.name);
      close.addEventListener("click", function (evt) { evt.stopPropagation(); deleteMap(m.id); });
      tab.appendChild(close);
      tab.addEventListener("click", function () { switchMap(m.id); });
      tab.addEventListener("contextmenu", function (evt) { evt.preventDefault(); renameMap(m.id); });
      list.appendChild(tab);
    });
  }
  function switchMap(id) {
    if (!id || id === activeId) return;
    saveCurrentMap();
    const m = maps.find(function (x) { return x.id === id; });
    if (!m) return;
    activeId = id;
    try { restoreData(m.data || emptyLayout()); }
    catch (e) { seedDemo(); setBoardTexture(); requestAnimationFrame(fitView); }
    history = [copyData()]; redoHistory = []; updateHistoryButtons();
    renderTabs(); scheduleSave();
  }
  function addMap() {
    saveCurrentMap();
    // 新画布以当前画布为模板深拷贝，便于在既有布局上改出新版本
    let template;
    try {
      const source = currentMap();
      template = source && source.data ? JSON.parse(JSON.stringify(source.data)) : JSON.parse(copyData());
    } catch (e) { template = emptyLayout(); }
    const m = { id: "map-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
      name: "画布 " + (maps.length + 1), data: template };
    maps.push(m); activeId = m.id;
    restoreData(m.data);
    history = [copyData()]; redoHistory = []; updateHistoryButtons();
    renderTabs(); persist();
    showToast("已新建画布：" + m.name + "（沿用当前布局）");
  }
  function deleteMap(id) {
    if (maps.length <= 1) { showToast("至少保留一个画布"); return; }
    const i = maps.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    if (id === activeId) {
      saveCurrentMap();
      const next = maps[i + 1] || maps[i - 1];
      maps.splice(i, 1);
      activeId = next.id;
      try { restoreData(next.data || emptyLayout()); } catch (e) {}
      history = [copyData()]; redoHistory = []; updateHistoryButtons();
    } else {
      maps.splice(i, 1);
    }
    renderTabs(); persist();
    showToast("画布已关闭");
  }
  function renameMap(id) {
    const m = maps.find(function (x) { return x.id === id; });
    if (!m) return;
    const name = window.prompt("画布名称", m.name);
    if (name === null) return;
    const trimmed = String(name).trim().slice(0, 20);
    if (!trimmed) return;
    m.name = trimmed;
    renderTabs(); persist();
  }
  // ---------------- 图层面板 ----------------
  let layerDragId = null, layerJustDragged = false;
  function layerLabel(item) {
    if (item.name) return item.name;
    const def = ART.definitions.find(function (d) { return d.type === item.type; });
    return (def && def.label) || item.type;
  }
  function clearDropMarks() {
    const list = $("layersList");
    if (!list) return;
    Array.prototype.forEach.call(list.children, function (row) { row.classList.remove("drop-above", "drop-below"); });
  }
  function markDrop(row, evt) {
    clearDropMarks();
    const rect = row.getBoundingClientRect();
    row.classList.add((evt.clientY - rect.top) > rect.height / 2 ? "drop-below" : "drop-above");
  }
  function dropLayer(targetId, evt) {
    clearDropMarks();
    if (!layerDragId || layerDragId === targetId) return;
    const from = items.findIndex(function (x) { return x.id === layerDragId; });
    const to = items.findIndex(function (x) { return x.id === targetId; });
    if (from < 0 || to < 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const below = (evt.clientY - rect.top) > rect.height / 2;
    let insert = to;
    if (from < to) insert -= 1;
    if (!below) insert += 1; else insert += 0;
    const moved = items.splice(from, 1)[0];
    insert = Math.max(0, Math.min(items.length, insert));
    items.splice(insert, 0, moved);
    layerJustDragged = true;
    setTimeout(function () { layerJustDragged = false; }, 60);
    syncZOrder(); record(); selectItem(moved.id);
  }
  function renderLayers() {
    const list = $("layersList");
    if (!list) return;
    list.innerHTML = "";
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const row = document.createElement("div");
      row.className = "layer-row" + (item.id === selectedId ? " is-active" : "");
      row.dataset.id = item.id;
      row.draggable = !isMobileLayout();
      const num = document.createElement("span"); num.className = "layer-num"; num.textContent = String(i);
      const name = document.createElement("span"); name.className = "layer-name"; name.textContent = layerLabel(item);
      row.appendChild(num); row.appendChild(name);
      if (isSharedPath(item)) {
        const tag = document.createElement("span"); tag.className = "layer-tag";
        tag.textContent = item.overItems ? "顶层" : "地形层";
        row.appendChild(tag);
      }
      if (item.noHit) {
        const tag2 = document.createElement("span"); tag2.className = "layer-tag"; tag2.textContent = "穿透";
        row.appendChild(tag2);
      }
      [1, -1].forEach(function (direction) {
        const action = document.createElement("button");
        action.className = "layer-nudge"; action.type = "button"; action.textContent = direction > 0 ? "↑" : "↓";
        action.disabled = direction > 0 ? i === items.length - 1 : i === 0;
        action.setAttribute("aria-label", (direction > 0 ? "上移图层：" : "下移图层：") + layerLabel(item));
        action.addEventListener("click", function (evt) { evt.stopPropagation(); selectItem(item.id, true); moveLayer(direction); });
        row.appendChild(action);
      });
      row.addEventListener("click", function () {
        if (layerJustDragged) return;
        selectItem(item.id);
        if (isMobileLayout()) setMobilePanel("inspector");
      });
      row.addEventListener("dragstart", function (evt) {
        layerDragId = item.id; row.classList.add("is-dragging");
        if (evt.dataTransfer) { evt.dataTransfer.effectAllowed = "move"; try { evt.dataTransfer.setData("text/plain", item.id); } catch (e) {} }
      });
      row.addEventListener("dragend", function () { layerDragId = null; row.classList.remove("is-dragging"); clearDropMarks(); });
      row.addEventListener("dragover", function (evt) { evt.preventDefault(); if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move"; markDrop(row, evt); });
      row.addEventListener("dragleave", function () { row.classList.remove("drop-above", "drop-below"); });
      row.addEventListener("drop", function (evt) { evt.preventDefault(); dropLayer(item.id, evt); });
      list.appendChild(row);
    }
  }

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
      $("noHitRow").hidden = !isSharedPath(item);
      $("noHitInput").checked = !!item.noHit;
      $("overItemsRow").hidden = !isSharedPath(item);
      $("overItemsInput").checked = !!item.overItems;
      $("widthInput").value = Math.round(item.w);
      $("heightInput").value = Math.round(item.h);
      $("rotationInput").value = Math.round(item.node.rotation());
    } else {
      inspector.hidden = true;
    }
    updateLabels(); objectsLayer.batchDraw();
    renderLayers(); updateMobileControls();
    if (item) panelPositioners.forEach(function (position) { position(); });
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
    if (isMobileLayout()) setMobilePanel(null);
    showToast(messages[type] + "模式已开启");
  }
  function cancelDrawMode() {
    if (draftNode) { draftNode.destroy(); draftNode = null; }
    drawPoints = []; isDrawing = false; drawMode = null;
    stageWrap.classList.remove("draw-mode"); $("drawBanner").hidden = true;
    document.querySelectorAll(".asset-card.is-drawing").forEach(function (card) { card.classList.remove("is-drawing"); });
    if (stage) stage.draggable(true);
    items.forEach(function (item) { if (item.node) item.node.draggable(!item.noHit); });
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
    if (pinchState || !drawMode || (evt.button !== 0 && evt.pointerType !== "touch")) return;
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
    if (isMobileLayout()) setMobilePanel(null);
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
    const shortSide = Math.min(stage.width(), stage.height());
    const padding = isMobileLayout() ? Math.max(12, Math.min(28, shortSide * .06)) : 58;
    const scale = Math.min((stage.width()-padding*2)/board.w, (stage.height()-padding*2)/board.h);
    const s = Math.max(.06, Math.min(scale, 1.3));
    stage.scale({ x: s, y: s });
    stage.position({ x: (stage.width()-board.w*s)/2, y: (stage.height()-board.h*s)/2 });
    stage.batchDraw(); updateLabels(); updateZoomReadout(); updateTransformerScale();
  }
  function updateZoomReadout() { $("zoomReadout").textContent = Math.round(stage.scaleX()*100) + "%"; }
  function updateTransformerScale() {
    const s = stage.scaleX();
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    transformer.anchorSize(coarse ? 18 : Math.max(7, Math.min(14, 9 / s)));
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
    logoData = typeof data.logoData === "string" && data.logoData ? data.logoData : DEFAULT_LOGO;
    mapTitle = typeof data.title === "string" ? data.title : "南湖创梦空间";
    zonesVisible = data.zones === true;
    items = Array.isArray(data.items) ? data.items.map(function (x) {
      const def = ART.definitions.find(function (d) { return d.type === x.type; });
      if (!def) return null;
      const pathPoints = Array.isArray(x.pathPoints) ? x.pathPoints.filter(function (p) { return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)); }).map(function (p) { return { x: Number(p.x), y: Number(p.y) }; }) : null;
      const imageData = typeof x.imageData === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(x.imageData) ? x.imageData : "";
      return { id: x.id || id(), type: x.type, x: Number(x.x)||0, y: Number(x.y)||0, w: Math.max(24, Number(x.w)||def.w), h: Math.max(24, Number(x.h)||def.h), rotation: Number(x.rotation)||0, name: String(x.name||""), showName: x.showName !== false, pathPoints: pathPoints, pathBaseW: Math.max(1, Number(x.pathBaseW)||Number(x.w)||def.w), pathBaseH: Math.max(1, Number(x.pathBaseH)||Number(x.h)||def.h), pathThickness: Math.max(0, Number(x.pathThickness)||0), tint: /^#[0-9a-f]{6}$/i.test(x.tint||"") ? x.tint : "", noHit: x.noHit === true, overItems: x.overItems === true, imageData: imageData, imageElement: null };
    }).filter(Boolean) : [];
    selectedId = null;
    orientationTransform = null;
    $("snapBtn").classList.toggle("is-active", snapEnabled);
    $("snapBtn").setAttribute("aria-pressed", String(snapEnabled));
    renderLogo(); setBoardTexture(); redrawItems(); updateZonesNode(); requestAnimationFrame(fitView);
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
    ART.definitions.filter(function (def) { return !def.upload; }).forEach(function (def) { const option = document.createElement("option"); option.value = def.type; option.textContent = def.label; $("typeInput").appendChild(option); });
    const groups = Array.from(new Set(ART.definitions.map(function (d) { return d.group; })));
    groups.forEach(function (group) {
      const title = document.createElement("div"); title.className = "group-title"; title.textContent = group; root.appendChild(title);
      const grid = document.createElement("div"); grid.className = "asset-grid";
      ART.definitions.filter(function (d) { return d.group === group; }).forEach(function (def) {
        const button = document.createElement("button"); button.className = "asset-card"; button.type = "button"; button.draggable = !def.drawMode; button.title = def.drawMode ? "选择后按住拖动绘制：" + def.label : "点击添加或拖到地图上：" + def.label; button.dataset.type = def.type;
        const name = document.createElement("span"); name.className = "asset-name"; name.textContent = def.label;
        if (def.upload) {
          const plus = document.createElement("span"); plus.className = "asset-plus"; plus.textContent = "+";
          button.appendChild(plus); button.appendChild(name);
          button.title = "导入一张 PNG 图片，作为贴图放到地图上";
          button.addEventListener("click", function () { $("customPngInput").click(); });
          grid.appendChild(button); return;
        }
        const image = document.createElement("img"); image.className = "asset-preview"; image.alt = ""; image.src = def.src || ART.thumbnail(def.type); image.loading = "lazy"; image.decoding = "async";
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
    await window.MapAssets.loadAll(items.map(function (item) { return assetSrc(item.type); }).concat([GRASS_SRC, CLOUD_SEA_SRC]));
    const usesAssetFiles = items.some(function (item) { return !item.imageData && assetSrc(item.type); });
    if (usesAssetFiles && assetsTaintExport()) {
      showToast("本地双击打开时浏览器禁止导出含图片素材的 PNG：请用本地服务器打开（运行 启动预览.cmd 或 python -m http.server）");
      return;
    }
    const logoImage = logoData ? await imageFromData(logoData) : null;
    const scale = 1.6;
    const canvas = document.createElement("canvas"); canvas.width = board.w * scale; canvas.height = board.h * scale;
    const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
    paintCloudSea(ctx, board.w, board.h);
    const scene = document.createElement("canvas"); scene.width = board.w; scene.height = board.h;
    const sceneCtx = scene.getContext("2d");
    sceneCtx.drawImage(boardImage.image(), 0, 0, board.w, board.h);
    sceneCtx.drawImage(lakeRenderer.render(board.w, board.h, lakeSnapshots()), 0, 0);
    sceneCtx.drawImage(window.MapPaths.renderRoads(board.w, board.h, pathSnapshots("road")), 0, 0);
    sceneCtx.drawImage(window.MapPaths.renderBridges(board.w, board.h, pathSnapshots("bridge")), 0, 0);
    items.forEach(function (item) {
      if (isSharedLake(item) || isSharedPath(item)) return;
      sceneCtx.save(); sceneCtx.translate(item.node.x(), item.node.y()); sceneCtx.rotate(item.node.rotation() * Math.PI / 180); sceneCtx.translate(-item.w / 2, -item.h / 2);
      try {
        const exportAsset = item.imageElement ? null : assetImageFor(item.type);
        if (item.imageElement && (item.imageElement.complete === undefined || (item.imageElement.complete && item.imageElement.naturalWidth))) sceneCtx.drawImage(item.imageElement, 0, 0, item.w, item.h);
        else if (exportAsset) sceneCtx.drawImage(exportAsset, 0, 0, item.w, item.h);
        else if (typeof ART.draw[item.type] === "function") ART.draw[item.type](sceneCtx, item.w, item.h, item);
      } catch (err) { /* 跳过画不出来的物件 */ }
      sceneCtx.restore();
    });
    // 勾选了「渲染在建筑之上」的道路/桥梁，最后再画一遍
    sceneCtx.drawImage(window.MapPaths.renderRoads(board.w, board.h, pathSnapshots("road", true)), 0, 0);
    sceneCtx.drawImage(window.MapPaths.renderBridges(board.w, board.h, pathSnapshots("bridge", true)), 0, 0);
    if (zonesVisible && zonesImage) sceneCtx.drawImage(zonesImage, 0, 0, board.w, board.h);
    items.forEach(function (item) { renderExportLabel(sceneCtx, item); });
    const mapScale = .90, mapW = board.w * mapScale, mapH = board.h * mapScale;
    const mapX = (board.w - mapW) / 2, mapY = (board.h - mapH) / 2;
    ctx.drawImage(scene, mapX, mapY, mapW, mapH);
    if (logoImage) {
      const logoSize = Math.round(Math.min(board.w, board.h) * .15);
      ctx.save();
      ctx.shadowColor = "rgba(56,74,66,.22)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
      ctx.drawImage(logoImage, 24, 20, logoSize, logoSize);
      ctx.restore();
      // 校徽右侧的校名/园区名
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#4d3568";
      const nameSize = Math.round(logoSize * 0.30);
      ctx.font = "700 " + nameSize + "px " + FONT;
      const label = mapTitle;
      const lx = 24 + logoSize + Math.round(logoSize * 0.16);
      const ly = 20 + logoSize / 2;
      ctx.shadowColor = "rgba(255,255,255,.85)"; ctx.shadowBlur = 6;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
    const compassSize = Math.round(Math.min(board.w, board.h) * .128);
    ART.drawCompass(ctx, 30, board.h - compassSize - 28, compassSize);
    let dataUrl = "";
    try { dataUrl = canvas.toDataURL("image/png"); }
    catch (err) { showToast("当前打开方式禁止导出图片，请用本地服务器打开后重试"); return; }
    const a = document.createElement("a"); a.download = "湖南理工大学-南湖创梦空间-校园地图.png"; a.href = dataUrl; a.click();
    showToast("已导出高清地图：云朵边框 + 圆形校徽");
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
  let previousMobileMode = null;
  function resizeStage() {
    const mobile = isMobileLayout();
    if (previousMobileMode !== mobile) { previousMobileMode = mobile; renderLayers(); }
    const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
    if (w < 1 || h < 1) return;
    const changed = Math.abs(w - stage.width()) > 1 || Math.abs(h - stage.height()) > 1;
    stage.size({ width: w, height: h });
    const focused = document.activeElement;
    const typing = focused && (/INPUT|TEXTAREA|SELECT/.test(focused.tagName) || focused.isContentEditable);
    if (changed && !typing) fitView();
    else { stage.batchDraw(); updateLabels(); }
    panelPositioners.forEach(function (position) { position(); });
    if (!isMobileLayout()) setMobilePanel(null);
    updateMobileControls();
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

  // Touch navigation changes only the viewport. Map coordinates and object sizes stay intact.
  function touchPair() {
    const pair = Array.from(touchPointers.values()).slice(0, 2);
    if (pair.length < 2) return null;
    const rect = stageContainer.getBoundingClientRect();
    return { x: (pair[0].x + pair[1].x) / 2 - rect.left,
      y: (pair[0].y + pair[1].y) / 2 - rect.top,
      distance: Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y)) };
  }
  function discardDraft() {
    if (draftNode) { draftNode.destroy(); draftNode = null; }
    isDrawing = false; drawPoints = [];
    objectsLayer.batchDraw();
  }
  function touchDown(evt) {
    if (evt.pointerType !== "touch") return;
    touchPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (touchPointers.size === 1 && !pinchState) {
      touchStartTransforms = items.map(function (item) {
        return { item: item, x: item.node.x(), y: item.node.y(), scaleX: item.node.scaleX(), scaleY: item.node.scaleY(), rotation: item.node.rotation() };
      });
      return;
    }
    const pair = touchPair();
    if (pair && !pinchState) {
      const scale = stage.scaleX();
      pinchState = { distance: pair.distance, scale: scale, x: (pair.x - stage.x()) / scale, y: (pair.y - stage.y()) / scale };
      discardDraft(); suppressStageClick = true;
      if (stage.isDragging()) stage.stopDrag();
      const transforming = transformer.isTransforming && transformer.isTransforming();
      if (transforming) transformer.stopTransform();
      transformer.listening(false);
      touchStartTransforms.forEach(function (start) {
        const node = start.item.node, dragging = node.isDragging();
        if (dragging) node.stopDrag();
        if (dragging || transforming) {
          node.position({ x: start.x, y: start.y }); node.scale({ x: start.scaleX, y: start.scaleY }); node.rotation(start.rotation);
        }
      });
      stage.draggable(false);
      items.forEach(function (item) { item.node.draggable(false); });
      updateLabels();
    }
    if (pinchState) { evt.preventDefault(); evt.stopImmediatePropagation(); }
  }
  function touchMove(evt) {
    if (evt.pointerType !== "touch" || !touchPointers.has(evt.pointerId)) return;
    touchPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (!pinchState) return;
    evt.preventDefault(); evt.stopImmediatePropagation();
    const pair = touchPair();
    if (!pair) return; // Wait until all fingers lift before starting a new one-finger gesture.
    const scale = Math.max(.06, Math.min(3.5, pinchState.scale * pair.distance / pinchState.distance));
    stage.scale({ x: scale, y: scale });
    stage.position({ x: pair.x - pinchState.x * scale, y: pair.y - pinchState.y * scale });
    stage.batchDraw(); updateLabels(); updateZoomReadout(); updateTransformerScale();
  }
  function touchUp(evt) {
    if (evt.pointerType !== "touch") return;
    touchPointers.delete(evt.pointerId);
    if (!pinchState) return;
    evt.preventDefault(); evt.stopImmediatePropagation();
    if (!touchPointers.size) {
      pinchState = null; touchStartTransforms = [];
      transformer.listening(true);
      stage.draggable(!drawMode);
      items.forEach(function (item) { item.node.draggable(!drawMode && !item.noHit); });
      window.setTimeout(function () { suppressStageClick = false; }, 150);
    }
  }
  // Konva also listens to native touch events: guard the second event stream.
  function guardNativeTouch(evt) {
    if (!drawMode && !pinchState && !suppressStageClick && (!evt.touches || evt.touches.length < 2)) return;
    evt.preventDefault(); evt.stopImmediatePropagation();
  }
  ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(function (type) {
    stageContainer.addEventListener(type, guardNativeTouch, { capture: true, passive: false });
  });
  stageContainer.addEventListener("pointerdown", touchDown, true);
  stageContainer.addEventListener("pointermove", touchMove, true);
  stageContainer.addEventListener("pointerup", touchUp, true);
  stageContainer.addEventListener("pointercancel", touchUp, true);
  stageContainer.addEventListener("pointerdown", startDrawing, true);
  stageContainer.addEventListener("pointermove", continueDrawing, true);
  stageContainer.addEventListener("pointerup", endDrawing, true);
  stageContainer.addEventListener("pointercancel", function () { discardDraft(); }, true);
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
  $("paletteToggle").addEventListener("click",function(){ if (isMobileLayout()) setMobilePanel(null); else palette.classList.add("is-collapsed"); });
  $("paletteExpand").addEventListener("click",function(){ if (isMobileLayout()) setMobilePanel("palette"); else { palette.classList.remove("is-collapsed"); palette.classList.add("is-open"); } });
  $("orientationBtn").addEventListener("click",orientationChange);
  $("snapBtn").addEventListener("click",function(){snapEnabled=!snapEnabled;this.classList.toggle("is-active",snapEnabled);this.setAttribute("aria-pressed",String(snapEnabled));record();showToast(snapEnabled?"网格吸附已开启":"网格吸附已关闭");});
  $("fitBtn").addEventListener("click",fitView);
  $("zonesBtn").addEventListener("click",function(){
    zonesVisible=!zonesVisible;
    updateZonesNode(); record();
    showToast(zonesVisible?"已显示功能分区标注":"已隐藏功能分区标注");
  });
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
  $("noHitInput").addEventListener("change",function(){
    const item=items.find(function(x){return x.id===selectedId;});if(!item)return;
    item.noHit=this.checked;
    if(item.node){item.node.listening(!item.noHit);item.node.draggable(!item.noHit);}
    if(item.noHit){transformer.nodes([]);}
    record();
    showToast(item.noHit?"该物件已点击穿透：暂时无法被选中":"已恢复该物件的点击");
  });
  $("overItemsInput").addEventListener("change",function(){
    const item=items.find(function(x){return x.id===selectedId;});if(!item)return;
    item.overItems=this.checked;
    syncZOrder(); record();
    showToast(item.overItems?"该"+ (item.type==="bridge"?"木桥":"道路") +"会画在建筑之上":"已恢复为地形层");
  });

  // ---------------- 浮动面板：可拖动 + 左右边界吸附 ----------------
  function initPanelDrag(panelId, handleId) {
    const panel = $(panelId), handle = $(handleId);
    if (!panel || !handle) return;
    const KEY = "ddhx-panel-pos-" + panelId;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved.left === "number" && isFinite(saved.left)) {
        panel.style.left = saved.left + "px"; panel.style.top = saved.top + "px";
        panel.style.right = "auto"; panel.style.bottom = "auto";
      }
    } catch (e) {}
    let drag = null;
    function box() {
      const host = panel.offsetParent || document.body;
      const hb = host.getBoundingClientRect();
      const sb = $("stageWrap").getBoundingClientRect();
      return { hb: hb, minX: sb.left - hb.left, minY: sb.top - hb.top,
        maxX: sb.right - hb.left - panel.offsetWidth, maxY: sb.bottom - hb.top - panel.offsetHeight };
    }
    handle.addEventListener("pointerdown", function (evt) {
      if (isMobileLayout() || (evt.button !== undefined && evt.button !== 0)) return;
      if (evt.target && evt.target.closest && evt.target.closest("button,input,select,a")) return;
      const host = panel.offsetParent || document.body;
      const pb = panel.getBoundingClientRect(), hb = host.getBoundingClientRect();
      panel.style.left = (pb.left - hb.left) + "px";
      panel.style.top = (pb.top - hb.top) + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
      drag = { dx: evt.clientX - pb.left, dy: evt.clientY - pb.top };
      panel.classList.add("is-dragging-panel");
      try { handle.setPointerCapture(evt.pointerId); } catch (e) {}
      evt.preventDefault();
    });
    handle.addEventListener("pointermove", function (evt) {
      if (!drag) return;
      const b = box(), host = panel.offsetParent || document.body, hb = host.getBoundingClientRect();
      let x = evt.clientX - hb.left - drag.dx, y = evt.clientY - hb.top - drag.dy;
      const SNAP = 20;
      if (Math.abs(x - b.minX) < SNAP) x = b.minX;
      if (Math.abs(x - b.maxX) < SNAP) x = b.maxX;
      if (Math.abs(y - b.minY) < SNAP) y = b.minY;
      if (Math.abs(y - b.maxY) < SNAP) y = b.maxY;
      x = Math.max(b.minX, Math.min(b.maxX, x));
      y = Math.max(b.minY, Math.min(b.maxY, y));
      panel.style.left = x + "px"; panel.style.top = y + "px";
      panel.classList.toggle("snap-left", Math.abs(x - b.minX) < 1);
      panel.classList.toggle("snap-right", Math.abs(x - b.maxX) < 1);
    });
    function finish() {
      if (!drag) return;
      drag = null; panel.classList.remove("is-dragging-panel", "snap-left", "snap-right");
      try { localStorage.setItem(KEY, JSON.stringify({ left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0 })); } catch (e) {}
    }
    function reposition() {
      if (isMobileLayout() || panel.hidden || !panel.offsetWidth) return;
      const b = box();
      panel.style.maxHeight = Math.max(80, stageWrap.clientHeight - 16) + "px";
      if (panel.style.left && panel.style.left !== "auto") {
        const x = Math.max(b.minX, Math.min(Math.max(b.minX, b.maxX), parseFloat(panel.style.left) || 0));
        const y = Math.max(b.minY, Math.min(Math.max(b.minY, b.maxY), parseFloat(panel.style.top) || 0));
        panel.style.left = x + "px"; panel.style.top = y + "px";
      }
    }
    panelPositioners.push(reposition);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }
  initPanelDrag("inspector", "inspectorDragHandle");
  initPanelDrag("layersPanel", "layersDragHandle");
  (function initTitleEditor() {
    const el = $("mapTitle");
    if (!el) return;
    el.addEventListener("pointerdown", function (evt) { evt.stopPropagation(); });
    el.addEventListener("click", function (evt) {
      evt.stopPropagation();
      if (el.getAttribute("contenteditable") === "true") return;
      el.textContent = mapTitle;
      el.setAttribute("contenteditable", "true");
      el.focus();
      try {
        const range = document.createRange(); range.selectNodeContents(el);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      } catch (e) {}
    });
    el.addEventListener("keydown", function (evt) {
      evt.stopPropagation();
      if (evt.key === "Enter") { evt.preventDefault(); el.blur(); }
      else if (evt.key === "Escape") { evt.preventDefault(); el.textContent = mapTitle; el.blur(); }
    });
    el.addEventListener("blur", function () {
      el.setAttribute("contenteditable", "false");
      const next = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
      mapTitle = next;
      el.textContent = mapTitle;
      updateTitlePos();
      record();
    });
  })();
  $("canvasAddBtn").addEventListener("click", addMap);
  ["palette", "inspector", "layers"].forEach(function (name) {
    const button = $({ palette: "mobilePaletteBtn", inspector: "mobileInspectorBtn", layers: "mobileLayersBtn" }[name]);
    if (button) button.addEventListener("click", function () { toggleMobilePanel(name); });
  });
  if ($("layersCloseBtn")) $("layersCloseBtn").addEventListener("click", function () { setMobilePanel(null); });
  $("unlockBtn").addEventListener("click",function(){
    let n=0;items.forEach(function(it){if(it.noHit){it.noHit=false;if(it.node){it.node.listening(true);it.node.draggable(true);}n++;}});
    if(n){record();showToast("已解除 "+n+" 个物件的点击锁定");}else{showToast("没有需要解除的锁定");}
  });
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
  $("customPngInput").addEventListener("change", function (evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    if (file.type !== "image/png") { showToast("只支持 PNG 图片（透明底效果最好）"); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      const maxSide = 600;
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const rect = stageContainer.getBoundingClientRect();
      const p = worldPoint(rect.left + stage.width() / 2, rect.top + stage.height() / 2);
      const w = Math.min(260, cv.width), h = w * cv.height / cv.width;
      const item = { id: id(), type: "custompng", x: p.x, y: p.y, w: w, h: h, rotation: 0, name: "", showName: true, imageData: cv.toDataURL("image/png"), imageElement: cv };
      items.push(item); renderShape(item); makeLabel(item); syncZOrder(); selectItem(item.id); record();
      showToast("已添加自定义 PNG 贴图");
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); showToast("图片读取失败"); };
    img.src = url;
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
  let viewportFrame = 0;
  function scheduleViewportResize() {
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(function () { viewportFrame = 0; resizeStage(); });
  }
  window.addEventListener("resize", scheduleViewportResize);
  if (window.ResizeObserver) new window.ResizeObserver(scheduleViewportResize).observe(stageWrap);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleViewportResize);
  if (window.screen && window.screen.orientation) window.screen.orientation.addEventListener("change", scheduleViewportResize);

  buildPalette();
  renderLogo();
  window.MapAssets.loadAll(ART.definitions.map(function (d) { return d.src; }).concat([GRASS_SRC, CLOUD_SEA_SRC])).then(function () { setBoardTexture(); objectsLayer.batchDraw(); });
  (function bootMaps(){
    try {
      const savedMaps = localStorage.getItem(MAPS_KEY);
      if (savedMaps) {
        const parsed = JSON.parse(savedMaps);
        if (parsed && Array.isArray(parsed.maps) && parsed.maps.length) {
          maps = parsed.maps;
          activeId = parsed.maps.some(function (m) { return m.id === parsed.activeId; }) ? parsed.activeId : parsed.maps[0].id;
          const m = currentMap();
          restoreData(m.data || emptyLayout());
          return;
        }
      }
      // 迁移旧版单布局
      let data = null;
      const old = localStorage.getItem(STORE_KEY);
      if (old) { try { data = JSON.parse(old); } catch (e) {} }
      if (!data && window.DEFAULT_LAYOUT) data = window.DEFAULT_LAYOUT;
      maps = [{ id: "map-main", name: "主画布", data: data || null }];
      activeId = "map-main";
      if (data) { restoreData(data); }
      else { seedDemo(); setBoardTexture(); requestAnimationFrame(fitView); maps[0].data = JSON.parse(copyData()); }
    } catch (e) {
      maps = [{ id: "map-main", name: "主画布", data: null }];
      activeId = "map-main";
      seedDemo(); setBoardTexture(); requestAnimationFrame(fitView);
      maps[0].data = JSON.parse(copyData());
    }
  })();
  history=[copyData()];
  updateHistoryButtons();
  renderTabs();
  persist();
  // ?layout=<url> 会把指定布局作为一个新画布载入（不会覆盖已有画布）
  (function loadLayoutFromUrl() {
    try {
      const src = new URLSearchParams(window.location.search).get("layout");
      if (!src) return;
      fetch(src).then(function (r) { return r.json(); }).then(function (data) {
        saveCurrentMap();
        const m = { id: "map-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
          name: "平面图布局", data: data };
        maps.push(m); activeId = m.id;
        restoreData(data);
        history = [copyData()]; redoHistory = []; updateHistoryButtons();
        renderTabs(); persist();
        showToast("已载入布局：" + src);
      }).catch(function () { showToast("布局载入失败：" + src); });
    } catch (e) {}
  })();
})();
