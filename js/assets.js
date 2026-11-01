(function (global) {
  "use strict";

  // One decoded bitmap per file path, shared by every placement on the map.
  const entries = new Map();

  function entry(src) {
    let item = entries.get(src);
    if (!item) {
      item = { src: src, image: null, ready: false, failed: false, promise: null, listeners: [] };
      entries.set(src, item);
    }
    return item;
  }

  function load(src) {
    if (!src) return Promise.resolve(null);
    const item = entry(src);
    if (item.promise) return item.promise;
    item.promise = new Promise(function (resolve) {
      const image = new Image();
      image.decoding = "async";
      image.onload = function () {
        item.image = image; item.ready = true;
        const waiting = item.listeners.splice(0);
        waiting.forEach(function (fn) { try { fn(image); } catch (err) { /* redraw only */ } });
        resolve(image);
      };
      image.onerror = function () {
        item.failed = true; item.listeners.length = 0; resolve(null);
      };
      image.src = src;
    });
    return item.promise;
  }

  function get(src) { const item = entries.get(src); return item && item.ready ? item.image : null; }
  function ready(src) { return !!(entries.get(src) || {}).ready; }

  function subscribe(src, fn) {
    const item = entry(src);
    if (item.ready) { fn(item.image); return function () {}; }
    if (item.failed) return function () {};
    item.listeners.push(fn);
    return function () { item.listeners = item.listeners.filter(function (x) { return x !== fn; }); };
  }

  function loadAll(list) {
    const unique = Array.from(new Set((list || []).filter(Boolean)));
    return Promise.all(unique.map(load));
  }

  function stats() {
    let decoded = 0;
    entries.forEach(function (item) { if (item.ready) decoded += 1; });
    return { files: entries.size, decoded: decoded };
  }

  global.MapAssets = { load: load, loadAll: loadAll, get: get, ready: ready, subscribe: subscribe, stats: stats };
})(window);
