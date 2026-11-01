(function (global) {
  "use strict";

  function newCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  function tinted(mask, color, w, h) {
    const c = newCanvas(w, h), x = c.getContext("2d");
    x.drawImage(mask, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    return c;
  }

  function strokeMask(ctx, list, widthFn, H) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#fff";
    list.forEach(function (s) { ctx.lineWidth = widthFn(s); H.smoothOpen(ctx, s.points); ctx.stroke(); });
    ctx.restore();
  }

  // ---------------------------------------------------------------- roads
  const roadCache = { key: null, canvas: null };
  function renderRoads(w, h, list) {
    const H = global.MapArt.pathHelpers;
    const key = JSON.stringify([w, h, list]);
    if (roadCache.key === key && roadCache.canvas) return roadCache.canvas;
    const canvas = newCanvas(w, h), ctx = canvas.getContext("2d");
    const paths = (list || []).filter(function (s) { return s.points && s.points.length >= 2; });
    if (paths.length) {
      const outer = newCanvas(w, h), body = newCanvas(w, h);
      strokeMask(outer.getContext("2d"), paths, function (s) { return Math.max(2, s.thickness + 8); }, H);
      strokeMask(body.getContext("2d"), paths, function (s) { return Math.max(2, s.thickness - 5); }, H);
      // One shadow for the merged silhouette: overlapping segments must not double-darken.
      ctx.save();
      ctx.shadowColor = "rgba(84,79,62,.18)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      ctx.drawImage(tinted(outer, "#a79c85", w, h), 0, 0);
      ctx.restore();
      ctx.drawImage(tinted(outer, "#d0c7b3", w, h), 0, 0);
      ctx.drawImage(tinted(body, "#e5decc", w, h), 0, 0);
      const detail = newCanvas(w, h), d = detail.getContext("2d");
      paths.forEach(function (s) {
        const t = s.thickness;
        H.brushLine(d, H.pathOffset(s.points, -t * .31), "rgba(255,252,238,.68)", Math.max(1, t * .035), .75);
        H.brushLine(d, H.pathOffset(s.points, t * .31), "rgba(132,121,99,.28)", Math.max(1, t * .03), .7);
        const marks = H.pointsAtStep(s.points, Math.max(18, t * .75));
        d.strokeStyle = "rgba(154,141,117,.24)"; d.lineWidth = Math.max(1, t * .025);
        marks.forEach(function (p) {
          d.beginPath();
          d.moveTo(p.x - p.ty * t * .24, p.y + p.tx * t * .24);
          d.lineTo(p.x + p.ty * t * .24, p.y - p.tx * t * .24);
          d.stroke();
        });
      });
      d.globalCompositeOperation = "destination-in";
      d.drawImage(body, 0, 0);
      ctx.drawImage(detail, 0, 0);
    }
    roadCache.key = key; roadCache.canvas = canvas;
    return canvas;
  }

  // -------------------------------------------------------------- bridges
  function bridgeGeometry(pts, thickness) {
    let curve = (pts || []).filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); }).map(function (p) { return { x: p.x, y: p.y }; });
    curve = curve.reduce(function (out, p) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > .25) out.push(p);
      return out;
    }, []);
    if (curve.length < 2) return null;
    const width = Number.isFinite(thickness) && thickness > 0 ? Math.max(6, thickness) : 36;
    const half = width * .5, depth = Math.max(2, width * .12), railHeight = Math.max(5, width * .31), railWidth = Math.max(1.5, width * .065);
    for (let pass = 0; pass < 2 && curve.length > 2; pass++) {
      const smooth = [curve[0]];
      for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i], b = curve[i + 1];
        smooth.push({ x: a.x * .82 + b.x * .18, y: a.y * .82 + b.y * .18 }, { x: a.x * .18 + b.x * .82, y: a.y * .18 + b.y * .82 });
      }
      smooth.push(curve[curve.length - 1]); curve = smooth;
    }
    const frames = [], spacing = Math.max(2, width * .08);
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
      for (let j = 0; j < steps; j++) {
        const t = j / steps, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, last = frames[frames.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= spacing * .7) frames.push(p);
      }
    }
    frames.push(curve[curve.length - 1]);
    let length = 0;
    frames.forEach(function (p, i) {
      const a = frames[Math.max(0, i - 1)], b = frames[Math.min(frames.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      p.nx = -dy / len; p.ny = dx / len;
      if (i) length += Math.hypot(p.x - frames[i - 1].x, p.y - frames[i - 1].y);
      p.s = length;
    });
    if (length < .5) return null;
    function at(s) {
      let lo = 0, hi = frames.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].s < s) lo = mid; else hi = mid; }
      const a = frames[lo], b = frames[hi], t = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
      const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, n = Math.hypot(nx, ny) || 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: nx / n, ny: ny / n };
    }
    function edge(p, side, lift) { return { x: p.x + p.nx * half * side, y: p.y + p.ny * half * side - (lift || 0) }; }
    const left = frames.map(function (p) { return edge(p, 1); }), right = frames.map(function (p) { return edge(p, -1); });
    return { frames: frames, at: at, edge: edge, left: left, right: right, deck: left.concat(right.slice().reverse()),
      half: half, width: width, depth: depth, railHeight: railHeight, railWidth: railWidth, length: length };
  }

  const bridgeCache = { key: null, canvas: null };
  function renderBridges(w, h, list) {
    const H = global.MapArt.pathHelpers;
    const key = JSON.stringify([w, h, list]);
    if (bridgeCache.key === key && bridgeCache.canvas) return bridgeCache.canvas;
    const canvas = newCanvas(w, h), ctx = canvas.getContext("2d");
    const items = (list || []).filter(function (s) { return s.points && s.points.length >= 2; })
      .map(function (s) { return { geo: bridgeGeometry(s.points, s.thickness) }; })
      .filter(function (o) { return o.geo; });
    function trace(points) { ctx.beginPath(); points.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); }
    function fill(points, color) { trace(points); ctx.fillStyle = color; ctx.fill(); }
    function line(points, color, size) { ctx.beginPath(); points.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.stroke(); }
    function posts(geo, front) {
      const count = Math.max(1, Math.ceil(geo.length / Math.max(15, geo.width * .72)));
      for (let i = 0; i <= count; i++) {
        const p = geo.at(geo.length * i / count);
        [-1, 1].forEach(function (side) {
          if ((p.ny * side >= 0) !== front) return;
          const base = geo.edge(p, side), postW = Math.max(2, geo.width * .07), bottom = base.y + (front ? geo.depth * .7 : 0);
          ctx.fillStyle = "#745039"; ctx.fillRect(base.x - postW * .5, base.y - geo.railHeight, postW, bottom - base.y + geo.railHeight);
          ctx.fillStyle = "#bc9364"; ctx.fillRect(base.x - postW * .5, base.y - geo.railHeight, postW * .36, bottom - base.y + geo.railHeight);
          ctx.fillStyle = "#d2b084"; ctx.fillRect(base.x - postW * .5, base.y - geo.railHeight, postW, Math.max(.8, postW * .3));
        });
      }
    }
    function rails(geo, front) {
      for (let i = 0; i < geo.frames.length - 1; i++) {
        const a = geo.frames[i], b = geo.frames[i + 1];
        [-1, 1].forEach(function (side) {
          const isFront = (a.ny + b.ny) * side >= 0;
          if (isFront !== front) return;
          line([geo.edge(a, side, geo.railHeight * .45), geo.edge(b, side, geo.railHeight * .45)], "#95704c", geo.railWidth * .62);
          const p = geo.edge(a, side, geo.railHeight), q = geo.edge(b, side, geo.railHeight);
          line([p, q], "#765038", geo.railWidth);
          line([{ x: p.x, y: p.y - geo.railWidth * .2 }, { x: q.x, y: q.y - geo.railWidth * .2 }], "#dab98a", Math.max(.65, geo.railWidth * .29));
        });
      }
    }
    if (items.length) {
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      // 1 shadow for the whole set
      ctx.shadowColor = "rgba(40,51,40,.22)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      items.forEach(function (o) { fill(o.geo.deck.map(function (p) { return { x: p.x + o.geo.depth * .4, y: p.y + o.geo.depth + o.geo.railHeight * .3 }; }), "rgba(46,57,43,.16)"); });
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // 2 under-board (screen-down extrusion) so joints stay continuous
      items.forEach(function (o) { fill(o.geo.deck.map(function (p) { return { x: p.x, y: p.y + o.geo.depth }; }), "#715039"); });
      items.forEach(function (o) {
        const g = o.geo;
        [-1, 1].forEach(function (side) {
          for (let i = 0; i < g.frames.length - 1; i++) {
            const a = g.frames[i], b = g.frames[i + 1];
            if ((a.ny + b.ny) * side < 0) continue;
            const p = g.edge(a, side), q = g.edge(b, side);
            fill([p, q, { x: q.x, y: q.y + g.depth }, { x: p.x, y: p.y + g.depth }], "#896044");
            line([{ x: p.x, y: p.y + g.depth * .75 }, { x: q.x, y: q.y + g.depth * .75 }], "rgba(59,40,28,.28)", Math.max(.6, g.width * .018));
          }
        });
      });
      // 3 far rails first, so decks of neighbouring bridges cover them
      items.forEach(function (o) { posts(o.geo, false); rails(o.geo, false); });
      // 4 decks + planks
      items.forEach(function (o) {
        const g = o.geo;
        fill(g.deck, "#b99060");
        ctx.save(); trace(g.deck); ctx.clip();
        const pitch = Math.max(6, g.width * .23), colors = ["#b99164", "#c39d6e", "#b78d5f", "#c8a576", "#bc9668"];
        for (let s = 0, index = 0; s < g.length; s += pitch, index++) {
          const a = g.at(s), b = g.at(Math.min(g.length, s + pitch)), mid = g.at(Math.min(g.length, s + pitch * .5));
          fill([g.edge(a, -1), g.edge(a, 1), g.edge(b, 1), g.edge(b, -1)], colors[index % colors.length]);
          line([g.edge(a, -1), g.edge(a, 1)], "rgba(86,57,35,.65)", Math.max(.65, g.width * .021));
          const shine = g.at(Math.min(g.length, s + .9));
          line([g.edge(shine, -1), g.edge(shine, 1)], "rgba(238,208,162,.65)", Math.max(.5, g.width * .015));
          for (let grain = 0; grain < 2; grain++) {
            const p = g.at(Math.min(g.length, s + pitch * (.32 + grain * .32))), span = g.half * (.68 + (index % 3) * .06), wave = Math.sin(index * 2.3 + grain) * pitch * .08;
            ctx.beginPath(); ctx.moveTo(p.x - p.nx * span, p.y - p.ny * span);
            ctx.quadraticCurveTo(p.x - p.ny * wave, p.y + p.nx * wave, p.x + p.nx * span, p.y + p.ny * span);
            ctx.strokeStyle = grain ? "rgba(245,216,173,.29)" : "rgba(108,72,40,.23)";
            ctx.lineWidth = Math.max(.45, g.width * .012); ctx.stroke();
          }
          if (index % 5 === 2) {
            const offset = Math.sin(index * 1.7) * g.half * .45;
            ctx.beginPath(); ctx.ellipse(mid.x + mid.nx * offset, mid.y + mid.ny * offset, g.width * .045, pitch * .09, Math.atan2(mid.ny, mid.nx), 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(99,63,34,.36)"; ctx.lineWidth = Math.max(.55, g.width * .013); ctx.stroke();
          }
          [-1, 1].forEach(function (side) {
            const p = g.edge(mid, side * .84);
            ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.45, g.width * .011), 0, Math.PI * 2);
            ctx.fillStyle = "rgba(80,62,43,.63)"; ctx.fill();
          });
        }
        ctx.restore();
        line(g.left, "rgba(88,58,35,.68)", Math.max(.8, g.width * .035));
        line(g.right, "rgba(88,58,35,.68)", Math.max(.8, g.width * .035));
      });
      // 5 near rails last
      items.forEach(function (o) { posts(o.geo, true); rails(o.geo, true); });
      ctx.restore();
    }
    bridgeCache.key = key; bridgeCache.canvas = canvas;
    return canvas;
  }

  global.MapPaths = { renderRoads: renderRoads, renderBridges: renderBridges };
})(window);
