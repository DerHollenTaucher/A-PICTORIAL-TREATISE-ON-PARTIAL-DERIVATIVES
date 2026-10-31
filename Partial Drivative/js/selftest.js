/* ==========================================================================
   selftest.js — 数学自检 / headless assertions  (?selftest=1)
   Prints a plain report into the DOM so that `--dump-dom` can read it.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  function run() {
    var lines = [], fails = 0;
    function ok(name, cond, detail) {
      lines.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '   [' + detail + ']' : ''));
      if (!cond) fails++;
    }
    var i, j, k;

    /* 1 · parser -------------------------------------------------------- */
    var c = D.math.compile('p*x^2 - q*y^2');
    var v = c.ok ? c.fn(0.6, -0.4, 0, 0, 0, 1, 1, 0, 0) : NaN;
    ok('parse.poly', c.ok && Math.abs(v - 0.2) < 1e-9, 'f=' + v);

    var c2 = D.math.compile('a*sin(b*x)*cos(c*y)');
    var v2 = c2.ok ? c2.fn(0.3, 0.2, 1, 2, 3, 0, 0, 0, 0) : NaN;
    var ref2 = Math.sin(0.6) * Math.cos(0.6);
    ok('parse.trig', c2.ok && Math.abs(v2 - ref2) < 1e-12, 'f=' + v2 + ' ref=' + ref2);

    var c3 = D.math.compile('2*x^');
    ok('parse.error', !c3.ok, c3.error || 'no error raised');

    var c4 = D.math.compile('sqrt(x^2+y^2) + ln(exp(1)) - abs(-2)');
    var v4 = c4.ok ? c4.fn(3, 4, 0, 0, 0, 0, 0, 0, 0) : NaN;
    ok('parse.funcs', c4.ok && Math.abs(v4 - 4) < 1e-9, 'f=' + v4);

    var c5 = D.math.compile('evil(x)');
    ok('parse.reject', !c5.ok, c5.error || 'accepted an unknown identifier');

    /* 2 · partial derivatives vs analytic ------------------------------- */
    var m = D.math.makeModel('x^2 - y^2', {});
    var fx = m.fx(0.6, -0.4), fy = m.fy(0.6, -0.4);
    ok('partial.fx', Math.abs(fx - 1.2) < 1e-4, 'fx=' + fx);
    ok('partial.fy', Math.abs(fy - 0.8) < 1e-4, 'fy=' + fy);   /* -2y at y = -0.4 */

    var m2 = D.math.makeModel('a*sin(b*x)*cos(c*y)', { a: 1, b: 2, c: 3 });
    var xq = 0.35, yq = -0.15;
    var exFx = 2 * Math.cos(2 * xq) * Math.cos(3 * yq);
    var exFy = -3 * Math.sin(2 * xq) * Math.sin(3 * yq);
    ok('partial.trig', Math.abs(m2.fx(xq, yq) - exFx) < 1e-4 &&
      Math.abs(m2.fy(xq, yq) - exFy) < 1e-4,
      'fx=' + m2.fx(xq, yq) + ' fy=' + m2.fy(xq, yq));

    /* 3 · marching squares ---------------------------------------------- */
    var n = 64, L = 2, w = n + 1;
    var g = new Float32Array(w * w);
    for (j = 0; j <= n; j++) {
      for (i = 0; i <= n; i++) {
        var x = -L + (2 * L * i) / n, y = -L + (2 * L * j) / n;
        g[j * w + i] = x * x + y * y;
      }
    }
    var segs = D.math.contourSegments(g, n, L, 1);
    var maxErr = 0, bad = 0;
    for (k = 0; k < segs.length; k += 2) {
      var e = Math.abs(segs[k] * segs[k] + segs[k + 1] * segs[k + 1] - 1);
      if (!isFinite(e)) { bad++; continue; }
      if (e > maxErr) maxErr = e;
    }
    ok('contour.segments', segs.length / 4 > 20 && bad === 0,
      'segs=' + segs.length / 4 + ' maxErr=' + maxErr.toFixed(4));
    ok('contour.accuracy', maxErr < 0.05, 'maxErr=' + maxErr.toFixed(4));

    /* 4 · projection and picking ---------------------------------------- */
    var vp = D.Scene.viewProj(800, 500, false).vp;
    var ctr = D.Scene.project(D.Scene.cam.target, vp, 800, 500);
    ok('project.centre', ctr.ok && Math.abs(ctr.x - 400) < 0.6 && Math.abs(ctr.y - 250) < 0.6,
      '(' + ctr.x.toFixed(2) + ', ' + ctr.y.toFixed(2) + ')');

    var pt = [0.3, -0.2, 0.55];
    var sp = D.Scene.project(pt, vp, 800, 500);
    var r = D.Scene.ray(sp.x, sp.y, 800, 500);
    var wv = [pt[0] - r.o[0], pt[1] - r.o[1], pt[2] - r.o[2]];
    var tt = wv[0] * r.d[0] + wv[1] * r.d[1] + wv[2] * r.d[2];
    var dist = Math.sqrt(
      Math.pow(wv[0] - tt * r.d[0], 2) +
      Math.pow(wv[1] - tt * r.d[1], 2) +
      Math.pow(wv[2] - tt * r.d[2], 2));
    ok('ray.roundtrip', dist < 1e-6, 'dist=' + dist.toExponential(2));

    /* 5 · every family compiles ----------------------------------------- */
    var badFam = [];
    for (i = 0; i < D.families.length; i++) {
      var fam = D.families[i];
      if (!fam.expr) continue;
      var cc = D.math.compile(fam.expr);
      if (!cc.ok) badFam.push(fam.id + ': ' + cc.error);
    }
    ok('families.compile', badFam.length === 0, badFam.join('; ') || 'all ok');

    /* 6 · the live scene ------------------------------------------------ */
    var geom = D.UI && D.UI.geom ? D.UI.geom() : null;
    ok('scene.built', !!geom, geom ? 'passes=' + geom.passes.length : 'no geometry');
    if (geom) {
      var nan = 0, total = 0;
      for (i = 0; i < geom.passes.length; i++) {
        var ps = geom.passes[i];
        var arr = ps.kind === 'surface' ? ps.positions : ps.data;
        for (k = 0; k < arr.length; k += 97) { total++; if (!isFinite(arr[k])) nan++; }
      }
      ok('scene.finite', nan === 0, 'checked=' + total + ' nan=' + nan);

      var st = D.UI.state();
      var th = (st.theta * Math.PI) / 180;
      var Du = geom.stats.fx * Math.cos(th) + geom.stats.fy * Math.sin(th);
      ok('scene.directional', Math.abs(Du - geom.stats.Du) < 1e-9,
        'Du=' + geom.stats.Du.toFixed(6));
      ok('scene.levels',
        geom.field.raw.length === (geom.field.n + 1) * (geom.field.n + 1),
        'n=' + geom.field.n);
      ok('scene.order', geom.passes[0].kind === 'surface',
        'first pass = ' + geom.passes[0].kind);
    }

    /* 7 · backend -------------------------------------------------------- */
    ok('backend', D.Stage.backend === 'webgpu' || D.Stage.backend === 'webgl2',
      D.Stage.backend || 'none');
    if (D.Stage.diag) {
      var dg = D.Stage.diag();
      ok('stage.viewport', dg.w > 100 && dg.h > 100 && dg.draws > 0,
        'css=' + dg.w + 'x' + dg.h + ' bmp=' + dg.canvas + ' dpr=' + dg.dpr +
        ' draws=' + dg.draws + ' passes=' + dg.passes + ' paper=' + dg.paper);
    }

    /* report ------------------------------------------------------------- */
    var pre = document.getElementById('selftest');
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'selftest';
      pre.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;' +
        'max-height:46vh;overflow:auto;margin:0;padding:8px 10px;' +
        'background:rgba(243,236,220,.97);border:1px solid #241f1a;' +
        'font:11px Consolas,monospace;color:#241f1a;white-space:pre';
      document.body.appendChild(pre);
    }
    pre.textContent = 'SELFTEST ' + (fails === 0 ? 'PASS' : 'FAIL (' + fails + ')') +
      '  engine=' + (D.Stage.backendLabel ? D.Stage.backendLabel() : '?') + '\n' +
      lines.join('\n');
    document.documentElement.setAttribute('data-selftest', fails === 0 ? 'pass' : 'fail');
    document.title = 'SELFTEST ' + (fails === 0 ? 'PASS' : 'FAIL') + ' · ' + document.title;
    return fails === 0;
  }

  D.SelfTest = { run: run };
})(window.DC);

