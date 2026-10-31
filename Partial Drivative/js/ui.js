/* ==========================================================================
   ui.js — state, instruments, readouts, chapters, share links, export
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var T = function (zh, en) { return D.i18n.t(zh, en); };
  var fmt = function (v, d) { return D.math.fmt(v, d); };

  var LAYERS = [
    { k: 'surface', zh: '曲面', en: 'Surface' },
    { k: 'floor', zh: '底面网格', en: 'Ruled floor' },
    { k: 'grid', zh: '曲面网线', en: 'Surface net' },
    { k: 'cutPlanes', zh: '切割平面', en: 'Cutting planes' },
    { k: 'sections', zh: '截面曲线', en: 'Section curves' },
    { k: 'tangents', zh: '切线 · 斜率三角', en: 'Tangent · slope triangle' },
    { k: 'contours', zh: '等高线与等值线', en: 'Contours & level curve' },
    { k: 'gradient', zh: '梯度箭头', en: 'Gradient arrow' },
    { k: 'dirPlane', zh: '方向平面', en: 'Direction plane' },
    { k: 'tangentPlane', zh: '切平面与缝隙', en: 'Tangent plane & gap' }
  ];

  var COLORS = [
    { k: 'surfaceLit', zh: '曲面·受光', en: 'Surface · lit', def: '#d8ab6d' },
    { k: 'surfaceDark', zh: '曲面·背光', en: 'Surface · shade', def: '#7d5a39' },
    { k: 'cx', zh: '截面 Cx', en: 'Section Cx', def: '#2e4a5c' },
    { k: 'cy', zh: '截面 Cy', en: 'Section Cy', def: '#8a3b2e' },
    { k: 'tangent', zh: '切线', en: 'Tangent', def: '#241f1a' },
    { k: 'gradient', zh: '梯度', en: 'Gradient', def: '#8a3b2e' },
    { k: 'dir', zh: '方向 u', en: 'Direction u', def: '#4f5d3a' },
    { k: 'contour', zh: '等高线', en: 'Contours', def: '#4f5d3a' },
    { k: 'plane', zh: '平面', en: 'Planes', def: '#2e4a5c' },
    { k: 'grid', zh: '网格', en: 'Grid', def: '#8b7c68' },
    { k: 'axis', zh: '坐标轴', en: 'Axes', def: '#4a4038' },
    { k: 'pin', zh: '取点图钉', en: 'The pin', def: '#8a3b2e' }
  ];

  var PRESETS = {
    copper: {
      surfaceLit: '#d8ab6d', surfaceDark: '#7d5a39', cx: '#2e4a5c', cy: '#8a3b2e',
      tangent: '#241f1a', gradient: '#8a3b2e', dir: '#4f5d3a', contour: '#4f5d3a',
      plane: '#2e4a5c', grid: '#8b7c68', axis: '#4a4038', pin: '#8a3b2e'
    },
    prussian: {
      surfaceLit: '#cbdae2', surfaceDark: '#41606f', cx: '#9a6a2f', cy: '#8a3b2e',
      tangent: '#1d2b33', gradient: '#8a3b2e', dir: '#4f5d3a', contour: '#3b5c6b',
      plane: '#1d2b33', grid: '#7c8a92', axis: '#2e4a5c', pin: '#8a3b2e'
    },
    vermilion: {
      surfaceLit: '#eccfae', surfaceDark: '#95503f', cx: '#2e4a5c', cy: '#241f1a',
      tangent: '#241f1a', gradient: '#2e4a5c', dir: '#4f5d3a', contour: '#6b4a2a',
      plane: '#2e4a5c', grid: '#a08a6b', axis: '#4a4038', pin: '#241f1a'
    }
  };

  var CHAPTER_LAYERS = {
    1: { surface: 1, floor: 1, grid: 1, cutPlanes: 1, sections: 1, tangents: 1, contours: 0, gradient: 0, dirPlane: 0, tangentPlane: 0 },
    2: { surface: 1, floor: 1, grid: 1, cutPlanes: 0, sections: 0, tangents: 0, contours: 1, gradient: 1, dirPlane: 0, tangentPlane: 0 },
    3: { surface: 1, floor: 1, grid: 1, cutPlanes: 0, sections: 1, tangents: 1, contours: 0, gradient: 1, dirPlane: 1, tangentPlane: 0 },
    4: { surface: 1, floor: 1, grid: 1, cutPlanes: 0, sections: 0, tangents: 0, contours: 0, gradient: 0, dirPlane: 0, tangentPlane: 1 }
  };

  var FIG = {
    1: {
      zh: '截面曲线与切线', en: 'Section curves and their tangents',
      note: {
        zh: '上图：固定 y = y₀ 的剖面；下图：固定 x = x₀ 的剖面。虚线为切线，小三角为增量之比。',
        en: 'Above: the slice y = y₀. Below: the slice x = x₀. The dashed line is the tangent; the little triangle is rise over run.'
      }
    },
    2: {
      zh: '等高线与梯度', en: 'Contours and the gradient',
      note: {
        zh: '细线为等值线，粗线为过 P 的那一条；箭头为 ∇f，恒与粗线垂直。',
        en: 'Hairlines are level sets, the bold one passes through P; the arrow is ∇f, at right angles to it.'
      }
    },
    3: {
      zh: '方向导数的极坐标图', en: 'The directional derivative in polar form',
      note: {
        zh: '半径 r = fx·cosθ + fy·sinθ 画成极坐标，恰好是一个过原点的圆。',
        en: 'Plotted in polar coordinates, r = fx·cosθ + fy·sinθ is a circle through the origin.'
      }
    },
    4: {
      zh: '切平面与真实曲面之差', en: 'Tangent line against the true section',
      note: {
        zh: '沿 (Δx, Δy) 方向切开：直线为切平面给出的 dz，曲线为真实曲面。',
        en: 'Cut along (Δx, Δy): the straight line is dz, the curve is the surface.'
      }
    }
  };

  var state = null, geom = null;
  var sway = { on: false, spin: false, t: 0, acc: 0, base: 0 };

  function defaults() {
    var fam = D.familyById('saddle');
    var cols = {};
    for (var i = 0; i < COLORS.length; i++) cols[COLORS[i].k] = COLORS[i].def;
    return {
      chapter: 1, fam: fam.id, params: D.defaultParams(fam),
      customExpr: 'p*x^2 - q*y^2',
      L: 2, zScale: 0.55, quality: 64,
      x0: 0.6, y0: -0.4, theta: 35, dx: 0.55, dy: 0.42,
      hatch: 0.40, paper: '#f3ecdc',
      colors: cols,
      layers: JSON.parse(JSON.stringify(CHAPTER_LAYERS[1]))
    };
  }

  function exprOf() {
    var fam = D.familyById(state.fam);
    return fam.expr || state.customExpr;
  }

  /* ---- persistence ------------------------------------------------------ */
  function subset() {
    return {
      c: state.chapter, f: state.fam, p: state.params, e: state.customExpr,
      L: state.L, z: state.zScale, m: state.quality,
      x: +(+state.x0).toFixed(3), y: +(+state.y0).toFixed(3),
      t: Math.round(state.theta),
      dx: +(+state.dx).toFixed(3), dy: +(+state.dy).toFixed(3),
      h: state.hatch, k: state.colors, l: state.layers
    };
  }
  function applySubset(o) {
    if (!o) return;
    if (o.c >= 1 && o.c <= 4) state.chapter = +o.c;
    if (o.f && D.familyById(o.f).id === o.f) state.fam = o.f;
    if (o.p) for (var pk in o.p) state.params[pk] = +o.p[pk];
    if (typeof o.e === 'string') state.customExpr = o.e;
    if (+o.L > 0) state.L = +o.L;
    if (+o.z > 0) state.zScale = +o.z;
    if (+o.m >= 32) state.quality = +o.m;
    if (isFinite(o.x)) state.x0 = +o.x;
    if (isFinite(o.y)) state.y0 = +o.y;
    if (isFinite(o.t)) state.theta = +o.t;
    if (isFinite(o.dx)) state.dx = +o.dx;
    if (isFinite(o.dy)) state.dy = +o.dy;
    if (isFinite(o.h)) state.hatch = +o.h;
    if (o.k) for (var k in o.k) { if (state.colors[k] !== undefined) state.colors[k] = o.k[k]; }
    if (o.l) for (var j in o.l) { if (state.layers[j] !== undefined) state.layers[j] = !!o.l[j]; }
  }
  function save() {
    var o = subset();
    try { localStorage.setItem(KEY_STATE, JSON.stringify(o)); } catch (e) {}
    var h = '#s=' + encodeURIComponent(JSON.stringify(o));
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (e2) { location.hash = h; }
    }
  }
  var saveTimer = 0;
  function saveLater() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 350);
  }
  function load() {
    var fromHash = null, fromLS = null;
    try {
      var m = /[#&]s=([^&]+)/.exec(location.hash || '');
      if (m) fromHash = JSON.parse(decodeURIComponent(m[1]));
    } catch (e) { fromHash = null; }
    try {
      var raw = localStorage.getItem(KEY_STATE);
      if (raw) fromLS = JSON.parse(raw);
    } catch (e2) { fromLS = null; }
    applySubset(fromLS);
    applySubset(fromHash);
  }

  /* ---- the one place that rebuilds everything -------------------------- */
  function run() {
    var fam = D.familyById(state.fam);
    var errEl = document.getElementById('customErr');
    D.model = D.math.makeModel(exprOf(), state.params);
    if (errEl) {
      if (!D.model.ok && (fam.expr === null)) {
        errEl.textContent = T('表达式有误：', 'Expression error: ') + D.model.error;
        document.getElementById('customExpr').classList.add('is-bad');
      } else {
        errEl.textContent = '';
        var inp = document.getElementById('customExpr');
        if (inp) inp.classList.remove('is-bad');
      }
    }
    geom = D.Stage.refresh ? D.Stage.refresh() : null;
    if (geom) {
      D.Charts.draw(document.getElementById('fig'), state, geom);
      writeReadouts(geom);
      writeCaption();
    }
    saveLater();
  }

  /* ---- readouts --------------------------------------------------------- */
  function roRow(k, v, accent) {
    return '<div class="ro' + (accent ? ' ro--accent' : '') + '"><span class="ro__k">' + k +
      '</span><span class="ro__dots"></span><span class="ro__v">' + v + '</span></div>';
  }
  function writeReadouts(g) {
    var s = g.stats, el = document.getElementById('readouts'), h = '';
    h += '<div class="readouts__head">' + T('读数 / READINGS', 'READINGS / 读数') + '</div>';
    h += roRow('f(x₀, y₀)', fmt(s.f0, 3));
    h += roRow('∂f/∂x', fmt(s.fx, 3));
    h += roRow('∂f/∂y', fmt(s.fy, 3));
    if (state.chapter === 2) {
      h += roRow('|∇f|', fmt(s.grad, 3), true);
      h += roRow('arg ∇f', fmt((Math.atan2(s.fy, s.fx) * 180) / Math.PI, 1) + '°');
    }
    if (state.chapter === 3) {
      h += roRow('θ', fmt(state.theta, 0) + '°');
      h += roRow('u', '(' + fmt(Math.cos(s.theta), 2) + ', ' + fmt(Math.sin(s.theta), 2) + ')');
      h += roRow('D<sub>u</sub>f', fmt(s.Du, 3), true);
    }
    if (state.chapter === 4 && s.hand) {
      var hd = s.hand;
      h += roRow('Δx , Δy', '(' + fmt(state.dx, 2) + ', ' + fmt(state.dy, 2) + ')');
      h += roRow('d<i>z</i>', fmt(hd.zp - s.pz, 4), true);
      h += roRow('Δ<i>z</i>', fmt(hd.zh - s.pz, 4), true);
      h += roRow('Δ<i>z</i> − d<i>z</i>', fmt(hd.zh - hd.zp, 5));
      el.innerHTML = h;
      return;
    }
    if (state.chapter === 1) {
      h += roRow('|∇f|', fmt(s.grad, 3));
    }
    el.innerHTML = h;
  }

  /* ---- the instrument panel -------------------------------------------- */
  function buildPanel() {
    var fam = D.familyById(state.fam), i, p;
    var sel = document.getElementById('famSelect'), h = '';
    for (i = 0; i < D.families.length; i++) {
      var f = D.families[i];
      h += '<option value="' + f.id + '"' + (f.id === state.fam ? ' selected' : '') + '>' +
        f.zh + ' / ' + f.en + '</option>';
    }
    sel.innerHTML = h;

    var ph = '';
    for (i = 0; i < fam.params.length; i++) {
      p = fam.params[i];
      var v = state.params[p.k];
      if (v === undefined || !isFinite(v)) { v = p.def; state.params[p.k] = v; }
      ph += '<div class="field field--slider">' +
        '<span class="field__label"><i>' + p.k + '</i> · ' + T(p.zh, p.en) + '</span>' +
        '<output class="field__value" id="out_' + p.k + '">' + (+v).toFixed(2) + '</output>' +
        '<input class="range" type="range" data-param="' + p.k + '" min="' + p.min +
        '" max="' + p.max + '" step="' + p.step + '" value="' + v + '"></div>';
    }
    document.getElementById('paramSliders').innerHTML = ph;
    document.getElementById('fieldCustom').hidden = (fam.expr !== null);
    document.getElementById('customExpr').value = state.customExpr;
    document.getElementById('famNote').textContent = T(fam.note.zh, fam.note.en);

    h = '';
    for (i = 0; i < LAYERS.length; i++) {
      var ly = LAYERS[i];
      h += '<label class="check"><input type="checkbox" data-layer="' + ly.k + '"' +
        (state.layers[ly.k] ? ' checked' : '') + '>' +
        '<span class="check__box" aria-hidden="true"></span>' +
        '<span class="check__text">' + T(ly.zh, ly.en) + '</span></label>';
    }
    document.getElementById('layerToggles').innerHTML = h;

    h = '';
    for (i = 0; i < COLORS.length; i++) {
      var c = COLORS[i];
      h += '<label class="colorfield"><input type="color" data-color="' + c.k +
        '" value="' + state.colors[c.k] + '"><span>' + T(c.zh, c.en) + '</span></label>';
    }
    document.getElementById('colorFields').innerHTML = h;

    document.getElementById('rangeL').value = state.L;
    document.getElementById('outL').textContent = (+state.L).toFixed(1);
    document.getElementById('rangeZ').value = state.zScale;
    document.getElementById('outZ').textContent = (+state.zScale).toFixed(2);
    document.getElementById('meshSelect').value = String(state.quality);
    document.getElementById('rangeHatch').value = state.hatch;
    document.getElementById('outHatch').textContent = (+state.hatch).toFixed(2);
  }

  function syncLayerChecks() {
    var boxes = document.querySelectorAll('#layerToggles input[data-layer]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = !!state.layers[boxes[i].getAttribute('data-layer')];
    }
  }

  /* ---- chapters --------------------------------------------------------- */
  function paintChapter() {
    var tabs = document.querySelectorAll('.plate-tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = +tabs[i].getAttribute('data-chapter') === state.chapter;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    var arts = document.querySelectorAll('[data-chapter-content]');
    for (var j = 0; j < arts.length; j++) {
      arts[j].hidden = +arts[j].getAttribute('data-chapter-content') !== state.chapter;
    }
  }
  function setChapter(n, keepLayers) {
    if (n < 1 || n > 4) return;
    state.chapter = n;
    if (!keepLayers) state.layers = JSON.parse(JSON.stringify(CHAPTER_LAYERS[n]));
    paintChapter();
    syncLayerChecks();
    run();
  }

  function writeCaption() {
    var f = FIG[state.chapter];
    document.getElementById('figNum').textContent = 'FIG. ' + state.chapter + '.';
    document.getElementById('figTitle').textContent = T(f.zh, f.en);
    document.getElementById('figNote').textContent = T(f.note.zh, f.note.en);
    var foot = document.getElementById('colophonState');
    if (foot) {
      foot.textContent = T('取点 ', 'point ') + '(' + fmt(state.x0, 2) + ', ' + fmt(state.y0, 2) + ')' +
        ' · ' + T('定义域 ±', 'domain ±') + fmt(state.L, 1) +
        ' · ' + T('网格 ', 'mesh ') + state.quality + '²';
    }
  }

  /* ---- export a printable plate ----------------------------------------- */
  function exportPlate() {
    var btn = document.getElementById('exportBtn');
    var old = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = T('正在制版…', 'Engraving…');
    Promise.resolve(D.Stage.capture()).then(function (img) {
      try {
        var W = 1240, pad = 46, titleH = 104, footH = 64, rowH = 25, i;
        var ros = document.querySelectorAll('#readouts .ro'), rows = [];
        for (i = 0; i < ros.length; i++) {
          rows.push([ros[i].querySelector('.ro__k').textContent,
                     ros[i].querySelector('.ro__v').textContent]);
        }
        var imgW = W - pad * 2;
        var imgH = img ? Math.round(imgW * img.height / img.width) : 0;
        var roH = 34 + rows.length * rowH;
        var H = pad + titleH + imgH + (img ? 26 : 0) + roH + footH;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var x = c.getContext('2d');
        var serif = '"Bodoni MT","Goudy Old Style",Georgia,"Times New Roman","Songti SC","SimSun",serif';
        x.fillStyle = state.paper || '#f3ecdc';
        x.fillRect(0, 0, W, H);
        x.strokeStyle = '#241f1a';
        x.lineWidth = 2;
        x.beginPath(); x.moveTo(pad, pad - 18); x.lineTo(W - pad, pad - 18); x.stroke();
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(pad, pad - 12); x.lineTo(W - pad, pad - 12); x.stroke();

        x.fillStyle = '#241f1a';
        x.font = 'italic 15px ' + serif;
        x.fillText('偏导数图解 · A Pictorial Treatise on Partial Derivatives', pad, pad + 24);
        x.font = '600 30px ' + serif;
        var zhT = ['偏导数', '梯度', '方向导数', '切平面与全微分'][state.chapter - 1];
        var enT = ['Partial Derivatives', 'The Gradient', 'Directional Derivative', 'Tangent Plane & Total Differential'][state.chapter - 1];
        x.fillText('PLATE ' + ['I', 'II', 'III', 'IV'][state.chapter - 1] + '.  ' + zhT, pad, pad + 62);
        x.font = '13px ' + serif;
        x.fillStyle = '#4a4038';
        x.fillText(enT + '   —   f(x, y) = ' + exprOf(), pad, pad + 84);

        if (img) {
          var tmp = document.createElement('canvas');
          tmp.width = img.width; tmp.height = img.height;
          var tc = tmp.getContext('2d');
          var idata = tc.createImageData(img.width, img.height);
          idata.data.set(img.data);
          tc.putImageData(idata, 0, 0);
          x.drawImage(tmp, pad, pad + titleH - 16, imgW, imgH);
        }

        var y0 = pad + titleH + imgH + 26;
        x.strokeStyle = '#241f1a';
        x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(pad, y0 - 10); x.lineTo(W - pad, y0 - 10); x.stroke();
        x.font = '13px ' + serif;
        for (i = 0; i < rows.length; i++) {
          var yy = y0 + 8 + i * rowH;
          x.fillStyle = '#241f1a';
          x.fillText(rows[i][0], pad, yy);
          x.strokeStyle = '#c3b393';
          x.lineWidth = 1;
          x.setLineDash([1, 3]);
          var lx = pad + x.measureText(rows[i][0]).width + 10;
          x.beginPath(); x.moveTo(lx, yy - 4); x.lineTo(W - pad - 80, yy - 4); x.stroke();
          x.setLineDash([]);
          x.fillStyle = '#241f1a';
          x.font = '600 13px ' + serif;
          x.textAlign = 'right';
          x.fillText(rows[i][1], W - pad, yy);
          x.textAlign = 'left';
          x.font = '13px ' + serif;
        }
        x.strokeStyle = '#241f1a';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(pad, y0 + rows.length * rowH + 4);
        x.lineTo(W - pad, y0 + rows.length * rowH + 4);
        x.stroke();

        x.font = 'italic 11px ' + serif;
        x.fillStyle = '#8b7c68';
        x.fillText(T(FIG[state.chapter].note.zh, FIG[state.chapter].note.en), pad, H - pad + 16);
        x.textAlign = 'right';
        x.fillText('(' + fmt(state.x0, 2) + ', ' + fmt(state.y0, 2) + ') · ' +
          T('定义域 ±', 'domain ±') + fmt(state.L, 1) + ' · ' + D.Stage.backendLabel(),
          W - pad, H - pad + 16);
        x.textAlign = 'left';

        var name = 'partial-derivatives-plate-' + state.chapter + '.png';
        c.toBlob(function (blob) {
          if (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
          }
          btn.innerHTML = old;
          btn.disabled = false;
        }, 'image/png');
      } catch (err) {
        if (window.console) console.error(err);
        btn.innerHTML = old;
        btn.disabled = false;
      }
    });
  }

  /* ---- animation -------------------------------------------------------- */
  function onFrame(dt) {
    var moved = false;
    if (sway.spin) { D.Scene.cam.az += dt * 0.16; moved = true; }
    if (sway.on) {
      sway.acc += dt;
      if (sway.acc > 0.055) {
        sway.acc = 0;
        sway.t += 0.055;
        var fam = D.familyById(state.fam), p = fam.params[0];
        var mid = (p.min + p.max) / 2, amp = (p.max - p.min) * 0.34;
        var val = mid + amp * Math.sin(sway.t * 0.85);
        state.params[p.k] = Math.round(val / p.step) * p.step;
        var out = document.getElementById('out_' + p.k);
        if (out) out.textContent = (+state.params[p.k]).toFixed(2);
        var sl = document.querySelector('input[data-param="' + p.k + '"]');
        if (sl) sl.value = state.params[p.k];
        run();
      }
      moved = true;
    }
    return moved;
  }

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    for (var k in p) { if (p.hasOwnProperty(k)) state.colors[k] = p[k]; }
    buildPanel();
    run();
  }

  function resetView() {
    if (D.Stage.resetView) { D.Stage.resetView(); return; }
    D.Scene.resetCam(state.L, geom ? geom.zMin : -1, geom ? geom.zMax : 1);
    D.Stage.redraw();
  }

  function hideHint() {
    var h = document.getElementById('hint');
    if (h) h.classList.add('is-gone');
  }
  function showHint() {
    var h = document.getElementById('hint');
    if (!h) return;
    h.classList.remove('is-gone');
    clearTimeout(showHint._t);
    showHint._t = setTimeout(hideHint, 7000);
  }

  /* ---- wiring ----------------------------------------------------------- */
  function wire() {
    document.getElementById('plates').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.plate-tab') : null;
      if (b) setChapter(+b.getAttribute('data-chapter'));
    });

    document.getElementById('paramSliders').addEventListener('input', function (ev) {
      var k = ev.target.getAttribute('data-param');
      if (!k) return;
      state.params[k] = +ev.target.value;
      var out = document.getElementById('out_' + k);
      if (out) out.textContent = (+ev.target.value).toFixed(2);
      run();
    });
    document.getElementById('layerToggles').addEventListener('change', function (ev) {
      var k = ev.target.getAttribute('data-layer');
      if (!k) return;
      state.layers[k] = ev.target.checked;
      run();
    });
    document.getElementById('colorFields').addEventListener('input', function (ev) {
      var k = ev.target.getAttribute('data-color');
      if (!k) return;
      state.colors[k] = ev.target.value;
      run();
    });
    var presets = document.querySelectorAll('.inkbtn');
    for (var i = 0; i < presets.length; i++) {
      presets[i].addEventListener('click', function () {
        applyPreset(this.getAttribute('data-preset'));
      });
    }

    document.getElementById('famSelect').addEventListener('change', function (ev) {
      state.fam = ev.target.value;
      state.params = D.defaultParams(D.familyById(state.fam));
      buildPanel();
      run();
      D.Stage.fitView();
    });
    document.getElementById('customExpr').addEventListener('input', function (ev) {
      state.customExpr = ev.target.value;
      run();
    });

    document.getElementById('rangeL').addEventListener('input', function (ev) {
      var nl = +ev.target.value, oldL = state.L;
      if (!(nl > 0)) return;
      state.L = nl;
      document.getElementById('outL').textContent = nl.toFixed(1);
      state.x0 = Math.max(-nl, Math.min(nl, state.x0));
      state.y0 = Math.max(-nl, Math.min(nl, state.y0));
      run();
      D.Stage.fitView();
    });
    document.getElementById('rangeZ').addEventListener('input', function (ev) {
      state.zScale = +ev.target.value;
      document.getElementById('outZ').textContent = (+ev.target.value).toFixed(2);
      run();
      D.Stage.fitView();
    });
    document.getElementById('meshSelect').addEventListener('change', function (ev) {
      state.quality = +ev.target.value;
      run();
    });
    document.getElementById('rangeHatch').addEventListener('input', function (ev) {
      state.hatch = +ev.target.value;
      document.getElementById('outHatch').textContent = (+ev.target.value).toFixed(2);
      run();
    });
    document.getElementById('swayChk').addEventListener('change', function (ev) {
      sway.on = ev.target.checked;
      sway.t = 0; sway.acc = 0;
    });
    document.getElementById('spinChk').addEventListener('change', function (ev) {
      sway.spin = ev.target.checked;
    });

    document.getElementById('camResetBtn').addEventListener('click', resetView);
    document.getElementById('resetBtn').addEventListener('click', function () {
      var lang = D.i18n.lang;
      state = defaults();
      D.i18n.set(lang);
      buildPanel();
      paintChapter();
      run();
      resetView();
    });
    document.getElementById('helpBtn').addEventListener('click', showHint);
    document.getElementById('langBtn').addEventListener('click', function () { D.i18n.toggle(); });
    document.getElementById('exportBtn').addEventListener('click', exportPlate);

    document.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key >= '1' && ev.key <= '4') setChapter(+ev.key);
      else if (ev.key === 'r' || ev.key === 'R') resetView();
      else if (ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        var cb = document.getElementById('swayChk');
        cb.checked = !cb.checked;
        sway.on = cb.checked; sway.t = 0; sway.acc = 0;
      } else if (ev.key === 'l' || ev.key === 'L') D.i18n.toggle();
    });

    setTimeout(hideHint, 9000);
  }

  /* ---- boot ------------------------------------------------------------- */
  if (/[?&]bare=1/.test(location.search)) window.__bare = true;
  if (/[?&]nowgpu=1/.test(location.search)) window.__nowgpu = true;
  if (/[?&]plain=1/.test(location.search)) document.body.classList.add('no-grain');
  if (/[?&]always=1/.test(location.search)) window.__alwaysdraw = true;
  var qSolo = /[?&]solo=(surface|lines|poly)/.exec(location.search);
  if (qSolo) window.__solo = qSolo[1];
  var UI = {
    state: function () { return state; },
    geom: function () { return geom; },
    run: run,
    setChapter: setChapter,
    exportPlate: exportPlate,
    init: async function () {
      state = defaults();
      var qCh = /[?&]ch=([1-4])/.exec(location.search);
      if (qCh) {
        /* deterministic chapter view (also used for the screenshot review) */
        state.chapter = +qCh[1];
        state.layers = JSON.parse(JSON.stringify(CHAPTER_LAYERS[state.chapter]));
      } else {
        load();
      }
      var qLang = /[?&]lang=(zh|en)/.exec(location.search);
      if (qLang) D.i18n.set(qLang[1]);
      var qX = /[?&]x=(-?[0-9.]+)/.exec(location.search);
      var qY = /[?&]y=(-?[0-9.]+)/.exec(location.search);
      if (qX) state.x0 = +qX[1];
      if (qY) state.y0 = +qY[1];
      D.i18n.paint();
      buildPanel();
      paintChapter();
      /* honour the OS "reduce motion" setting: no swaying, no auto-orbit */
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sway.on = false; sway.spin = false;
        var scb = document.getElementById('swayChk'), pcb = document.getElementById('spinChk');
        if (scb) scb.checked = false;
        if (pcb) pcb.checked = false;
      }
      var ok = null;
      try {
        ok = await D.Stage.init(state, {
          onFrame: onFrame,
          onPoint: run,
          onHandle: run,
          onHintHide: hideHint
        });
      } catch (err) {
        if (window.console) console.error(err);
      }
      var ef = document.getElementById('engineFoot');
      if (ef) ef.textContent = ok ? D.Stage.backendLabel() : T('未启用 GPU 后端', 'no GPU backend');
      run();
      if (D.Stage.resetView) D.Stage.resetView();
      else if (geom) D.Scene.resetCam(state.L, geom.zMin, geom.zMax);
      D.Stage.redraw();
      wire();
      D.i18n.onChange(function () { buildPanel(); paintChapter(); run(); });
      if (D.SelfTest && /[?&]selftest=1/.test(location.search)) {
        setTimeout(function () { D.SelfTest.run(); }, 80);
      }
    }
  };

  D.UI = UI;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { UI.init(); });
  } else {
    UI.init();
  }
})(window.DC);





