/* ==========================================================================
   mathcore.js — 表达式编译、数值偏导、等高线 / expression compiler,
   numeric partials, marching squares.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  /* ---- function table --------------------------------------------------- */
  var FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
    sinh: 1, cosh: 1, tanh: 1, exp: 1, sqrt: 1, abs: 1, sign: 1,
    floor: 1, ceil: 1, round: 1,
    ln: 1, log: 1, log2: 1,
    min: 2, max: 2, pow: 2, atan2: 2
  };
  var JSMAP = {
    ln: 'Math.log', log: 'Math.log10', log2: 'Math.log2',
    sign: 'Math.sign', min: 'Math.min', max: 'Math.max',
    pow: 'Math.pow', atan2: 'Math.atan2'
  };
  var VARS = { x: 1, y: 1, a: 1, b: 1, c: 1, p: 1, q: 1, r: 1, t: 1 };
  var ARGS = ['x', 'y', 'a', 'b', 'c', 'p', 'q', 'r', 't'];

  /**
   * Compile a math expression into a fast JS closure.
   * Only whitelisted identifiers may appear, so the emitted source is built
   * entirely from numbers, `Math.*` calls and the argument names.
   */
  function compile(src) {
    var s = String(src == null ? '' : src).replace(/[−–]/g, '-')
      .replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi');
    var i = 0, n = s.length, depth = 0;

    function ws() { while (i < n && /\s/.test(s.charAt(i))) i++; }
    function peek() { ws(); return s.charAt(i); }
    function fail(msg) { throw new Error(msg); }

    function atom() {
      ws();
      if (i >= n) fail('unexpected end of expression');
      var c = s.charAt(i);
      var num = /^[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/.exec(s.slice(i));
      if (num && num[0]) { i += num[0].length; return '(' + num[0] + ')'; }
      if (c === '(') { i++; var v = expr(); if (peek() !== ')') fail('missing ")"'); i++; return '(' + v + ')'; }
      var id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
      if (id && id[0]) {
        i += id[0].length;
        var name = id[0].toLowerCase();
        if (name === 'pi') return 'Math.PI';
        if (name === 'e') return 'Math.E';
        var arity = FUNCS[name];
        if (arity) {
          if (peek() !== '(') fail(name + ' needs ( )');
          i++;
          var args = [expr()];
          while (peek() === ',') { i++; args.push(expr()); }
          if (peek() !== ')') fail('missing ")" after ' + name);
          i++;
          if (args.length !== arity) fail(name + ' takes ' + arity + ' argument(s)');
          return (JSMAP[name] || ('Math.' + name)) + '(' + args.join(',') + ')';
        }
        if (!VARS[name]) fail('unknown symbol "' + id[0] + '"');
        return name;
      }
      fail('unexpected character "' + c + '"');
    }

    function power() {
      var base = atom();
      if (peek() === '^') { i++; return 'Math.pow(' + base + ',' + unary() + ')'; }
      return base;
    }
    function unary() {
      var c = peek();
      if (c === '-') { i++; return '(-' + unary() + ')'; }
      if (c === '+') { i++; return unary(); }
      return power();
    }
    function term() {
      var v = unary();
      for (;;) {
        var c = peek();
        if (c === '*') { i++; v = '(' + v + '*' + unary() + ')'; }
        else if (c === '/') { i++; v = '(' + v + '/' + unary() + ')'; }
        else if (c === '%') { i++; v = '(' + v + '%' + unary() + ')'; }
        else return v;
      }
    }
    function expr() {
      if (++depth > 64) fail('expression nested too deeply');
      var v = term();
      for (;;) {
        var c = peek();
        if (c === '+') { i++; v = '(' + v + '+' + term() + ')'; }
        else if (c === '-') { i++; v = '(' + v + '-' + term() + ')'; }
        else break;
      }
      depth--;
      return v;
    }

    if (!s.trim()) return { ok: false, error: 'empty expression' };
    var code;
    try {
      code = expr();
      ws();
      if (i < n) fail('trailing input at "' + s.slice(i, i + 8) + '"');
    } catch (err) {
      return { ok: false, error: err.message };
    }
    var fn;
    try {
      /* eslint-disable no-new-func */
      fn = new Function(ARGS.join(','), 'return (' + code + ');');
      /* eslint-enable no-new-func */
    } catch (err2) {
      return { ok: false, error: 'cannot compile' };
    }
    try { fn(0.31, -0.27, 1, 1, 1, 1, 1, 1, 0); }
    catch (err3) { return { ok: false, error: 'evaluation error' }; }
    return { ok: true, fn: fn, code: code };
  }

  /* ---- parameters ------------------------------------------------------- */
  function applyParams(params) {
    var o = { a: 0, b: 0, c: 0, p: 0, q: 0, r: 0 };
    if (params) for (var k in params) if (params.hasOwnProperty(k)) o[k] = +params[k] || 0;
    return o;
  }

  /** Build evaluators for f, f_x, f_y (central differences). */
  function makeModel(exprSource, params) {
    var c = compile(exprSource);
    if (!c.ok) return { ok: false, error: c.error, f: function () { return 0; } };
    var f = c.fn, P = applyParams(params);
    var ev = function (x, y) { return +f(x, y, P.a, P.b, P.c, P.p, P.q, P.r, 0); };
    return {
      ok: true,
      error: '',
      raw: exprSource,
      params: P,
      f: ev,
      fx: function (x, y) {
        var h = 1e-4 * (1 + Math.abs(x));
        return (ev(x + h, y) - ev(x - h, y)) / (2 * h);
      },
      fy: function (x, y) {
        var h = 1e-4 * (1 + Math.abs(y));
        return (ev(x, y + h) - ev(x, y - h)) / (2 * h);
      }
    };
  }

  /* ---- marching squares ------------------------------------------------- */
  /**
   * @param {Float32Array} g   values on an (n+1)x(n+1) lattice, row-major in j
   * @param {number} n         cells per side
   * @param {number} L         the domain is [-L, L]^2
   * @param {number} level     iso value
   * @returns {Array<number>}  flat [x1,y1,x2,y2, ...] segments, domain space
   */
  function contourSegments(g, n, L, level) {
    var out = [], w = n + 1, step = (2 * L) / n;
    function cx(i) { return -L + i * step; }
    function val(i, j) { return g[j * w + i]; }
    function lerp(va, vb, a, b) {
      var d = vb - va;
      var t = Math.abs(d) < 1e-12 ? 0.5 : (level - va) / d;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      return a + (b - a) * t;
    }
    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var v0 = val(i, j), v1 = val(i + 1, j), v2 = val(i + 1, j + 1), v3 = val(i, j + 1);
        if (!isFinite(v0) || !isFinite(v1) || !isFinite(v2) || !isFinite(v3)) continue;
        var k = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) |
                (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
        if (k === 0 || k === 15) continue;
        var x0 = cx(i), x1 = cx(i + 1), y0 = cx(j), y1 = cx(j + 1);
        var eB = [lerp(v0, v1, x0, x1), y0];
        var eR = [x1, lerp(v1, v2, y0, y1)];
        var eT = [lerp(v3, v2, x0, x1), y1];
        var eL = [x0, lerp(v0, v3, y0, y1)];
        var push = function (a, b) { out.push(a[0], a[1], b[0], b[1]); };
        switch (k) {
          case 1: push(eL, eB); break;
          case 2: push(eB, eR); break;
          case 3: push(eL, eR); break;
          case 4: push(eR, eT); break;
          case 5: {
            var m5 = (v0 + v1 + v2 + v3) / 4;
            if (m5 > level) { push(eL, eT); push(eB, eR); }
            else { push(eL, eB); push(eR, eT); }
            break;
          }
          case 6: push(eB, eT); break;
          case 7: push(eL, eT); break;
          case 8: push(eT, eL); break;
          case 9: push(eT, eB); break;
          case 10: {
            var m10 = (v0 + v1 + v2 + v3) / 4;
            if (m10 > level) { push(eL, eB); push(eR, eT); }
            else { push(eL, eT); push(eB, eR); }
            break;
          }
          case 11: push(eR, eT); break;
          case 12: push(eR, eL); break;
          case 13: push(eB, eR); break;
          case 14: push(eB, eL); break;
          default: break;
        }
      }
    }
    return out;
  }

  /* ---- formatting ------------------------------------------------------- */
  function fmt(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var d = digits == null ? 3 : digits;
    var s = v.toFixed(d);
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    return s;
  }
  function compact(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e4 || a < 1e-3)) {
      return v.toExponential(1).replace('e', '×10^');
    }
    return fmt(v, digits);
  }

  D.math = {
    compile: compile,
    makeModel: makeModel,
    contourSegments: contourSegments,
    fmt: fmt,
    compact: compact,
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); }
  };
})(window.DC);
