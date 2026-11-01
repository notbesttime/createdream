(function (global) {
  "use strict";

  // Lakes remain individually editable; only their shared silhouette is painted.
  function createRenderer() {
    const mask = document.createElement("canvas");
    const bank = document.createElement("canvas");
    const water = document.createElement("canvas");
    const surface = document.createElement("canvas");
    let texture = null, previous = "", width = 0, height = 0;

    function makeTexture(w, h) {
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, w * .65, h);
      gradient.addColorStop(0, "#b3d6d9"); gradient.addColorStop(.5, "#98c7cd"); gradient.addColorStop(1, "#83b8c1");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      // Fixed map coordinates keep ripples continuous across every join.
      for (let row = 0, y = 22; y < h; row++, y += 46) {
        for (let col = 0, x = -30 + (row % 3) * 29; x < w; col++, x += 104) {
          const yy = y + ((row * 13 + col * 17) % 27), span = 12 + (col * 7 + row * 3) % 17;
          ctx.strokeStyle = (row + col) % 4 ? "rgba(239,249,245,.30)" : "rgba(89,151,165,.13)";
          ctx.lineWidth = (row + col) % 3 ? 1.5 : 2;
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + span, yy - 3, x + span * 2, yy + 1); ctx.stroke();
        }
      }
      return canvas;
    }

    function render(w, h, lakes) {
      const signature = JSON.stringify([w, h, lakes]);
      if (signature === previous) return surface;
      previous = signature;
      if (width !== w || height !== h) {
        width = w; height = h;
        [mask, bank, water, surface].forEach(function (canvas) { canvas.width = w; canvas.height = h; });
        texture = makeTexture(w, h);
      }
      const m = mask.getContext("2d"), b = bank.getContext("2d"), c = surface.getContext("2d"), wc = water.getContext("2d");
      [m, b, c, wc].forEach(function (ctx) { ctx.clearRect(0, 0, w, h); });
      if (!lakes.length) return surface;
      m.fillStyle = "#fff";
      lakes.forEach(function (lake) {
        m.save(); m.translate(lake.x, lake.y); m.rotate((lake.rotation || 0) * Math.PI / 180); m.translate(-lake.w / 2, -lake.h / 2);
        global.MapArt.lakePath(m, lake.w, lake.h, lake); m.fill(); m.restore();
      });
      // Dilate the UNION, never the individual outlines: no internal banks.
      b.drawImage(mask, 0, 0);
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8; b.drawImage(mask, Math.cos(angle) * 4, Math.sin(angle) * 4);
      }
      b.globalCompositeOperation = "source-in"; b.fillStyle = "#dce0c8"; b.fillRect(0, 0, w, h); b.globalCompositeOperation = "source-over";
      c.save(); c.shadowColor = "rgba(73,105,85,.22)"; c.shadowBlur = 5; c.shadowOffsetY = 2; c.drawImage(bank, 0, 0); c.restore();
      wc.drawImage(texture, 0, 0); wc.globalCompositeOperation = "destination-in"; wc.drawImage(mask, 0, 0); wc.globalCompositeOperation = "source-over";
      c.drawImage(water, 0, 0);
      return surface;
    }
    return { render: render };
  }
  global.MapWater = { createRenderer: createRenderer };
})(window);
