/* ==========================================================================
   render/scene.js — 矩阵、相机、取样与几何构建
   Backend-agnostic: produces plain typed arrays that either the WebGPU or
   the WebGL2 renderer can upload without knowing any mathematics.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var PI = Math.PI;
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  /* ------------------------------------------------------------------ mat4
     Column-major, as both WebGL and WebGPU expect.                        */
  var M = {};
  M.mul = function (out, a, b) {
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                         a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  };
  M.perspective = function (out, fovy, aspect, near, far, gpuZ) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0;
    out[12] = 0; out[13] = 0; out[15] = 0;
    if (gpuZ) {
      out[10] = far * nf; out[11] = -1; out[14] = far * near * nf;
    } else {
      out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    }
    return out;
  };
  M.lookAt = function (out, eye, center, up) {
    var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    var l = Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2) || 1;
    z0 /= l; z1 /= l; z2 /= l;
    var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    l = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2) || 1;
    x0 /= l; x1 /= l; x2 /= l;
    var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
    out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
    out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
    return out;
  };

  /* ------------------------------------------------------------------ camera */
  var FOV = 34 * PI / 180;
  var cam = { az: -0.92, el: 0.58, dist: 6.6, target: [0, 0, 0], fov: FOV };

  function camEye() {
    var ce = Math.cos(cam.el), se = Math.sin(cam.el);
    return [
      cam.target[0] + cam.dist * ce * Math.cos(cam.az),
      cam.target[1] + cam.dist * ce * Math.sin(cam.az),
      cam.target[2] + cam.dist * se
    ];
  }
  /** distance needed so that a sphere of `radius` fits in a window of `aspect`.
      Portrait windows have a narrow horizontal field, so we back off further. */
  function fitDist(radius, aspect) {
    var a = (isFinite(aspect) && aspect > 0) ? aspect : 1.6;
    return radius / (Math.tan(FOV / 2) * Math.min(1, a));
  }

  function resetCam(L, zMin, zMax, aspect) {
    var lo = isFinite(zMin) ? zMin : -1, hi = isFinite(zMax) ? zMax : 1;
    var zSpan = Math.max(hi - lo, 0.4);
    var radius = Math.sqrt(8 * L * L + zSpan * zSpan) / 2;
    cam.az = -0.92;
    cam.el = 0.58;
    cam.dist = Math.max(fitDist(radius, aspect) * 0.92, 3.2);
    cam.target[0] = 0;
    cam.target[1] = 0;
    cam.target[2] = (lo + hi) / 2;
  }

  function viewProj(w, h, gpuZ) {
    var aspect = Math.max(w, 1) / Math.max(h, 1);
    var eye = camEye();
    var proj = M.perspective(new Float32Array(16), FOV, aspect, 0.05, 400, gpuZ);
    var view = M.lookAt(new Float32Array(16), eye, cam.target, [0, 0, 1]);
    var vp = new Float32Array(16);
    M.mul(vp, proj, view);
    return { vp: vp, eye: eye };
  }

  /** world -> CSS pixel coordinates (y down). ok=false when behind camera. */
  function project(p, vp, w, h) {
    var x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    var y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    var z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14];
    var ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (ww <= 1e-6) return { x: 0, y: 0, ok: false, depth: 0 };
    return { x: (x / ww * 0.5 + 0.5) * w, y: (0.5 - y / ww * 0.5) * h, ok: true, depth: z };
  }

  /** camera ray through a pixel — exact, independent of the depth convention */
  function ray(px, py, w, h) {
    var eye = camEye();
    var f = [cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]];
    var fl = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var r = [f[1], -f[0], 0];
    var rl = Math.sqrt(r[0] * r[0] + r[1] * r[1]) || 1;
    r = [r[0] / rl, r[1] / rl, 0];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var ndcX = (px / w) * 2 - 1, ndcY = 1 - (py / h) * 2;
    var th = Math.tan(FOV / 2), acc = th * (w / h);
    var dir = [
      f[0] + r[0] * ndcX * acc + u[0] * ndcY * th,
      f[1] + r[1] * ndcX * acc + u[1] * ndcY * th,
      f[2] + r[2] * ndcX * acc + u[2] * ndcY * th
    ];
    var dl = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
    return { o: eye, d: [dir[0] / dl, dir[1] / dl, dir[2] / dl] };
  }

  /* ------------------------------------------------------------------ lines
     A fat-line segment expands into 6 vertices in the vertex shader.
     Layout per vertex: ax,ay,az, bx,by,bz, side, end  (8 floats)           */
  function LB() { this.v = []; }
  LB.prototype.seg = function (ax, ay, az, bx, by, bz) {
    var v = this.v;
    var q = function (side, end) { v.push(ax, ay, az, bx, by, bz, side, end); };
    q(-1, 0); q(-1, 1); q(1, 0);
    q(1, 0); q(-1, 1); q(1, 1);
  };
  LB.prototype.pts = function (arr) {          /* arr: flat [x,y,z,...] pairs */
    for (var i = 0; i + 5 < arr.length; i += 3) {
      this.seg(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5]);
    }
  };
  LB.prototype.closed = function (arr) {
    this.pts(arr);
    var n = arr.length;
    this.seg(arr[n - 3], arr[n - 2], arr[n - 1], arr[0], arr[1], arr[2]);
  };
  LB.prototype.done = function () {
    return { data: new Float32Array(this.v), count: this.v.length / 8 };
  };

  function Poly() { this.v = []; }
  Poly.prototype.tri = function (a, b, c) {
    this.v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  Poly.prototype.quad = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  Poly.prototype.done = function () {
    return { data: new Float32Array(this.v), count: this.v.length / 3 };
  };

  /* ------------------------------------------------------------------ sample
     Evaluates f on the lattice once per build: the mesh, the contours and
     the level curve through P are all derived from this one grid.          */
  function sample(model, st) {
    var n = st.quality, L = st.L, zs = st.zScale, w = n + 1, N = w * w;
    var step = (2 * L) / n;
    var raw = new Float32Array(N), drawn = new Float32Array(N);
    var i, j, k = 0, v, x, y;
    var finite = [];
    for (j = 0; j < w; j++) {
      y = -L + j * step;
      for (i = 0; i < w; i++) {
        x = -L + i * step;
        v = model.f(x, y);
        raw[k] = v;
        if (isFinite(v) && (i % 3 === 0) && (j % 3 === 0)) finite.push(v);
        k++;
      }
    }
    /* robust range: the 2nd/98th percentile keeps poles and spikes sane */
    finite.sort(function (a, b) { return a - b; });
    var lo, hi;
    if (finite.length < 8) { lo = -1; hi = 1; }
    else {
      lo = finite[Math.floor(finite.length * 0.02)];
      hi = finite[Math.floor(finite.length * 0.98)];
    }
    if (!isFinite(lo)) lo = -1;
    if (!isFinite(hi)) hi = 1;
    if (hi - lo < 1e-6) { lo -= 0.5; hi += 0.5; }
    var spanRaw = hi - lo;
    var clampLo = lo - 0.55 * spanRaw, clampHi = hi + 0.55 * spanRaw;

    for (k = 0; k < N; k++) {
      v = raw[k];
      if (!isFinite(v)) v = clampLo;
      if (v < clampLo) v = clampLo;
      else if (v > clampHi) v = clampHi;
      drawn[k] = v * zs;
    }
    return {
      n: n, w: w, L: L, zs: zs, step: step, raw: raw, z: drawn,
      loRaw: lo, hiRaw: hi, clampLoRaw: clampLo, clampHiRaw: clampHi,
      zLo: lo * zs, zHi: hi * zs,
      zMin: clampLo * zs, zMax: clampHi * zs
    };
  }

  /* ---------------------------------------------------------------- surface */
  function buildSurface(S) {
    var w = S.w, n = S.n, N = w * w;
    var pos = new Float32Array(N * 6);
    var idx = new Uint32Array(n * n * 6);
    var i, j, k, p;
    for (j = 0; j < w; j++) {
      for (i = 0; i < w; i++) {
        k = j * w + i;
        p = k * 6;
        pos[p] = -S.L + i * S.step;
        pos[p + 1] = -S.L + j * S.step;
        pos[p + 2] = S.z[k];
        var i0 = i > 0 ? i - 1 : i, i1 = i < n ? i + 1 : i;
        var j0 = j > 0 ? j - 1 : j, j1 = j < n ? j + 1 : j;
        var dzdx = (S.z[j * w + i1] - S.z[j * w + i0]) / ((i1 - i0) * S.step || 1);
        var dzdy = (S.z[j1 * w + i] - S.z[j0 * w + i]) / ((j1 - j0) * S.step || 1);
        var nl = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1) || 1;
        pos[p + 3] = -dzdx / nl; pos[p + 4] = -dzdy / nl; pos[p + 5] = 1 / nl;
      }
    }
    var t = 0;
    for (j = 0; j < n; j++) {
      for (i = 0; i < n; i++) {
        var a = j * w + i, b = a + 1, c = a + w + 1, d = a + w;
        idx[t++] = a; idx[t++] = b; idx[t++] = c;
        idx[t++] = a; idx[t++] = c; idx[t++] = d;
      }
    }
    return { positions: pos, indices: idx, indexCount: t };
  }

  /* ------------------------------------------------------------- utilities */
  function zAt(model, x, y, S) {
    var v = model.f(x, y);
    if (!isFinite(v)) v = S.loRaw;
    if (v < S.clampLoRaw) v = S.clampLoRaw;
    else if (v > S.clampHiRaw) v = S.clampHiRaw;
    return v * S.zs;
  }
  function norm3(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  }

  /* -------------------------------------------------------------- arrowhead */
  function arrow(lb, poly, a, b, headLen, headW) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return;
    var ux = dx / len, uy = dy / len, uz = dz / len;
    var hl = Math.min(headLen, len * 0.62);
    lb.seg(a[0], a[1], a[2], b[0] - ux * hl * 0.86, b[1] - uy * hl * 0.86, b[2] - uz * hl * 0.86);
    var bx = b[0] - ux * hl, by = b[1] - uy * hl, bz = b[2] - uz * hl;
    var px = -uy, py = ux;
    poly.tri([b[0], b[1], b[2]],
             [bx + px * headW, by + py * headW, bz],
             [bx - px * headW, by - py * headW, bz]);
  }

  /* ------------------------------------------------------------ build scene
     The whole figure is rebuilt from state.  Everything below is plain data;
     no graphics API is touched here.                                      */
  function build(st) {
    var model = D.model, math = D.math;
    var C = st.colors, LY = st.layers, ch = st.chapter;
    var L = st.L, zs = st.zScale;
    var Sn = sample(model, st);

    var zLo = Sn.zLo, zHi = Sn.zHi;
    var span = Math.max(zHi - zLo, 1e-3);
    var zSpan = Math.max(Sn.zMax - Sn.zMin, 1e-3);
    var zFloor = Sn.zMin - 0.13 * zSpan - 0.01;
    var zTop = Sn.zMax + 0.12 * zSpan + 0.01;

    var x0 = clamp(st.x0, -L, L), y0 = clamp(st.y0, -L, L);
    var f0 = model.f(x0, y0);
    if (!isFinite(f0)) f0 = Sn.loRaw;
    var pz = zAt(model, x0, y0, Sn);
    var fx = model.fx(x0, y0), fy = model.fy(x0, y0);
    if (!isFinite(fx)) fx = 0;
    if (!isFinite(fy)) fy = 0;
    var grad = Math.sqrt(fx * fx + fy * fy);

    var passes = [], fills = [], lines = [], labels = [];
    var G = 8;                       /* divisions of the ruled floor grid */
    var i, j, k, t, m;

    /* ---- the surface itself --------------------------------------------- */
    if (LY.surface) {
      var sf = buildSurface(Sn);
      passes.push({
        key: 'surface', kind: 'surface',
        positions: sf.positions, indices: sf.indices, indexCount: sf.indexCount,
        color: C.surfaceLit, color2: C.surfaceDark
      });
    }

    /* ---- ruled floor ----------------------------------------------------- */
    if (LY.floor) {
      var fg = new LB();
      for (k = 0; k <= G; k++) {
        t = -L + 2 * L * k / G;
        fg.seg(-L, t, zFloor, L, t, zFloor);
        fg.seg(t, -L, zFloor, t, L, zFloor);
      }
      lines.push({ key: 'floorGrid', kind: 'lines', data: fg.done().data, color: C.grid, width: 1.0, opacity: 0.8 });
      var fb = new LB();
      fb.closed([-L, -L, zFloor, L, -L, zFloor, L, L, zFloor, -L, L, zFloor]);
      lines.push({ key: 'floorFrame', kind: 'lines', data: fb.done().data, color: C.grid, width: 1.5, opacity: 1 });
      var ax = new LB();
      ax.seg(-L, 0, zFloor, L, 0, zFloor);
      ax.seg(0, -L, zFloor, 0, L, zFloor);
      lines.push({ key: 'axes', kind: 'lines', data: ax.done().data, color: C.axis, width: 1.4, opacity: 0.9 });
    }

    /* ---- iso-parameter grid drawn upon the surface ----------------------- */
    if (LY.grid) {
      var sg = new LB(), w = Sn.w, n = Sn.n;
      for (k = 0; k <= G; k++) {
        var ii = Math.round(k * n / G), jj = ii;
        var xi = -L + ii * Sn.step, yj = -L + jj * Sn.step;
        for (m = 0; m < n; m++) {
          sg.seg(xi, -L + m * Sn.step, Sn.z[m * w + ii],
                 xi, -L + (m + 1) * Sn.step, Sn.z[(m + 1) * w + ii]);
          sg.seg(-L + m * Sn.step, yj, Sn.z[jj * w + m],
                 -L + (m + 1) * Sn.step, yj, Sn.z[jj * w + m + 1]);
        }
      }
      lines.push({ key: 'surfGrid', kind: 'lines', data: sg.done().data, color: C.grid, width: 0.9, opacity: 0.5 });
    }

    /* ---- PLATE I : cutting planes, sections, tangents -------------------- */
    if (ch === 1 && LY.cutPlanes) {
      /* each cutting plane is drawn as a "curtain" hanging from the surface
         down to the floor — far lighter than a full sheet, and it reads as
         the shadow of the section. */
      var curt = new Poly(), curt2 = new Poly(), NC = 56, t0, t1;
      for (m = 0; m < NC; m++) {
        t0 = -L + (2 * L * m) / NC;
        t1 = -L + (2 * L * (m + 1)) / NC;
        curt.quad([t0, y0, zFloor], [t1, y0, zFloor],
                  [t1, y0, zAt(model, t1, y0, Sn)], [t0, y0, zAt(model, t0, y0, Sn)]);
        curt2.quad([x0, t0, zFloor], [x0, t1, zFloor],
                   [x0, t1, zAt(model, x0, t1, Sn)], [x0, t0, zAt(model, x0, t0, Sn)]);
      }
      fills.push({ key: 'cutY', kind: 'poly', data: curt.done().data, color: C.cx, opacity: 0.13, mode: 1 });
      fills.push({ key: 'cutX', kind: 'poly', data: curt2.done().data, color: C.cy, opacity: 0.13, mode: 1 });
      var bpl = new LB();
      bpl.seg(-L, y0, zFloor, L, y0, zFloor);
      bpl.seg(-L, y0, zFloor, -L, y0, zAt(model, -L, y0, Sn));
      bpl.seg(L, y0, zFloor, L, y0, zAt(model, L, y0, Sn));
      bpl.seg(x0, -L, zFloor, x0, L, zFloor);
      bpl.seg(x0, -L, zFloor, x0, -L, zAt(model, x0, -L, Sn));
      bpl.seg(x0, L, zFloor, x0, L, zAt(model, x0, L, Sn));
      lines.push({ key: 'cutBorder', kind: 'lines', data: bpl.done().data, color: C.plane, width: 1.0, opacity: 0.45 });
    }

    if (ch === 1 && LY.sections) {
      var MS = 170, ptsX = [], ptsY = [], xx;
      for (m = 0; m <= MS; m++) {
        xx = -L + 2 * L * m / MS;
        ptsX.push(xx, y0, zAt(model, xx, y0, Sn));
        ptsY.push(x0, xx, zAt(model, x0, xx, Sn));
      }
      var lbX = new LB(); lbX.pts(ptsX);
      var lbY = new LB(); lbY.pts(ptsY);
      lines.push({ key: 'cx', kind: 'lines', data: lbX.done().data, color: C.cx, width: 2.4, opacity: 1 });
      lines.push({ key: 'cy', kind: 'lines', data: lbY.done().data, color: C.cy, width: 2.4, opacity: 1 });
    }

    if (ch === 1 && LY.tangents) {
      var dX = norm3(1, 0, fx * zs), dY = norm3(0, 1, fy * zs);
      var hl = 0.72 * L, tlb = new LB();
      tlb.seg(x0 - dX[0] * hl, y0 - dX[1] * hl, pz - dX[2] * hl,
              x0 + dX[0] * hl, y0 + dX[1] * hl, pz + dX[2] * hl);
      tlb.seg(x0 - dY[0] * hl, y0 - dY[1] * hl, pz - dY[2] * hl,
              x0 + dY[0] * hl, y0 + dY[1] * hl, pz + dY[2] * hl);
      lines.push({ key: 'tangents', kind: 'lines', data: tlb.done().data, color: C.tangent, width: 1.7, opacity: 1 });

      /* slope triangles: run along the axis, rise to meet the tangent */
      var e1 = 0.52 * L, tri = new LB();
      tri.seg(x0, y0, pz, x0 + e1, y0, pz);
      tri.seg(x0 + e1, y0, pz, x0 + e1, y0, pz + e1 * fx * zs);
      tri.seg(x0, y0, pz, x0, y0 + e1, pz);
      tri.seg(x0, y0 + e1, pz, x0, y0 + e1, pz + e1 * fy * zs);
      lines.push({ key: 'slopeTri', kind: 'lines', data: tri.done().data, color: C.tangent, width: 1.1, opacity: 0.8 });
      labels.push({ text: '∂f/∂x', pos: [x0 + dX[0] * hl * 1.02, y0 + dX[1] * hl * 1.02, pz + dX[2] * hl * 1.02 + 0.03 * span], color: C.cx });
      labels.push({ text: '∂f/∂y', pos: [x0 + dY[0] * hl * 1.02, y0 + dY[1] * hl * 1.02, pz + dY[2] * hl * 1.02 + 0.03 * span], color: C.cy });
      labels.push({ text: 'h', pos: [x0 + e1 * 0.55, y0, pz - 0.04 * span], color: C.tangent, cls: 'tag' });
    }

    /* ---- PLATE II : contours, level curve, gradient ---------------------- */
    if (LY.contours) {
      var levels = 9, cb = new LB(), seg, lev;
      for (k = 1; k < levels; k++) {
        lev = Sn.loRaw + (Sn.hiRaw - Sn.loRaw) * k / levels;
        seg = math.contourSegments(Sn.raw, Sn.n, L, lev);
        for (i = 0; i + 3 < seg.length; i += 4) {
          cb.seg(seg[i], seg[i + 1], zFloor + 1e-4, seg[i + 2], seg[i + 3], zFloor + 1e-4);
        }
      }
      lines.push({ key: 'contours', kind: 'lines', data: cb.done().data, color: C.contour, width: 1.1, opacity: 0.85 });

      /* the level set through P, lifted onto the surface */
      var segP = math.contourSegments(Sn.raw, Sn.n, L, f0);
      if (segP.length) {
        var lc = new LB();
        for (i = 0; i + 3 < segP.length; i += 4) {
          lc.seg(segP[i], segP[i + 1], pz, segP[i + 2], segP[i + 3], pz);
        }
        lines.push({ key: 'levelCurve', kind: 'lines', data: lc.done().data, color: C.contour, width: 2.2, opacity: 0.95 });
      }
    }

    if ((ch === 2 || ch === 3) && LY.gradient && grad > 1e-6) {
      var sc = grad > 1.15 * L ? (1.15 * L) / grad : 1;
      var gx = fx * sc, gy = fy * sc;
      var gb = new LB(), gh = new Poly();
      var zf2 = zFloor + 2e-4;
      arrow(gb, gh, [x0, y0, zf2], [x0 + gx, y0 + gy, zf2], 0.11 * L, 0.045 * L);
      lines.push({ key: 'gradShaft', kind: 'lines', data: gb.done().data, color: C.gradient, width: 2.4, opacity: 1 });
      fills.push({ key: 'gradHead', kind: 'poly', data: gh.done().data, color: C.gradient, opacity: 1, mode: 0 });
      labels.push({ text: '∇f', pos: [x0 + gx * 1.12, y0 + gy * 1.12, zf2], color: C.gradient });
    }

    /* ---- PLATE III : the direction plane and its section ------------------ */
    var th = (st.theta * Math.PI) / 180;
    var ux = Math.cos(th), uy = Math.sin(th);
    var Du = fx * ux + fy * uy;
    var tlim = 0.92 * L;
    if (Math.abs(ux) > 1e-6) tlim = Math.min(tlim, (ux > 0 ? (L - x0) : (-L - x0)) / ux);
    if (Math.abs(uy) > 1e-6) tlim = Math.min(tlim, (uy > 0 ? (L - y0) : (-L - y0)) / uy);
    tlim = Math.max(tlim, 0.06 * L);

    if (ch === 3 && LY.dirPlane) {
      var dpoly = new Poly(), ND = 40, u0, u1;
      for (m = 0; m < ND; m++) {
        u0 = -tlim + (2 * tlim * m) / ND;
        u1 = -tlim + (2 * tlim * (m + 1)) / ND;
        dpoly.quad(
          [x0 + u0 * ux, y0 + u0 * uy, zFloor],
          [x0 + u1 * ux, y0 + u1 * uy, zFloor],
          [x0 + u1 * ux, y0 + u1 * uy, zAt(model, x0 + u1 * ux, y0 + u1 * uy, Sn)],
          [x0 + u0 * ux, y0 + u0 * uy, zAt(model, x0 + u0 * ux, y0 + u0 * uy, Sn)]);
      }
      fills.push({ key: 'dirPlane', kind: 'poly', data: dpoly.done().data, color: C.dir, opacity: 0.13, mode: 1 });
      var dbp = new LB();
      dbp.seg(x0 - tlim * ux, y0 - tlim * uy, zFloor, x0 + tlim * ux, y0 + tlim * uy, zFloor);
      dbp.seg(x0 - tlim * ux, y0 - tlim * uy, zFloor,
              x0 - tlim * ux, y0 - tlim * uy, zAt(model, x0 - tlim * ux, y0 - tlim * uy, Sn));
      dbp.seg(x0 + tlim * ux, y0 + tlim * uy, zFloor,
              x0 + tlim * ux, y0 + tlim * uy, zAt(model, x0 + tlim * ux, y0 + tlim * uy, Sn));
      lines.push({ key: 'dirPlaneEdge', kind: 'lines', data: dbp.done().data, color: C.dir, width: 1.0, opacity: 0.45 });
    }

    if (ch === 3 && LY.sections) {
      var MM = 150, ptu = [], tt;
      for (m = 0; m <= MM; m++) {
        tt = -tlim + (2 * tlim * m) / MM;
        ptu.push(x0 + tt * ux, y0 + tt * uy, zAt(model, x0 + tt * ux, y0 + tt * uy, Sn));
      }
      var dcu = new LB(); dcu.pts(ptu);
      lines.push({ key: 'duCurve', kind: 'lines', data: dcu.done().data, color: C.dir, width: 2.4, opacity: 1 });
    }

    if (ch === 3 && LY.tangents) {
      var dU = norm3(ux, uy, Du * zs), h3 = 0.6 * L, tlu = new LB();
      tlu.seg(x0 - dU[0] * h3, y0 - dU[1] * h3, pz - dU[2] * h3,
              x0 + dU[0] * h3, y0 + dU[1] * h3, pz + dU[2] * h3);
      lines.push({ key: 'tanU', kind: 'lines', data: tlu.done().data, color: C.tangent, width: 1.7, opacity: 1 });
      var e3 = Math.min(0.5 * L, tlim * 0.92), triU = new LB();
      triU.seg(x0, y0, pz, x0 + e3 * ux, y0 + e3 * uy, pz);
      triU.seg(x0 + e3 * ux, y0 + e3 * uy, pz, x0 + e3 * ux, y0 + e3 * uy, pz + e3 * Du * zs);
      lines.push({ key: 'slopeTriU', kind: 'lines', data: triU.done().data, color: C.tangent, width: 1.1, opacity: 0.8 });
      labels.push({ text: 'D<sub>u</sub>f', pos: [x0 + dU[0] * h3 * 1.06, y0 + dU[1] * h3 * 1.06, pz + dU[2] * h3 * 1.06], color: C.tangent });
    }

    if (ch === 3) {
      var uv = 0.62 * L, uvb = new LB(), uvh = new Poly(), zf3 = zFloor + 2e-4;
      arrow(uvb, uvh, [x0, y0, zf3], [x0 + uv * ux, y0 + uv * uy, zf3], 0.1 * L, 0.04 * L);
      lines.push({ key: 'uVec', kind: 'lines', data: uvb.done().data, color: C.dir, width: 2.4, opacity: 1 });
      fills.push({ key: 'uHead', kind: 'poly', data: uvh.done().data, color: C.dir, opacity: 1, mode: 0 });
      labels.push({ text: 'u', pos: [x0 + uv * ux * 1.14, y0 + uv * uy * 1.14, zf3], color: C.dir });
    }

    /* ---- PLATE IV : tangent plane, dz against dz -------------------------- */
    var hand = null;
    if (ch === 4 && LY.tangentPlane) {
      var h4 = 0.82 * L;
      var planeZ = function (x, y) { return pz + fx * (x - x0) * zs + fy * (y - y0) * zs; };
      var c1 = [x0 - h4, y0 - h4, 0], c2 = [x0 + h4, y0 - h4, 0];
      var c3 = [x0 + h4, y0 + h4, 0], c4 = [x0 - h4, y0 + h4, 0];
      c1[2] = planeZ(c1[0], c1[1]); c2[2] = planeZ(c2[0], c2[1]);
      c3[2] = planeZ(c3[0], c3[1]); c4[2] = planeZ(c4[0], c4[1]);
      var tp = new Poly();
      tp.quad(c1, c2, c3, c4);
      fills.push({ key: 'tangentPlane', kind: 'poly', data: tp.done().data, color: C.plane, opacity: 0.14, mode: 1 });
      var tpG = new LB(), nG = 4;
      tpG.closed([c1[0], c1[1], c1[2], c2[0], c2[1], c2[2],
                  c3[0], c3[1], c3[2], c4[0], c4[1], c4[2]]);
      for (k = 1; k < nG; k++) {
        var fa = k / nG, ax0 = x0 - h4 + 2 * h4 * fa, ay0 = y0 - h4 + 2 * h4 * fa;
        tpG.seg(ax0, y0 - h4, planeZ(ax0, y0 - h4), ax0, y0 + h4, planeZ(ax0, y0 + h4));
        tpG.seg(x0 - h4, ay0, planeZ(x0 - h4, ay0), x0 + h4, ay0, planeZ(x0 + h4, ay0));
      }
      lines.push({ key: 'tangentPlaneGrid', kind: 'lines', data: tpG.done().data, color: C.plane, width: 1.0, opacity: 0.7 });

      var xh = clamp(x0 + st.dx, -L, L), yh = clamp(y0 + st.dy, -L, L);
      var zh = zAt(model, xh, yh, Sn), zp = planeZ(xh, yh);
      var gap = new LB(), mark = new LB(), tick = 0.055 * L;
      gap.seg(xh, yh, zp, xh, yh, zh);
      mark.seg(xh - tick, yh, zh, xh + tick, yh, zh);
      mark.seg(xh, yh - tick, zh, xh, yh + tick, zh);
      mark.seg(xh - tick, yh, zp, xh + tick, yh, zp);
      lines.push({ key: 'gap', kind: 'lines', data: gap.done().data, color: C.gradient, width: 2.8, opacity: 1 });
      lines.push({ key: 'gapMark', kind: 'lines', data: mark.done().data, color: C.gradient, width: 1.2, opacity: 0.9 });
      var handLB = new LB();
      handLB.seg(xh - tick * 1.5, yh - tick * 1.5, zh, xh + tick * 1.5, yh + tick * 1.5, zh);
      handLB.seg(xh - tick * 1.5, yh + tick * 1.5, zh, xh + tick * 1.5, yh - tick * 1.5, zh);
      lines.push({ key: 'handle', kind: 'lines', data: handLB.done().data, color: C.pin, width: 2.6, opacity: 1 });
      labels.push({ text: 'd<i>z</i>', pos: [xh, yh, (zp + zh) / 2], color: C.gradient });
      labels.push({ text: 'Δ<i>z</i>', pos: [xh + tick * 2.4, yh, zh], color: C.gradient, cls: 'small' });
      labels.push({ text: 'T', pos: [c3[0], c3[1], c3[2]], color: C.plane });
      hand = { xh: xh, yh: yh, zh: zh, zp: zp };
    }

    /* ---- the pin at P, and its plumb line to the floor ------------------- */
    var ps = 0.032 * L + 0.015, pin = new LB();
    pin.seg(x0 - ps, y0, pz, x0 + ps, y0, pz);
    pin.seg(x0, y0 - ps, pz, x0, y0 + ps, pz);
    pin.seg(x0, y0, pz, x0, y0, pz + 2.6 * ps);
    lines.push({ key: 'pin', kind: 'lines', data: pin.done().data, color: C.pin, width: 2.8, opacity: 1 });
    var drop = new LB(), nSeg = 16, ddz = (pz - zFloor) / nSeg;
    for (k = 0; k < nSeg; k++) {
      if (k % 2 === 0) drop.seg(x0, y0, zFloor + k * ddz, x0, y0, zFloor + (k + 1) * ddz);
    }
    lines.push({ key: 'plumb', kind: 'lines', data: drop.done().data, color: C.pin, width: 1.0, opacity: 0.55 });

    for (i = 0; i < fills.length; i++) passes.push(fills[i]);
    for (i = 0; i < lines.length; i++) passes.push(lines[i]);

    labels.push({ text: 'P', pos: [x0, y0, pz + 0.11 * Math.max(span, 0.5)], color: C.pin, cls: 'strong' });
    labels.push({ text: 'x', pos: [L * 1.07, 0, zFloor], color: C.axis, cls: 'small' });
    labels.push({ text: 'y', pos: [0, L * 1.07, zFloor], color: C.axis, cls: 'small' });

    return {
      passes: passes,
      labels: labels,
      field: { raw: Sn.raw, n: Sn.n, L: L, lo: Sn.loRaw, hi: Sn.hiRaw },
      zFloor: zFloor, zTop: zTop, zLo: zLo, zHi: zHi,
      zMid: (Sn.zMin + Sn.zMax) / 2, span: span,
      zMin: Sn.zMin, zMax: Sn.zMax,
      pivot: [x0, y0, pz],
      stats: {
        f0: f0, fx: fx, fy: fy, grad: grad, Du: Du, theta: th, pz: pz,
        L: L, zs: zs, zFloor: zFloor, zTop: zTop, zLo: zLo, zHi: zHi,
        x0: x0, y0: y0, hand: hand
      }
    };
  }

  D.Scene = {
    M: M, cam: cam, resetCam: resetCam, fitDist: fitDist, viewProj: viewProj, project: project,
    ray: ray, clamp: clamp, LB: LB, Poly: Poly, camEye: camEye, FOV: FOV,
    sample: sample, zAt: zAt, build: build
  };
})(window.DC);




