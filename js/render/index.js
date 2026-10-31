/* ==========================================================================
   render/index.js — the stage: backend choice, frame loop, interaction
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var canvas = null, stageEl = null, labelEl = null, badgeEl = null;
  var state = null, opts = null;
  var renderer = null, geom = null, dirty = true;
  var W = 1, H = 1, DPR = 1;
  var lastT = 0, labelCache = '', painted = false;
  var drawCount = 0;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var aspect0 = 0;

  function resize() {
    var r = stageEl.getBoundingClientRect();
    W = Math.max(80, Math.round(r.width));
    H = Math.max(80, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    if (renderer) renderer.resize(W, H, DPR);
    var a = W / Math.max(H, 1);
    /* a phone turned on its side changes the field of view a lot — re-frame */
    if (aspect0 && Math.abs(a - aspect0) > 0.25 && geom && api.fitView) api.fitView();
    aspect0 = a;
    dirty = true;
    /* resizing the drawing buffer clears it; repaint at once so the stage is
       never left showing an empty quad while the next frame is pending */
    if (renderer && geom) drawFrame();
  }

  function basis(eye) {
    var t = D.Scene.cam.target;
    var f = [t[0] - eye[0], t[1] - eye[1], t[2] - eye[2]];
    var fl = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var r = [f[1], -f[0], 0];
    var rl = Math.sqrt(r[0] * r[0] + r[1] * r[1]) || 1;
    r = [r[0] / rl, r[1] / rl, 0];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { f: f, r: r, u: u };
  }

  function drawFrame() {
    if (!renderer || !geom) return;
    var cam = D.Scene.cam;
    var dz = geom.zMid - cam.target[2];
    if (Math.abs(dz) > 0.0005) cam.target[2] += dz * 0.16;
    else cam.target[2] = geom.zMid;

    var gpuZ = renderer.backend === 'webgpu';
    var vp = D.Scene.viewProj(W, H, gpuZ);
    var b = basis(vp.eye);
    var light = [
      b.f[0] * 0.55 - b.r[0] * 0.42 + b.u[0] * 0.78,
      b.f[1] * 0.55 - b.r[1] * 0.42 + b.u[1] * 0.78,
      b.f[2] * 0.55 - b.r[2] * 0.42 + b.u[2] * 0.78
    ];
    var ll = Math.sqrt(light[0] * light[0] + light[1] * light[1] + light[2] * light[2]) || 1;
    light = [light[0] / ll, light[1] / ll, light[2] / ll];

    renderer.draw({
      vp: vp.vp, eye: vp.eye, light: light,
      ink: D.hexToRGB('#241f1a', [0, 0, 0]),
      paper: state.paper || '#f3ecdc', hatch: state.hatch, dpr: DPR,
      passes: window.__solo
        ? geom.passes.filter(function (p) { return p.kind === window.__solo; })
        : geom.passes
    });
    painted = true;
    drawCount++;
    paintLabels(vp.vp);
  }

  function paintLabels(vp) {
    var out = '', list = geom.labels || [];
    for (var i = 0; i < list.length; i++) {
      var l = list[i];
      var p = D.Scene.project(l.pos, vp, W, H);
      if (!p.ok) continue;
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
      out += '<span class="stage-label' + (l.cls ? ' stage-label--' + l.cls : '') +
        '" style="left:' + p.x.toFixed(1) + 'px;top:' + p.y.toFixed(1) + 'px;color:' +
        l.color + '">' + l.text + '</span>';
    }
    if (out !== labelCache) { labelEl.innerHTML = out; labelCache = out; }
  }

  function tick(t) {
    requestAnimationFrame(tick);
    var dt = lastT ? Math.min(0.06, (t - lastT) / 1000) : 0;
    lastT = t;
    if (opts.onFrame) opts.onFrame(dt);
    if (dirty && D.model) {
      try {
        geom = D.Scene.build(state);
        labelCache = '\u0000';
      } catch (err) {
        if (window.console) console.error(err);
      }
      dirty = false;
    }
    /* redraw every frame: a WebGL canvas that is drawn once and abandoned can
       be composited as a blank quad, and the camera also eases toward the
       surface's mid-height for a few frames after each change. */
    drawFrame();
  }

  /* ---------------------------------------------------------------- pointers */
  var drag = null;
  var ptrs = {};        /* every finger / pen / mouse currently down */
  var pinch = null;     /* two-finger zoom session */
  var tap = null;       /* last tap, for double-tap reset on touch */

  function ptrCount() {
    var n = 0, k;
    for (k in ptrs) if (ptrs.hasOwnProperty(k)) n++;
    return n;
  }
  function twoPts() {
    var out = [], k;
    for (k in ptrs) if (ptrs.hasOwnProperty(k)) out.push(ptrs[k]);
    return out;
  }
  function dist2(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function distRange() {
    var L = state ? state.L : 2;
    return [1.2 * L + 0.8, 9 * L + 8];
  }
  function zoomBy(f) {
    if (!state) return;
    var cam = D.Scene.cam, r = distRange();
    cam.dist = clamp(cam.dist * f, r[0], r[1]);
    drawFrame();
  }
  function resetView() {
    if (!geom || !state) return;
    D.Scene.resetCam(state.L, geom.zMin, geom.zMax, W / Math.max(H, 1));
    drawFrame();
  }

  function localPoint(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function screenOf(p) {
    var vp = D.Scene.viewProj(W, H, renderer && renderer.backend === 'webgpu');
    return D.Scene.project(p, vp.vp, W, H);
  }

  function startDrag(ev) {
    ptrs[ev.pointerId] = localPoint(ev);
    if (ptrCount() >= 2) {                       /* second finger → pinch zoom */
      var ps = twoPts();
      pinch = { d0: Math.max(8, dist2(ps[0], ps[1])), dist0: D.Scene.cam.dist };
      if (drag) { try { canvas.releasePointerCapture(drag.id); } catch (e) {} drag = null; }
      canvas.className = 'stage__canvas is-dragging';
      if (opts.onHintHide) opts.onHintHide();
      return;
    }
    if (!geom) return;
    var p = localPoint(ev);
    var pin = screenOf(geom.pivot);
    var mode = 'orbit';
    if (pin.ok && Math.sqrt(Math.pow(p.x - pin.x, 2) + Math.pow(p.y - pin.y, 2)) < 30) mode = 'pin';
    if (state.chapter === 4 && geom.stats.hand) {
      var h = screenOf([geom.stats.hand.xh, geom.stats.hand.yh, geom.stats.hand.zh]);
      if (h.ok && Math.sqrt(Math.pow(p.x - h.x, 2) + Math.pow(p.y - h.y, 2)) < 30) mode = 'handle';
    }
    drag = { mode: mode, x: p.x, y: p.y, id: ev.pointerId, x0: p.x, y0: p.y, moved: 0 };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    canvas.className = 'stage__canvas is-dragging';
    if (opts.onHintHide) opts.onHintHide();
    if (mode !== 'orbit') moveDrag(ev);
  }

  function moveDrag(ev) {
    if (!drag) return;
    var p = localPoint(ev);
    var dx = p.x - drag.x, dy = p.y - drag.y;
    var cam = D.Scene.cam;
    drag.x = p.x; drag.y = p.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'orbit') {
      cam.az -= dx * 0.0075;
      cam.el = clamp(cam.el + dy * 0.0060, 0.05, 1.44);
      drawFrame();
    } else if (drag.mode === 'pin') {
      dragPinTo(p.x, p.y);
    } else if (drag.mode === 'handle') {
      var r = D.Scene.ray(p.x, p.y, W, H);
      var zc = geom.stats.hand.zh;
      if (Math.abs(r.d[2]) > 1e-4) {
        var t = (zc - r.o[2]) / r.d[2];
        if (t > 0) {
          state.dx = clamp(r.o[0] + r.d[0] * t - state.x0, -state.L, state.L);
          state.dy = clamp(r.o[1] + r.d[1] * t - state.y0, -state.L, state.L);
          if (opts.onHandle) opts.onHandle();
        }
      }
    }
  }

  function dragPinTo(px, py) {
    var r = D.Scene.ray(px, py, W, H);
    var L = state.L, zs = state.zScale;
    var zc = geom.stats.pz, x = state.x0, y = state.y0;
    for (var it = 0; it < 3; it++) {
      if (Math.abs(r.d[2]) < 1e-5) break;
      var t = (zc - r.o[2]) / r.d[2];
      if (t <= 0) break;
      x = clamp(r.o[0] + r.d[0] * t, -L, L);
      y = clamp(r.o[1] + r.d[1] * t, -L, L);
      var v = D.model.f(x, y);
      if (!isFinite(v)) break;
      zc = clamp(v * zs, geom.zLo, geom.zHi);
    }
    state.x0 = x;
    state.y0 = y;
    if (opts.onPoint) opts.onPoint();
  }

  function endDrag(ev) {
    var id = ev && ev.pointerId != null ? ev.pointerId : null;
    var wasDrag = drag;
    if (id != null) delete ptrs[id];
    if (pinch && ptrCount() < 2) pinch = null;
    if (drag && (id == null || drag.id === id)) {
      drag = null;
      try { if (id != null) canvas.releasePointerCapture(id); } catch (e) {}
    }
    canvas.className = 'stage__canvas' + (ptrCount() ? ' is-dragging' : '');
    dirty = true;
    /* a touch that neither orbited nor grabbed a handle, twice in quick
       succession, is a double tap → reset the view (dblclick misses on iOS) */
    if (wasDrag && wasDrag.mode === 'orbit' && wasDrag.moved < 8 && ev && ev.pointerType === 'touch') {
      var now = Date.now();
      if (tap && now - tap.t < 360 &&
          Math.abs(wasDrag.x0 - tap.x) < 30 && Math.abs(wasDrag.y0 - tap.y) < 30) {
        tap = null;
        resetView();
      } else {
        tap = { t: now, x: wasDrag.x0, y: wasDrag.y0 };
      }
    }
  }

  var api = {
    backend: '',

    init: async function (st, options) {
      state = st; opts = options || {};
      stageEl = document.getElementById('stage');
      canvas = document.getElementById('gl');
      labelEl = document.getElementById('labels');
      badgeEl = document.getElementById('engineTag');

      var made = null;
      try {
        if (D.createWebGPU) made = await D.createWebGPU(canvas);
      } catch (e) { made = null; }
      if (!made) {
        var fresh = canvas.cloneNode(false);
        canvas.parentNode.replaceChild(fresh, canvas);
        canvas = fresh;
        try { made = D.createWebGL2(canvas); } catch (e2) { made = null; }
      }
      renderer = made;
      if (badgeEl) {
        badgeEl.textContent = renderer
          ? 'ENGINE · ' + renderer.label + ' · ' + W + '×' + H + ' @' + DPR
          : 'NO GPU BACKEND';
      }
      if (!renderer) return null;
      api.backend = renderer.backend;

      resize();
      if (badgeEl) {
        badgeEl.textContent = 'ENGINE · ' + renderer.label + ' · ' + W + '×' + H + ' @' + DPR +
          ' · ' + (geom ? geom.passes.length : 0) + 'p';
      }
      if (window.ResizeObserver) {
        new ResizeObserver(function () { resize(); }).observe(stageEl);
      } else {
        window.addEventListener('resize', resize);
      }

      canvas.addEventListener('pointerdown', startDrag);
      canvas.addEventListener('pointermove', function (ev) {
        if (ptrs.hasOwnProperty(ev.pointerId)) ptrs[ev.pointerId] = localPoint(ev);
        if (pinch && ptrCount() >= 2) {
          var ps = twoPts();
          var d = Math.max(8, dist2(ps[0], ps[1]));
          var cm = D.Scene.cam, rr = distRange();
          cm.dist = clamp(pinch.dist0 * (pinch.d0 / d), rr[0], rr[1]);
          drawFrame();
          return;
        }
        if (drag) { moveDrag(ev); return; }
        if (!geom) return;
        var p = localPoint(ev);
        var pin = screenOf(geom.pivot);
        var near = pin.ok && Math.sqrt(Math.pow(p.x - pin.x, 2) + Math.pow(p.y - pin.y, 2)) < 30;
        canvas.className = 'stage__canvas' + (near ? ' is-pin' : '');
      });
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('pointerleave', function (ev) {
        if (drag && drag.mode === 'orbit' && ev.pointerType !== 'touch') endDrag(ev);
      });
      canvas.addEventListener('dblclick', function (ev) { ev.preventDefault(); resetView(); });
      canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
      canvas.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        /* ctrl+wheel is the trackpad pinch gesture — zoom harder */
        var k = ev.ctrlKey ? 0.006 : 0.0011;
        zoomBy(Math.exp(clamp(ev.deltaY, -240, 240) * k));
      }, { passive: false });

      requestAnimationFrame(tick);
      return renderer;
    },

    invalidate: function () { dirty = true; },
    redraw: function () { dirty = true; drawFrame(); },
    resetView: function () { resetView(); },
    zoomBy: function (f) { zoomBy(f); },
    geom: function () { return geom; },

    /** re-frame the camera on the current surface, keeping the viewing angle */
    fitView: function () {
      if (!geom) return;
      var zSpan = Math.max(geom.zMax - geom.zMin, 0.4);
      var radius = Math.sqrt(8 * state.L * state.L + zSpan * zSpan) / 2;
      var cam = D.Scene.cam;
      cam.dist = Math.max(D.Scene.fitDist(radius, W / Math.max(H, 1)) * 0.92, 3.2);
      cam.target[0] = 0;
      cam.target[1] = 0;
      cam.target[2] = (geom.zMin + geom.zMax) / 2;
    },

    /** build synchronously (used by the UI so readouts stay in step) */
    refresh: function () {
      if (!state || !D.model) return null;
      try {
        geom = D.Scene.build(state);
      } catch (err) {
        if (window.console) console.error(err);
        return null;
      }
      dirty = false;
      painted = false;
      labelCache = '\u0000';
      return geom;
    },

    capture: function () {
      if (!renderer) return Promise.resolve(null);
      if (renderer.backend === 'webgpu') {
        var pr = renderer.capture();
        dirty = true;
        return pr;
      }
      drawFrame();
      try { return Promise.resolve(renderer.readPixels()); }
      catch (e) { return Promise.resolve(null); }
    },

    backendLabel: function () { return renderer ? renderer.label : ''; },

    diag: function () {
      return {
        w: W, h: H, dpr: DPR, draws: drawCount,
        passes: geom ? geom.passes.length : 0,
        canvas: canvas ? canvas.width + 'x' + canvas.height : 'none',
        paper: state ? state.paper : '?'
      };
    }
  };

  D.Stage = api;
})(window.DC);
