/* ==========================================================================
   charts.js — 二维图版 / the engraved 2-D plates
   One canvas, four different figures; all drawn with the plain 2-D context.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var SERIF = '"Bodoni MT","Goudy Old Style",Georgia,"Times New Roman","Songti SC","SimSun",serif';
  var F_LBL = '10px ' + SERIF;
  var F_SML = '9px ' + SERIF;
  var F_MATH = 'italic 11px ' + SERIF;
  var F_TINY = '8px ' + SERIF;

  var cv = null, g = null, W = 0, H = 0;
  var PAPER = '#f3ecdc';

  function setup(canvas) {
    cv = canvas;
    g = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    W = Math.max(60, Math.round(r.width));
    H = Math.max(60, Math.round(r.height));
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
  }

  /* ---- primitives ------------------------------------------------------- */
  function seg(x1, y1, x2, y2, color, width, dash) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width || 1;
    if (dash) g.setLineDash(dash);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.restore();
  }
  function path(pts, color, width, dash) {
    if (pts.length < 4) return;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width || 1;
    if (dash) g.setLineDash(dash);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
    g.restore();
  }
  function dot(x, y, r, fill, stroke) {
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    g.restore();
  }
  function text(str, x, y, color, font, align, baseline) {
    g.save();
    g.fillStyle = color;
    g.font = font || F_SML;
    g.textAlign = align || 'left';
    g.textBaseline = baseline || 'alphabetic';
    g.fillText(str, x, y);
    g.restore();
  }
  function arrowHead(x, y, ang, size, color) {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - size * Math.cos(ang - 0.42), y - size * Math.sin(ang - 0.42));
    g.lineTo(x - size * Math.cos(ang + 0.42), y - size * Math.sin(ang + 0.42));
    g.closePath();
    g.fill();
    g.restore();
  }
  function frame(x, y, w, h, color) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.restore();
  }

  /* ---- PLATE I : the two cross-sections --------------------------------- */
  function plate1(st, geom) {
    var L = st.L, C = st.colors, m = D.model;
    var P = geom.pivot, x0 = st.x0, y0 = st.y0;
    var padL = 34, padR = 12, padT = 16, gap = 28, padB = 20;
    var pw = W - padL - padR;
    var ph = (H - padT - padB - gap) / 2;
    var panels = [
      { y: padT, t: x0, f: function (t) { return m.f(t, y0); }, color: C.cx, cap: 'f(x, y₀)', slope: geom.stats.fx, sym: '∂f/∂x' },
      { y: padT + ph + gap, t: y0, f: function (t) { return m.f(x0, t); }, color: C.cy, cap: 'f(x₀, y)', slope: geom.stats.fy, sym: '∂f/∂y' }
    ];
    for (var p = 0; p < panels.length; p++) {
      var pa = panels[p], n = 121, vals = [], lo = Infinity, hi = -Infinity, i, v, t;
      for (i = 0; i <= n; i++) {
        t = -L + (2 * L * i) / n;
        v = pa.f(t);
        if (!isFinite(v)) v = 0;
        vals.push(v);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      var mid = (lo + hi) / 2, sp = Math.max(hi - lo, 1e-3);
      if (sp < 1e-3) { lo -= 0.5; hi += 0.5; }
      lo -= sp * 0.18; hi += sp * 0.18;
      var toX = function (t2) { return padL + ((t2 + L) / (2 * L)) * pw; };
      var toY = function (v2) { return pa.y + ph - ((v2 - lo) / (hi - lo)) * ph; };

      /* axes: x on the bottom, a spine at the left */
      seg(padL, pa.y + ph, padL + pw, pa.y + ph, 'rgba(36,31,26,0.55)', 1);
      seg(padL, pa.y, padL, pa.y + ph, 'rgba(36,31,26,0.35)', 1);
      text('−L', padL + 2, pa.y + ph + 11, 'rgba(36,31,26,0.5)', F_TINY);
      text('L', padL + pw - 2, pa.y + ph + 11, 'rgba(36,31,26,0.5)', F_TINY, 'right');
      text(D.math.fmt(lo, 2), padL - 4, pa.y + ph, 'rgba(36,31,26,0.5)', F_TINY, 'right');
      text(D.math.fmt(hi, 2), padL - 4, pa.y + 8, 'rgba(36,31,26,0.5)', F_TINY, 'right');

      /* the curve */
      var pts = [];
      for (i = 0; i <= n; i++) {
        t = -L + (2 * L * i) / n;
        pts.push(toX(t), toY(vals[i]));
      }
      path(pts, pa.color, 1.8);

      /* tangent at P, and the slope triangle */
      var px = toX(pa.t), py = toY(pa.f(pa.t));
      var slope = pa.slope;
      var slopePx = -((ph / (hi - lo)) * slope * (2 * L)) / pw;
      var runPx = 0.40 * pw, ext = 0.62 * pw;
      seg(px - ext * 0.55, py - slopePx * ext * 0.55, px + ext, py + slopePx * ext,
          'rgba(36,31,26,0.8)', 1.1, [4, 3]);
      var tX = px + runPx, tY = py + slopePx * runPx;
      seg(px, py, tX, py, 'rgba(36,31,26,0.5)', 1, [2, 2]);
      seg(tX, py, tX, tY, 'rgba(36,31,26,0.5)', 1, [2, 2]);
      dot(px, py, 2.6, C.pin, PAPER);
      text(pa.cap, padL + 3, pa.y + 8, 'rgba(36,31,26,0.75)', F_SML);
      text(pa.sym + ' = ' + D.math.fmt(slope, 2), padL + pw - 3, pa.y + 8, pa.color, F_SML, 'right');
    }
  }

  function rgba(hex, a) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' +
      parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }
  function circlePath(x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
  }

  /* ---- PLATE II : the contour map -------------------------------------- */
  function plate2(st, geom) {
    var L = st.L, C = st.colors, f = geom.field, i, k;
    var side = Math.min(W - 42, H - 26);
    var ox = (W - side) / 2, oy = (H - side) / 2 + 2;
    function toX(x) { return ox + ((x + L) / (2 * L)) * side; }
    function toY(y) { return oy + side - ((y + L) / (2 * L)) * side; }

    frame(ox, oy, side, side, 'rgba(36,31,26,0.30)');
    seg(toX(-L), toY(0), toX(L), toY(0), 'rgba(36,31,26,0.16)', 1);
    seg(toX(0), toY(-L), toX(0), toY(L), 'rgba(36,31,26,0.16)', 1);

    var levels = 9, segs, lev;
    for (k = 1; k < levels; k++) {
      lev = f.lo + (f.hi - f.lo) * k / levels;
      segs = D.math.contourSegments(f.raw, f.n, L, lev);
      for (i = 0; i + 3 < segs.length; i += 4) {
        seg(toX(segs[i]), toY(segs[i + 1]), toX(segs[i + 2]), toY(segs[i + 3]), rgba(C.contour, 0.5), 0.9);
      }
    }
    segs = D.math.contourSegments(f.raw, f.n, L, geom.stats.f0);
    for (i = 0; i + 3 < segs.length; i += 4) {
      seg(toX(segs[i]), toY(segs[i + 1]), toX(segs[i + 2]), toY(segs[i + 3]), C.contour, 1.9);
    }

    var ppu = side / (2 * L);
    var gx = geom.stats.fx, gy = geom.stats.fy;
    var glen = Math.sqrt(gx * gx + gy * gy);
    var sc = 1;
    if (glen * ppu > side * 0.40) sc = (side * 0.40) / (glen * ppu);
    var bx = toX(st.x0), by = toY(st.y0);
    var tx = toX(st.x0 + gx * sc), ty = toY(st.y0 + gy * sc);
    if (glen > 1e-6) {
      seg(bx, by, tx, ty, C.gradient, 1.9);
      arrowHead(tx, ty, Math.atan2(ty - by, tx - bx), 7, C.gradient);
      text('∇f', tx + (tx > bx ? 6 : -14), ty + (ty > by ? 12 : -5), C.gradient, F_MATH);
    }
    dot(bx, by, 2.9, C.pin, PAPER);
    text('x', toX(L) - 8, toY(0) + 12, 'rgba(36,31,26,0.6)', F_TINY);
    text('y', toX(0) + 4, toY(L) + 9, 'rgba(36,31,26,0.6)', F_TINY);
    text('|∇f| = ' + D.math.fmt(glen, 2), ox + 4, oy + 11, 'rgba(36,31,26,0.7)', F_SML);
    text('f = ' + D.math.fmt(geom.stats.f0, 2), ox + 4, oy + side - 5, C.contour, F_SML);
  }

  /* ---- PLATE III : the polar rose -------------------------------------- */
  function plate3(st, geom) {
    var C = st.colors;
    var cxp = W / 2, cyp = H / 2 + 2;
    var R = Math.min(W, H) / 2 - 22;
    var gfx = geom.stats.fx, gfy = geom.stats.fy;
    var gmax = Math.sqrt(gfx * gfx + gfy * gfy) || 1e-6;
    var sc = R / gmax;
    var k, a, r, px, py;

    for (k = 1; k <= 3; k++) {
      circlePath(cxp, cyp, (R * k) / 3);
      g.save(); g.strokeStyle = 'rgba(36,31,26,0.12)'; g.lineWidth = 1; g.stroke(); g.restore();
    }
    for (k = 0; k < 12; k++) {
      a = (k * Math.PI) / 6;
      seg(cxp, cyp, cxp + R * Math.cos(a), cyp - R * Math.sin(a), 'rgba(36,31,26,0.09)', 1);
    }
    seg(cxp - R - 5, cyp, cxp + R + 5, cyp, 'rgba(36,31,26,0.22)', 1);
    seg(cxp, cyp - R - 5, cxp, cyp + R + 5, 'rgba(36,31,26,0.22)', 1);

    /* the rose: r(θ) = fx cosθ + fy sinθ  — a circle through the origin */
    var pts = [];
    for (k = 0; k <= 240; k++) {
      a = (k / 240) * Math.PI * 2;
      r = gfx * Math.cos(a) + gfy * Math.sin(a);
      pts.push(cxp + r * sc * Math.cos(a), cyp - r * sc * Math.sin(a));
    }
    g.save();
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.closePath();
    g.fillStyle = rgba(C.dir, 0.13);
    g.fill();
    g.strokeStyle = C.dir;
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();

    /* steepest direction and the needle at θ */
    var aMax = Math.atan2(gfy, gfx);
    seg(cxp, cyp, cxp + R * Math.cos(aMax), cyp - R * Math.sin(aMax), rgba(C.gradient, 0.45), 1, [3, 3]);
    var th = (st.theta * Math.PI) / 180;
    var rr = gfx * Math.cos(th) + gfy * Math.sin(th);
    var nx = cxp + rr * sc * Math.cos(th), ny = cyp - rr * sc * Math.sin(th);
    seg(cxp, cyp, nx, ny, C.gradient, 2.0);
    dot(nx, ny, 2.6, C.gradient, PAPER);
    dot(cxp, cyp, 2.2, 'rgba(36,31,26,0.75)', PAPER);
    text('θ', cxp + 30 * Math.cos(th / 2) - 3, cyp - 30 * Math.sin(th / 2) + 11, 'rgba(36,31,26,0.7)', F_MATH);
    text('Duf = ' + D.math.fmt(rr, 2), cxp, cyp + R + 16, C.dir, F_SML, 'center');
    text('∇f', cxp + R * Math.cos(aMax) - 6, cyp - R * Math.sin(aMax) - 5, C.gradient, F_MATH);
  }

  /* ---- PLATE IV : the gap between dz and Δz ---------------------------- */
  function plate4(st, geom) {
    var m = D.model, C = st.colors, L = st.L;
    var x0 = st.x0, y0 = st.y0;
    var dx = st.dx, dy = st.dy;
    var r = Math.sqrt(dx * dx + dy * dy);
    if (!(r > 1e-6)) { dx = 0.45; dy = 0.3; r = Math.sqrt(dx * dx + dy * dy); }
    var ux = dx / r, uy = dy / r;
    var f0 = geom.stats.f0;
    var slope = geom.stats.fx * ux + geom.stats.fy * uy;
    var padL = 30, padR = 12, padT = 14, padB = 20;
    var pw = W - padL - padR, ph = H - padT - padB;
    var sMin = -0.45, sMax = 1.4, i, s, x, y, v, pv;
    var vals = [], lo = Infinity, hi = -Infinity;
    for (i = 0; i <= 120; i++) {
      s = sMin + ((sMax - sMin) * i) / 120;
      x = x0 + s * r * ux; y = y0 + s * r * uy;
      v = m.f(x, y);
      pv = f0 + slope * s * r;
      if (!isFinite(v)) v = pv;
      vals.push(v, pv);
      if (v < lo) lo = v; if (v > hi) hi = v;
      if (pv < lo) lo = pv; if (pv > hi) hi = pv;
    }
    var sp = Math.max(hi - lo, 1e-3);
    lo -= sp * 0.16; hi += sp * 0.16;
    function toX(s2) { return padL + ((s2 - sMin) / (sMax - sMin)) * pw; }
    function toY(v2) { return padT + ph - ((v2 - lo) / (hi - lo)) * ph; }

    frame(padL, padT, pw, ph, 'rgba(36,31,26,0.28)');
    seg(padL, toY(f0), padL + pw, toY(f0), 'rgba(36,31,26,0.20)', 1, [2, 3]);

    var cp = [], lp = [];
    for (i = 0; i <= 120; i++) {
      s = sMin + ((sMax - sMin) * i) / 120;
      cp.push(toX(s), toY(vals[i * 2]));
      lp.push(toX(s), toY(vals[i * 2 + 1]));
    }
    path(lp, rgba(C.plane, 0.9), 1.3);
    path(cp, C.cx, 1.9);

    /* the gap at the handle */
    var zs = toY(f0 + slope * r);
    var sIdx = Math.round(((1 - sMin) / (sMax - sMin)) * 120) * 2;
    var ze = toY(vals[sIdx]);
    var xg = toX(1);
    seg(xg, zs, xg, ze, C.gradient, 2.2);
    seg(xg, zs, xg - 5, zs, C.gradient, 1);
    seg(xg, ze, xg - 5, ze, C.gradient, 1);
    text('dz', xg + 5, zs - 2, C.gradient, F_SML);
    text('Δz', xg + 5, ze + 10, C.gradient, F_SML);

    seg(toX(0), padT, toX(0), padT + ph, 'rgba(36,31,26,0.22)', 1, [2, 3]);
    dot(toX(0), toY(f0), 2.6, C.pin, PAPER);
    text('P', toX(0) - 4, padT + ph + 11, 'rgba(36,31,26,0.65)', F_SML, 'center');
    text('P+Δp', xg, padT + ph + 11, 'rgba(36,31,26,0.65)', F_SML, 'center');
    text('z', padL - 6, padT + 9, 'rgba(36,31,26,0.55)', F_MATH);
    text('Δz', padL + 3, padT + 9, 'rgba(36,31,26,0)', F_TINY);
    text('s', padL + pw - 2, padT + ph + 11, 'rgba(36,31,26,0.5)', F_TINY, 'right');
  }

  /* The plate canvas keeps the last arguments so that it can be redrawn when
     the column changes width (window resize, rotation, device switch).       */
  var lastSt = null, lastGeom = null, watched = false;

  function draw(canvas, st, geom) {
    if (!geom || !D.model) return;
    lastSt = st; lastGeom = geom;
    setup(canvas);
    try {
      if (st.chapter === 1) plate1(st, geom);
      else if (st.chapter === 2) plate2(st, geom);
      else if (st.chapter === 3) plate3(st, geom);
      else plate4(st, geom);
    } catch (err) {
      if (window.console) console.error(err);
    }
    if (!watched) {
      watched = true;
      var again = function () {
        if (!cv || !lastGeom) return;
        var box = cv.getBoundingClientRect();
        if (Math.abs(box.width - W) < 1 && Math.abs(box.height - H) < 1) return;
        draw(cv, lastSt, lastGeom);
      };
      if (window.ResizeObserver) new ResizeObserver(again).observe(cv);
      else window.addEventListener('resize', again);
    }
  }

  /* force a repaint with the cached state (used after a language switch) */
  function redraw() {
    if (cv && lastGeom) draw(cv, lastSt, lastGeom);
  }

  D.Charts = { draw: draw, redraw: redraw, surface: function () { return cv; } };
})(window.DC);


