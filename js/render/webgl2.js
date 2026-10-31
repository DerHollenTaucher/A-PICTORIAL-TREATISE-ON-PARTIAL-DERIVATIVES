/* ==========================================================================
   render/webgl2.js — WebGL2 fallback backend
   Same three pipelines as the WebGPU path: toned surface with screen-space
   engraving rules, fat lines grown in the vertex shader, translucent plates.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var VS_SURFACE = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aPos; in vec3 aNrm;',
    'uniform mat4 uVP;',
    'out vec3 vN;',
    'void main(){ vN = aNrm; gl_Position = uVP * vec4(aPos, 1.0); }'
  ].join('\n');

  var FS_SURFACE = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vN;',
    'uniform vec3 uLit; uniform vec3 uDark; uniform vec3 uLight; uniform vec3 uInk;',
    'uniform float uHatch;',
    'out vec4 oColor;',
    'float rules(vec2 p, float ang, float spacing){',
    '  float s = (p.x * cos(ang) + p.y * sin(ang)) / spacing;',
    '  float f = fract(s);',
    '  float d = min(f, 1.0 - f) * spacing;',
    '  return 1.0 - smoothstep(0.30, 0.95, d);',
    '}',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  float d = max(dot(N, normalize(uLight)), 0.0);',
    '  float t = 0.16 + 0.84 * pow(d, 0.90);',
    '  vec3 col = mix(uDark, uLit, t);',
    '  float shade = 1.0 - t;',
    '  vec2 p = gl_FragCoord.xy;',
    '  float cov = 0.0;',
    '  cov += rules(p, -0.62, 6.5) * smoothstep(0.08, 0.52, shade);',
    '  cov += rules(p,  0.95, 6.5) * smoothstep(0.40, 0.84, shade);',
    '  cov += rules(p,  0.28, 4.5) * smoothstep(0.66, 1.00, shade);',
    '  cov = clamp(cov, 0.0, 1.0) * uHatch;',
    '  col = mix(col, mix(uInk, uDark, 0.22), cov * 0.72);',
    '  oColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var VS_LINE = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aA; in vec3 aB; in float aSide; in float aEnd;',
    'uniform mat4 uVP; uniform vec2 uViewport; uniform float uWidth;',
    'void main(){',
    '  vec4 ca = uVP * vec4(aA, 1.0);',
    '  vec4 cb = uVP * vec4(aB, 1.0);',
    '  float wa = max(ca.w, 1e-4), wb = max(cb.w, 1e-4);',
    '  vec2 sa = ca.xy / wa * 0.5 * uViewport;',
    '  vec2 sb = cb.xy / wb * 0.5 * uViewport;',
    '  vec2 dd = sb - sa;',
    '  float len = length(dd);',
    '  vec2 dir = len > 1e-4 ? dd / len : vec2(0.0, 1.0);',
    '  vec2 nrm = vec2(-dir.y, dir.x);',
    '  float w = max(uWidth, 1.0) * 0.5;',
    '  float ext = aEnd * 2.0 - 1.0;',
    '  vec2 base = mix(sa, sb, aEnd);',
    '  float wz = mix(wa, wb, aEnd);',
    '  vec2 p = base + nrm * aSide * w + dir * ext * w;',
    '  gl_Position = vec4(p / (0.5 * uViewport) * wz, mix(ca.z / wa, cb.z / wb, aEnd) * wz, wz);',
    '}'
  ].join('\n');

  var FS_LINE = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec3 uColor; uniform float uOpacity;',
    'out vec4 oColor;',
    'void main(){ oColor = vec4(uColor, uOpacity); }'
  ].join('\n');

  var VS_POLY = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aPos;',
    'uniform mat4 uVP;',
    'void main(){ gl_Position = uVP * vec4(aPos, 1.0); }'
  ].join('\n');

  var FS_POLY = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec3 uColor; uniform float uOpacity; uniform float uMode;',
    'out vec4 oColor;',
    'float rules(vec2 p, float ang, float spacing){',
    '  float s = (p.x * cos(ang) + p.y * sin(ang)) / spacing;',
    '  float f = fract(s);',
    '  float d = min(f, 1.0 - f) * spacing;',
    '  return 1.0 - smoothstep(0.30, 0.95, d);',
    '}',
    'void main(){',
    '  float a = uOpacity;',
    '  if (uMode > 0.5) {',
    '    a = clamp(uOpacity * (0.80 + 0.85 * rules(gl_FragCoord.xy, 0.78, 7.5)), 0.0, 1.0);',
    '  }',
    '  oColor = vec4(uColor, a);',
    '}'
  ].join('\n');

  function hexToRGB(hex, out) {
    var h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    out[0] = parseInt(h.slice(0, 2), 16) / 255;
    out[1] = parseInt(h.slice(2, 4), 16) / 255;
    out[2] = parseInt(h.slice(4, 6), 16) / 255;
    return out;
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader: ' + log);
    }
    return sh;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  D.hexToRGB = hexToRGB;

  D.createWebGL2 = function (canvas) {
    var gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;

    var progS, progL, progP, U;
    try {
      progS = program(gl, VS_SURFACE, FS_SURFACE);
      progL = program(gl, VS_LINE, FS_LINE);
      progP = program(gl, VS_POLY, FS_POLY);
    } catch (err) { return null; }
    U = {
      s: {
        vp: gl.getUniformLocation(progS, 'uVP'),
        lit: gl.getUniformLocation(progS, 'uLit'),
        dark: gl.getUniformLocation(progS, 'uDark'),
        light: gl.getUniformLocation(progS, 'uLight'),
        ink: gl.getUniformLocation(progS, 'uInk'),
        hatch: gl.getUniformLocation(progS, 'uHatch')
      },
      l: {
        vp: gl.getUniformLocation(progL, 'uVP'),
        vp2: gl.getUniformLocation(progL, 'uViewport'),
        width: gl.getUniformLocation(progL, 'uWidth'),
        color: gl.getUniformLocation(progL, 'uColor'),
        opacity: gl.getUniformLocation(progL, 'uOpacity')
      },
      p: {
        vp: gl.getUniformLocation(progP, 'uVP'),
        color: gl.getUniformLocation(progP, 'uColor'),
        opacity: gl.getUniformLocation(progP, 'uOpacity'),
        mode: gl.getUniformLocation(progP, 'uMode')
      }
    };

    var cache = {};   /* key -> {vao, vbo, ibo, cap, icap, kind} */
    var dpr = 1, cw = 1, ch = 1;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    function slot(key, kind) {
      var s = cache[key];
      if (!s || s.kind !== kind) {
        s = { kind: kind, vao: gl.createVertexArray(), vbo: gl.createBuffer(), cap: 0, icap: 0 };
        if (kind === 'surface') s.ibo = gl.createBuffer();
        cache[key] = s;
      }
      return s;
    }
    function upload(s, data) {
      gl.bindBuffer(gl.ARRAY_BUFFER, s.vbo);
      if (data.byteLength > s.cap) {
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        s.cap = data.byteLength;
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      }
    }

    function drawSurface(ps, frame) {
      var s = slot(ps.key, 'surface');
      gl.useProgram(progS);
      gl.uniformMatrix4fv(U.s.vp, false, frame.vp);
      gl.uniform3fv(U.s.lit, hexToRGB(ps.color, [0, 0, 0]));
      gl.uniform3fv(U.s.dark, hexToRGB(ps.color2, [0, 0, 0]));
      gl.uniform3fv(U.s.light, frame.light);
      gl.uniform3fv(U.s.ink, frame.ink);
      gl.uniform1f(U.s.hatch, frame.hatch);
      upload(s, ps.positions);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibo);
      if (ps.indices.byteLength > s.icap) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ps.indices, gl.DYNAMIC_DRAW);
        s.icap = ps.indices.byteLength;
      } else {
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, ps.indices);
      }
      gl.bindVertexArray(s.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibo);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.4, 2.2);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.drawElements(gl.TRIANGLES, ps.indexCount, gl.UNSIGNED_INT, 0);
      gl.enable(gl.BLEND);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    function drawLines(ps, frame) {
      var s = slot(ps.key, 'lines');
      gl.useProgram(progL);
      gl.uniformMatrix4fv(U.l.vp, false, frame.vp);
      gl.uniform2f(U.l.vp2, cw, ch);
      gl.uniform1f(U.l.width, Math.max(ps.width * dpr, 1));
      gl.uniform3fv(U.l.color, hexToRGB(ps.color, [0, 0, 0]));
      gl.uniform1f(U.l.opacity, ps.opacity == null ? 1 : ps.opacity);
      upload(s, ps.data);
      gl.bindVertexArray(s.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
      gl.depthMask(true);
      gl.drawArrays(gl.TRIANGLES, 0, ps.data.length / 8);
    }

    function drawPoly(ps, frame) {
      var s = slot(ps.key, 'poly');
      gl.useProgram(progP);
      gl.uniformMatrix4fv(U.p.vp, false, frame.vp);
      gl.uniform3fv(U.p.color, hexToRGB(ps.color, [0, 0, 0]));
      gl.uniform1f(U.p.opacity, ps.opacity == null ? 1 : ps.opacity);
      gl.uniform1f(U.p.mode, ps.mode || 0);
      upload(s, ps.data);
      gl.bindVertexArray(s.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, ps.data.length / 3);
      gl.depthMask(true);
    }

    return {
      backend: 'webgl2',
      label: 'WEBGL2 · MSAA',

      resize: function (cssW, cssH, ratio) {
        cw = Math.max(1, Math.round(cssW * ratio));
        ch = Math.max(1, Math.round(cssH * ratio));
        dpr = ratio;
        canvas.width = cw;
        canvas.height = ch;
        gl.viewport(0, 0, cw, ch);
      },

      draw: function (frame) {
        var paper = hexToRGB(frame.paper, [0, 0, 0]);
        gl.clearColor(paper[0], paper[1], paper[2], 1);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (window.__bare) {
          var px2 = new Uint8Array(4);
          gl.readPixels(Math.floor(cw / 2), Math.floor(ch / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
          document.title = 'BAREPX ' + px2.join(',') + ' err=' + gl.getError() +
            ' dbw=' + gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight;
          return;
        }
        for (var i = 0; i < frame.passes.length; i++) {
          var ps = frame.passes[i];
          if (ps.kind === 'surface') drawSurface(ps, frame);
          else if (ps.kind === 'lines') drawLines(ps, frame);
          else if (ps.kind === 'poly') drawPoly(ps, frame);
        }
        gl.depthMask(true);
        gl.bindVertexArray(null);
        gl.useProgram(null);
      },

      readPixels: function () {
        var buf = new Uint8Array(cw * ch * 4);
        gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        var flip = new Uint8ClampedArray(cw * ch * 4);
        for (var y = 0; y < ch; y++) {
          flip.set(buf.subarray((ch - 1 - y) * cw * 4, (ch - y) * cw * 4), y * cw * 4);
        }
        return { width: cw, height: ch, data: flip };
      },

      destroy: function () {
        for (var k in cache) {
          if (!cache.hasOwnProperty(k)) continue;
          gl.deleteBuffer(cache[k].vbo);
          if (cache[k].ibo) gl.deleteBuffer(cache[k].ibo);
          gl.deleteVertexArray(cache[k].vao);
        }
        cache = {};
      }
    };
  };
})(window.DC);


