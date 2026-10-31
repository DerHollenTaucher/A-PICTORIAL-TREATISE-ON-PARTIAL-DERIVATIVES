/* ==========================================================================
   render/webgpu.js — primary backend (WGSL, 4× MSAA)
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var MAX_PASS = 96;
  var SLOT = 256;          /* dynamic-offset alignment for the per-draw UBO */

  var COMMON = [
    'struct Frame {',
    '  vp : mat4x4<f32>,',
    '  cam : vec4<f32>,',
    '  light : vec4<f32>,',
    '  view : vec4<f32>,',
    '  ink : vec4<f32>,',
    '};',
    '@group(0) @binding(0) var<uniform> F : Frame;',
    'struct Draw {',
    '  c1 : vec4<f32>,',
    '  c2 : vec4<f32>,',
    '  p : vec4<f32>,',
    '};',
    '@group(1) @binding(0) var<uniform> D : Draw;',
    'fn rules(px : vec2<f32>, ang : f32, spacing : f32) -> f32 {',
    '  let s = (px.x * cos(ang) + px.y * sin(ang)) / spacing;',
    '  let f = fract(s);',
    '  let d = min(f, 1.0 - f) * spacing;',
    '  return 1.0 - smoothstep(0.30, 0.95, d);',
    '}'
  ].join('\n');

  var WGSL_SURFACE = COMMON + [
    '',
    'struct VIn { @location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32> };',
    'struct VOut { @builtin(position) clip : vec4<f32>, @location(0) nrm : vec3<f32> };',
    '@vertex fn vs(v : VIn) -> VOut {',
    '  var o : VOut;',
    '  o.clip = F.vp * vec4<f32>(v.pos, 1.0);',
    '  o.nrm = v.nrm;',
    '  return o;',
    '}',
    '@fragment fn fs(i : VOut) -> @location(0) vec4<f32> {',
    '  let N = normalize(i.nrm);',
    '  let d = max(dot(N, normalize(F.light.xyz)), 0.0);',
    '  let t = 0.16 + 0.84 * pow(d, 0.90);',
    '  var col = mix(D.c2.rgb, D.c1.rgb, t);',
    '  let shade = 1.0 - t;',
    '  let px = i.clip.xy;',
    '  var cov = 0.0;',
    '  cov = cov + rules(px, -0.62, 6.5) * smoothstep(0.08, 0.52, shade);',
    '  cov = cov + rules(px, 0.95, 6.5) * smoothstep(0.40, 0.84, shade);',
    '  cov = cov + rules(px, 0.28, 4.5) * smoothstep(0.66, 1.00, shade);',
    '  cov = clamp(cov, 0.0, 1.0) * F.view.w;',
    '  col = mix(col, mix(F.ink.rgb, D.c2.rgb, 0.22), cov * 0.72);',
    '  return vec4<f32>(col, 1.0);',
    '}'
  ].join('\n');

  var WGSL_LINE = COMMON + [
    '',
    'struct LIn {',
    '  @location(0) a : vec3<f32>,',
    '  @location(1) b : vec3<f32>,',
    '  @location(2) side : f32,',
    '  @location(3) end : f32,',
    '};',
    '@vertex fn vs(v : LIn) -> @builtin(position) vec4<f32> {',
    '  let ca = F.vp * vec4<f32>(v.a, 1.0);',
    '  let cb = F.vp * vec4<f32>(v.b, 1.0);',
    '  let wa = max(ca.w, 1e-4);',
    '  let wb = max(cb.w, 1e-4);',
    '  let sa = ca.xy / wa * 0.5 * F.view.xy;',
    '  let sb = cb.xy / wb * 0.5 * F.view.xy;',
    '  let dd = sb - sa;',
    '  let len = length(dd);',
    '  var dir = vec2<f32>(0.0, 1.0);',
    '  if (len > 1e-4) { dir = dd / len; }',
    '  let nrm = vec2<f32>(-dir.y, dir.x);',
    '  let w = max(D.p.x, 1.0) * 0.5;',
    '  let ext = v.end * 2.0 - 1.0;',
    '  let base = mix(sa, sb, v.end);',
    '  let wz = mix(wa, wb, v.end);',
    '  let p = base + nrm * v.side * w + dir * ext * w;',
    '  let clip = vec4<f32>(p / (0.5 * F.view.xy) * wz,',
    '                       mix(ca.z / wa, cb.z / wb, v.end) * wz, wz);',
    '  return clip;',
    '}',
    '@fragment fn fs() -> @location(0) vec4<f32> {',
    '  return vec4<f32>(D.c1.rgb, D.p.y);',
    '}'
  ].join('\n');

  var WGSL_POLY = COMMON + [
    '',
    'struct PIn { @location(0) pos : vec3<f32> };',
    'struct POut { @builtin(position) clip : vec4<f32> };',
    '@vertex fn vs(v : PIn) -> POut {',
    '  var o : POut;',
    '  o.clip = F.vp * vec4<f32>(v.pos, 1.0);',
    '  return o;',
    '}',
    '@fragment fn fs(i : POut) -> @location(0) vec4<f32> {',
    '  var a = D.p.y;',
    '  if (D.p.z > 0.5) {',
    '    a = clamp(D.p.y * (0.80 + 0.85 * rules(i.clip.xy, 0.78, 7.5)), 0.0, 1.0);',
    '  }',
    '  return vec4<f32>(D.c1.rgb, a);',
    '}'
  ].join('\n');

  var hexToRGB = D.hexToRGB || function (hex, out) {
    var h = String(hex || '#888888').replace('#', '');
    out[0] = parseInt(h.slice(0, 2), 16) / 255;
    out[1] = parseInt(h.slice(2, 4), 16) / 255;
    out[2] = parseInt(h.slice(4, 6), 16) / 255;
    return out;
  };

  D.createWebGPU = async function (canvas) {
    if (!navigator.gpu) return null;
    var adapter = null, device = null;
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      device = await adapter.requestDevice();
    } catch (e) { return null; }
    var ctx = canvas.getContext('webgpu');
    if (!ctx) return null;
    var format = navigator.gpu.getPreferredCanvasFormat();
    var SAMPLE = 4;
    var GPUB = window.GPUBufferUsage, GPUS = window.GPUShaderStage, GPUT = window.GPUTextureUsage;
    ctx.configure({
      device: device, format: format, alphaMode: 'opaque',
      usage: GPUT.RENDER_ATTACHMENT | GPUT.COPY_SRC
    });

    var mS = device.createShaderModule({ code: WGSL_SURFACE, label: 'surface' });
    var mL = device.createShaderModule({ code: WGSL_LINE, label: 'line' });
    var mP = device.createShaderModule({ code: WGSL_POLY, label: 'poly' });

    var bgl0 = device.createBindGroupLayout({
      entries: [{
        binding: 0, visibility: GPUS.VERTEX | GPUS.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: 128 }
      }]
    });
    var bgl1 = device.createBindGroupLayout({
      entries: [{
        binding: 0, visibility: GPUS.VERTEX | GPUS.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 }
      }]
    });
    var pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });

    var frameUBO = device.createBuffer({
      size: 256, usage: GPUB.UNIFORM | GPUB.COPY_DST
    });
    var drawUBO = device.createBuffer({
      size: SLOT * MAX_PASS, usage: GPUB.UNIFORM | GPUB.COPY_DST
    });
    var bgFrame = device.createBindGroup({
      layout: bgl0, entries: [{ binding: 0, resource: { buffer: frameUBO } }]
    });
    var bgDraw = device.createBindGroup({
      layout: bgl1, entries: [{ binding: 0, resource: { buffer: drawUBO, offset: 0, size: 48 } }]
    });

    var BLEND = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
    };
    var LAY_SURF = [{
      arrayStride: 24,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' }
      ]
    }];
    var LAY_LINE = [{
      arrayStride: 32,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32' },
        { shaderLocation: 3, offset: 28, format: 'float32' }
      ]
    }];
    var LAY_POLY = [{
      arrayStride: 12,
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
    }];

    function makePipe(mod, lay, depth, blendOn) {
      return device.createRenderPipeline({
        layout: pipeLayout,
        vertex: { module: mod, entryPoint: 'vs', buffers: lay },
        fragment: {
          module: mod, entryPoint: 'fs',
          targets: [{ format: format, blend: blendOn ? BLEND : undefined }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: depth.write !== false,
          depthCompare: 'less-equal',
          depthBias: depth.bias || 0,
          depthBiasSlopeScale: depth.slope || 0,
          depthBiasClamp: 0
        },
        multisample: { count: SAMPLE }
      });
    }

    var pipeSurface = makePipe(mS, LAY_SURF, { write: true, bias: 2, slope: 2.0 }, false);
    var pipeLine = makePipe(mL, LAY_LINE, { write: true }, true);
    var pipePoly = makePipe(mP, LAY_POLY, { write: false }, true);

    var msaaTex = null, msaaView = null, depthTex = null, depthView = null;
    var cw = 1, ch = 1;
    var buffers = {};
    var capPending = null;
    var frameData = new Float32Array(32);
    var drawData = new Float32Array(MAX_PASS * 64);
    var rgb = [0, 0, 0];

    function ensureTargets() {
      if (msaaTex && msaaTex.width === cw && msaaTex.height === ch) return;
      if (msaaTex) { msaaTex.destroy(); depthTex.destroy(); }
      msaaTex = device.createTexture({
        size: [cw, ch, 1], sampleCount: SAMPLE, format: format, usage: GPUT.RENDER_ATTACHMENT
      });
      msaaView = msaaTex.createView();
      depthTex = device.createTexture({
        size: [cw, ch, 1], sampleCount: SAMPLE, format: 'depth24plus', usage: GPUT.RENDER_ATTACHMENT
      });
      depthView = depthTex.createView();
    }

    function getBuf(key, kind) {
      var b = buffers[key];
      if (b && b.kind === kind) return b;
      b = { kind: kind, vbuf: null, ibuf: null, vcap: 0, icap: 0 };
      buffers[key] = b;
      return b;
    }
    function ensureVBO(b, data) {
      if (!b.vbuf || b.vcap < data.byteLength) {
        if (b.vbuf) b.vbuf.destroy();
        b.vcap = Math.max(data.byteLength * 2, 8192);
        b.vbuf = device.createBuffer({
          size: Math.ceil(b.vcap / 4) * 4, usage: GPUB.VERTEX | GPUB.COPY_DST
        });
      }
      device.queue.writeBuffer(b.vbuf, 0, data.buffer, data.byteOffset, data.byteLength);
    }
    function ensureIBO(b, data) {
      if (!b.ibuf || b.icap < data.byteLength) {
        if (b.ibuf) b.ibuf.destroy();
        b.icap = Math.max(data.byteLength * 2, 8192);
        b.ibuf = device.createBuffer({
          size: Math.ceil(b.icap / 4) * 4, usage: GPUB.INDEX | GPUB.COPY_DST
        });
      }
      device.queue.writeBuffer(b.ibuf, 0, data.buffer, data.byteOffset, data.byteLength);
    }

    function finishCapture(info) {
      var bpr = info.bpr, width = info.w, height = info.h;
      info.buffer.mapAsync(GPUMapMode.READ).then(function () {
        var src = new Uint8Array(info.buffer.getMappedRange());
        var out = new Uint8ClampedArray(width * height * 4);
        var bgra = format.indexOf('bgra') === 0;
        for (var y = 0; y < height; y++) {
          var sRow = y * bpr, dRow = y * width * 4;
          for (var x = 0; x < width; x++) {
            var s = sRow + x * 4, d = dRow + x * 4;
            out[d] = src[s + (bgra ? 2 : 0)];
            out[d + 1] = src[s + 1];
            out[d + 2] = src[s + (bgra ? 0 : 2)];
            out[d + 3] = 255;
          }
        }
        info.buffer.unmap();
        info.buffer.destroy();
        info.resolve({ width: width, height: height, data: out });
      }).catch(function () {
        info.buffer.destroy();
        info.resolve(null);
      });
    }

    return {
      backend: 'webgpu',
      label: 'WEBGPU · 4×MSAA',

      resize: function (cssW, cssH, ratio) {
        cw = Math.max(1, Math.round(cssW * ratio));
        ch = Math.max(1, Math.round(cssH * ratio));
        canvas.width = cw;
        canvas.height = ch;
        ensureTargets();
      },

      draw: function (frame) {
        if (!msaaView) return;
        var paper = hexToRGB(frame.paper, [0, 0, 0]);
        frameData.set(frame.vp, 0);
        frameData[16] = frame.eye[0]; frameData[17] = frame.eye[1];
        frameData[18] = frame.eye[2]; frameData[19] = 0;
        frameData[20] = frame.light[0]; frameData[21] = frame.light[1];
        frameData[22] = frame.light[2]; frameData[23] = 0;
        frameData[24] = cw; frameData[25] = ch;
        frameData[26] = frame.dpr || 1; frameData[27] = frame.hatch;
        frameData[28] = frame.ink[0]; frameData[29] = frame.ink[1];
        frameData[30] = frame.ink[2]; frameData[31] = 0;
        device.queue.writeBuffer(frameUBO, 0, frameData);

        var n = Math.min(frame.passes.length, MAX_PASS);
        drawData.fill(0);
        for (var i = 0; i < n; i++) {
          var ps = frame.passes[i], o = i * 64;
          hexToRGB(ps.color, rgb);
          drawData[o] = rgb[0]; drawData[o + 1] = rgb[1];
          drawData[o + 2] = rgb[2]; drawData[o + 3] = 1;
          hexToRGB(ps.color2 || ps.color, rgb);
          drawData[o + 4] = rgb[0]; drawData[o + 5] = rgb[1];
          drawData[o + 6] = rgb[2]; drawData[o + 7] = 1;
          drawData[o + 8] = Math.max((ps.width || 1) * (frame.dpr || 1), 1);
          drawData[o + 9] = ps.opacity == null ? 1 : ps.opacity;
          drawData[o + 10] = ps.mode || 0;
        }
        device.queue.writeBuffer(drawUBO, 0, drawData);

        var cur = ctx.getCurrentTexture();
        var enc = device.createCommandEncoder();
        var pass = enc.beginRenderPass({
          colorAttachments: [{
            view: msaaView,
            resolveTarget: cur.createView(),
            clearValue: { r: paper[0], g: paper[1], b: paper[2], a: 1 },
            loadOp: 'clear', storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: depthView, depthClearValue: 1,
            depthLoadOp: 'clear', depthStoreOp: 'discard'
          }
        });
        pass.setBindGroup(0, bgFrame);
        for (i = 0; i < n; i++) {
          ps = frame.passes[i];
          var pipeline = ps.kind === 'surface' ? pipeSurface
            : (ps.kind === 'lines' ? pipeLine : pipePoly);
          pass.setPipeline(pipeline);
          pass.setBindGroup(1, bgDraw, [i * SLOT]);
          var b = getBuf(ps.key, ps.kind);
          if (ps.kind === 'surface') {
            ensureVBO(b, ps.positions);
            ensureIBO(b, ps.indices);
            pass.setVertexBuffer(0, b.vbuf);
            pass.setIndexBuffer(b.ibuf, 'uint32');
            pass.drawIndexed(ps.indexCount);
          } else {
            ensureVBO(b, ps.data);
            pass.setVertexBuffer(0, b.vbuf);
            pass.draw(ps.kind === 'lines' ? ps.data.length / 8 : ps.data.length / 3);
          }
        }
        pass.end();

        var capInfo = null;
        if (capPending) {
          var bpr = Math.ceil(cw * 4 / 256) * 256;
          var capBuf = device.createBuffer({
            size: bpr * ch, usage: GPUB.COPY_DST | GPUB.MAP_READ
          });
          enc.copyTextureToBuffer(
            { texture: cur },
            { buffer: capBuf, bytesPerRow: bpr, rowsPerImage: ch },
            { width: cw, height: ch, depthOrArrayLayers: 1 }
          );
          capInfo = { buffer: capBuf, bpr: bpr, w: cw, h: ch, resolve: capPending };
          capPending = null;
        }
        device.queue.submit([enc.finish()]);
        if (capInfo) finishCapture(capInfo);
      },

      capture: function () {
        return new Promise(function (resolve) { capPending = resolve; });
      },

      destroy: function () {
        for (var k in buffers) {
          if (!buffers.hasOwnProperty(k)) continue;
          if (buffers[k].vbuf) buffers[k].vbuf.destroy();
          if (buffers[k].ibuf) buffers[k].ibuf.destroy();
        }
        buffers = {};
        if (msaaTex) { msaaTex.destroy(); depthTex.destroy(); }
      }
    };
  };
})(window.DC);


