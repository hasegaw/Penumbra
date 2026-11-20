/* Linear-light grading, optical bloom and extended-range canvas presentation. */
(() => {
  "use strict";

  const vertex = `
    attribute vec3 position;
    varying vec2 uv;
    void main() {
      uv = position.xy * 0.5 + 0.5;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`;

  // One invalid specular sample would otherwise spread across every bloom mip.
  // Ordered comparisons reject both NaN and infinity in GLSL ES 1.00 as well.
  const finiteLight = `
    vec3 finiteLight(vec3 c) {
      if (!all(lessThan(abs(c), vec3(65505.0)))) return vec3(0.0);
      return clamp(c, 0.0, 32.0);
    }`;

  // The two camera exposures meet in scene-linear light, before optical bloom.
  // A positive bias brings bright features of the arriving shot through first.
  const shotDissolve = `
    uniform sampler2D outgoingShot;
    uniform float arrival;
    uniform float lightLead;
    vec3 editLight(vec3 incoming, vec2 p) {
      if (arrival >= 1.0) return incoming;
      vec3 outgoing = finiteLight(texture2D(outgoingShot, p).rgb);
      vec3 luma = vec3(0.2126, 0.7152, 0.0722);
      float a = dot(outgoing, luma);
      float b = dot(incoming, luma);
      float contrast = (b - a) / (0.10 + a + b);
      float weight = arrival + 4.0 * arrival * (1.0 - arrival) * lightLead * contrast;
      return mix(outgoing, incoming, clamp(weight, 0.0, 1.0));
    }`;

  const downsample = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D image;
    uniform vec2 texel;
    uniform float threshold;
    ${finiteLight}
    ${shotDissolve}
    vec3 tap(vec2 p) {
      vec3 c = finiteLight(texture2D(image, p).rgb);
      if (threshold > 0.5) {
        c = editLight(c, p);
        float peak = max(c.r, max(c.g, c.b));
        float light = smoothstep(0.74, 1.28, peak) * max(peak - 0.70, 0.0);
        c *= light / max(peak, 0.001);
      }
      return c;
    }
    void main() {
      vec2 d = texel * 0.75;
      vec3 s = tap(uv + d) + tap(uv - d);
      s += tap(uv + vec2(-d.x,d.y)) + tap(uv + vec2(d.x,-d.y));
      gl_FragColor = vec4(s * 0.25, 1.0);
    }`;

  const upsample = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D detail;
    uniform sampler2D coarse;
    uniform vec2 texel;
    void main() {
      vec2 d = texel * 0.88;
      vec3 s = 4.0 * texture2D(coarse, uv).rgb;
      s += texture2D(coarse, uv + d).rgb + texture2D(coarse, uv - d).rgb;
      s += texture2D(coarse, uv + vec2(-d.x,d.y)).rgb + texture2D(coarse, uv + vec2(d.x,-d.y)).rgb;
      gl_FragColor = vec4(mix(texture2D(detail, uv).rgb, s * 0.125, 0.68), 1.0);
    }`;

  // grade = 0 for SDR. 1 and 2 carry a square-root-encoded 16-bit HDR value in
  // two opaque byte planes across the WebGL / WebGPU boundary, entirely on GPU.
  const composite = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D sceneLight;
    uniform sampler2D bloom;
    uniform float exposure;
    uniform float grade;
    uniform float flarePower;
    uniform float focusTravel;
    uniform vec2 filmPixels;
    uniform vec4 flareOptics;
    ${finiteLight}
    ${shotDissolve}

    vec3 srgb(vec3 x) {
      return mix(12.92 * x, 1.055 * pow(x, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), x));
    }

    float stopShape(vec2 p) {
      vec2 q = abs(p);
      return max(q.y, dot(q, vec2(0.8660254, 0.5)));
    }
    vec3 sunriseFlare(vec2 at) {
      if (flarePower <= 0.0) return vec3(0.0);
      vec2 sun = flareOptics.xy;
      vec2 principal = flareOptics.zw;
      vec2 metric = vec2(filmPixels.x / filmPixels.y, 1.0);
      // Meter the actual image of the photosphere. A foreground object or the
      // occulting limb attenuates even the ghosts on the far side of the lens.
      vec2 tap = 0.0048 / metric;
      vec3 source = 2.0 * texture2D(sceneLight, sun).rgb;
      source += texture2D(sceneLight, sun + tap).rgb + texture2D(sceneLight, sun - tap).rgb;
      source += texture2D(sceneLight, sun + vec2(-tap.x,tap.y)).rgb;
      source += texture2D(sceneLight, sun + vec2(tap.x,-tap.y)).rgb;
      float power = flarePower * smoothstep(0.9, 5.0, dot(source / 6.0, vec3(.2126,.7152,.0722)));
      vec2 delta = (at - sun) * metric;
      vec2 axis = sun - principal;
      float dx = abs(delta.x), dy = abs(delta.y);
      float line = exp(-dy / (0.0017 + 0.55 / filmPixels.y) - 1.65 * dx);
      float veil = exp(-dy / 0.009 - 4.3 * dx);
      vec3 light = vec3(0.20,0.74,1.90) * line + vec3(0.16,0.38,0.83) * veil;
      light += vec3(1.60,0.75,0.23) * exp(-dy / 0.0032 - 13.0 * dx);
      light += vec3(.61,.21,.045) * exp(-length(delta * vec2(.83,1.3)) * 18.0);

      // Two internal reflections walk along the shifted optical axis as the
      // lens passes the sun. Only one edge of the far aperture catches light.
      vec2 farGhost = (at - principal + axis * mix(.78,.98,focusTravel)) * metric;
      float radius = mix(.045,.062,focusTravel);
      vec2 normal = farGhost / radius;
      vec2 aperture = normal * vec2(.94,1.03);
      float stop = mix(length(aperture), stopShape(aperture), .19);
      float crescent = exp(-12.0 * (stop-.85)*(stop-.85))
                     * smoothstep(-.34,.93,dot(normal,normalize(axis*metric)));
      float wash = 1.0 - smoothstep(.44,1.14,stop);
      light += vec3(.036,.100,.105) * crescent + vec3(.025,.014,.023) * wash;
      vec2 nearGhost = (at - principal - axis * mix(.44,.26,focusTravel)) * metric;
      float small = stopShape(nearGhost / mix(.023,.032,focusTravel));
      light += vec3(.17,.071,.030) * (1.0 - smoothstep(.39,1.14,small));
      return light * power;
    }

    void main() {
      vec3 image = editLight(finiteLight(texture2D(sceneLight, uv).rgb), uv);
      vec3 c = (image + 0.19 * finiteLight(texture2D(bloom, uv).rgb) + sunriseFlare(uv)) * exposure;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.986, 0.998, 1.012), vec3(1.012, 1.002, 0.984), smoothstep(0.035, 0.80, luma));
      float peak = max(c.r, max(c.g, c.b));
      bool hdr = grade > 0.5;
      float white = hdr ? 6.0 : 1.0;
      float knee = hdr ? 0.80 : 0.57;
      if (peak > knee) {
        float shoulder = knee + (white - knee) * (1.0 - exp(-(peak - knee) / (white - knee)));
        c *= shoulder / peak;
      }
      if (hdr) {
        vec3 word = floor(sqrt(clamp(c / 6.0, 0.0, 1.0)) * 65535.0 + 0.5);
        vec3 octet = grade < 1.5 ? floor(word / 256.0) : mod(word, 256.0);
        gl_FragColor = vec4(octet / 255.0, 1.0);
      } else {
        float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056,0.00583715)))) - 0.5;
        gl_FragColor = vec4(srgb(c) + grain / 255.0, 1.0);
      }
    }`;

  function webGPUShader(linearCanvas) {
    return `
      @group(0) @binding(0) var planes: texture_2d_array<f32>;
      @vertex fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        let p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
        return vec4f(p[i], 0, 1);
      }
      @fragment fn fragmentMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let pixel = vec2i(pos.xy);
        let hi = round(textureLoad(planes, pixel, 0, 0).rgb * 255.0);
        let lo = round(textureLoad(planes, pixel, 1, 0).rgb * 255.0);
        let root = (hi * 256.0 + lo) / 65535.0;
        let light = root * root * 6.0;
        ${linearCanvas ? "return vec4f(light, 1);" : `
        let encoded = select(12.92 * light, 1.055 * pow(light, vec3f(1.0 / 2.4)) - 0.055, light > vec3f(0.0031308));
        return vec4f(encoded, 1);`}
      }
    `;
  }

  async function openHDR(source, canvas, current) {
    const context = canvas.getContext("webgpu");
    if (!context || !context.getConfiguration) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter || !current()) return null;
    const device = await adapter.requestDevice();
    let planes, group, width, height;
    const release = () => {
      planes?.destroy();
      if (context.getConfiguration()?.device === device) context.unconfigure();
      device.destroy();
    };

    try {
      let chosen;
      for (const colorSpace of ["srgb-linear", "srgb"]) {
        if (!current()) break;
        device.pushErrorScope("validation");
        let matches = false;
        try {
          context.configure({
            device, colorSpace, format: "rgba16float", alphaMode: "opaque",
            toneMapping: { mode: "extended" },
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
          });
          const c = context.getConfiguration();
          matches = c?.toneMapping?.mode === "extended" && c.format === "rgba16float" && c.colorSpace === colorSpace;
        } catch (_) {
          // Earlier browsers only recognize the sRGB transfer, including its extended range.
        }
        const error = await device.popErrorScope();
        if (!error && matches) { chosen = colorSpace; break; }
      }
      if (!chosen || !current()) { release(); return null; }
      const module = device.createShaderModule({ code: webGPUShader(chosen === "srgb-linear") });
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "fragmentMain", targets: [{ format: "rgba16float" }] },
        primitive: { topology: "triangle-list" }
      });
      if (!current()) { release(); return null; }

      const ensureSize = () => {
        if (width === source.width && height === source.height) return;
        width = source.width;
        height = source.height;
        if (Math.max(width, height) > device.limits.maxTextureDimension2D) throw new Error("Canvas exceeds WebGPU limits");
        planes?.destroy();
        planes = device.createTexture({
          size: [width, height, 2], format: "rgba8unorm",
          usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
        });
        group = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: planes.createView({ dimension: "2d-array" }) }]
        });
      };
      const copy = layer => {
        ensureSize();
        // Matching sRGB tags and a non-sRGB texture view preserve the transported bytes.
        device.queue.copyExternalImageToTexture({ source }, {
          texture: planes, origin: [0, 0, layer], colorSpace: "srgb", premultipliedAlpha: false
        }, [width, height]);
      };
      const present = () => {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }
        }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      };

      // Prove that both the external copy and the extended swap chain work before
      // an HDR frame is allowed on screen. No CPU readback in this pipeline.
      device.pushErrorScope("validation");
      copy(0);
      copy(1);
      present();
      const error = await device.popErrorScope();
      await device.queue.onSubmittedWorkDone();
      if (error || !current()) { release(); return null; }
      return { device, copy, present, release };
    } catch (_) {
      release();
      return null;
    }
  }

  function create(T, renderer, hdrCanvas, onMode) {
    const gl = renderer.getContext();
    const sdrCanvas = renderer.domElement;
    const high = window.matchMedia?.("(dynamic-range: high)");
    const gl2 = renderer.capabilities.isWebGL2;
    const halfFloat = gl2 ? !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"))
      : !!(gl.getExtension("OES_texture_half_float") && gl.getExtension("OES_texture_half_float_linear") && gl.getExtension("EXT_color_buffer_half_float"));
    let dataType = halfFloat ? T.HalfFloatType : T.UnsignedByteType;
    let samples = 0;
    if (gl2 && gl.getContextAttributes()?.antialias) {
      const available = gl.getInternalformatParameter(gl.RENDERBUFFER, halfFloat ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
      if (available && Array.from(available).some(n => n >= 2)) samples = 2;
    }

    function buffer(depth = false, multisampling = 0) {
      const target = new T.WebGLRenderTarget(1, 1, {
        type: dataType, colorSpace: T.LinearSRGBColorSpace,
        depthBuffer: depth, stencilBuffer: false, samples: multisampling,
        minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false
      });
      return target;
    }

    let sceneTarget = buffer(true, samples);
    const complete = target => {
      renderer.setRenderTarget(target);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      renderer.setRenderTarget(null);
      return ok;
    };
    if (!complete(sceneTarget)) {
      sceneTarget.dispose();
      sceneTarget = buffer(true);
      if (!complete(sceneTarget)) {
        sceneTarget.dispose();
        dataType = T.UnsignedByteType;
        sceneTarget = buffer(true);
      }
    }

    const small = Array.from({ length: 5 }, () => buffer());
    const soft = Array.from({ length: 3 }, () => buffer());
    const post = new T.Scene();
    const camera = new T.Camera();
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
    const uniform = value => ({ value });
    function material(code, uniforms) {
      return new T.RawShaderMaterial({
        vertexShader: vertex, fragmentShader: code, uniforms,
        depthTest: false, depthWrite: false, toneMapped: false, blending: T.NoBlending
      });
    }
    let outgoingTarget = null;
    const edit = { outgoingShot: uniform(null), arrival: uniform(1), lightLead: uniform(0) };
    const down = material(downsample, { ...edit, image: uniform(null), texel: uniform(new T.Vector2()), threshold: uniform(0) });
    const up = material(upsample, { detail: uniform(null), coarse: uniform(null), texel: uniform(new T.Vector2()) });
    const finish = material(composite, {
      ...edit, sceneLight: uniform(sceneTarget.texture), bloom: uniform(soft[0].texture), exposure: uniform(1), grade: uniform(0),
      flarePower: uniform(0), focusTravel: uniform(0), filmPixels: uniform(new T.Vector2(1,1)), flareOptics: uniform(new T.Vector4())
    });
    const quad = new T.Mesh(geometry, finish);
    quad.frustumCulled = false;
    post.add(quad);
    renderer.outputColorSpace = T.SRGBColorSpace;

    let bridge = null, generation = 0, mode = "", lost = false, frameReady = false, disposed = false;
    function show(next) {
      if (hdrCanvas) hdrCanvas.hidden = next !== "HDR";
      sdrCanvas.style.visibility = next === "HDR" ? "hidden" : "visible";
      if (mode !== next) { mode = next; onMode?.(mode); }
    }

    function pass(target, mat) {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(post, camera);
    }

    function output(grade) {
      finish.uniforms.grade.value = grade;
      finish.uniforms.exposure.value = renderer.toneMappingExposure;
      pass(null, finish);
    }

    function useSDR() {
      const old = bridge;
      bridge = null;
      old?.release();
      if (frameReady && !lost && !disposed) output(0);
      show("SDR");
    }

    function presentFrame() {
      if (bridge) {
        try {
          output(1);
          bridge.copy(0);
          output(2);
          bridge.copy(1);
          bridge.present();
          show("HDR");
          return;
        } catch (_) { useSDR(); return; }
      }
      output(0);
    }

    async function checkDisplay() {
      const stamp = ++generation;
      useSDR();
      if (disposed || lost || !hdrCanvas || !high?.matches || !navigator.gpu || dataType !== T.HalfFloatType) return;
      const current = () => generation === stamp && !disposed && !lost && high.matches;
      const candidate = await openHDR(sdrCanvas, hdrCanvas, current).catch(() => null);
      if (!candidate) return;
      if (!current()) { candidate.release(); return; }
      bridge = candidate;
      const failed = () => { if (bridge === candidate) useSDR(); };
      candidate.device.lost.then(failed);
      candidate.device.addEventListener("uncapturederror", failed);
      if (frameReady) presentFrame();
    }

    function resize(width, height) {
      width = Math.max(1, Math.floor(width));
      height = Math.max(1, Math.floor(height));
      if (width !== sceneTarget.width || height !== sceneTarget.height) frameReady = false;
      sceneTarget.setSize(width, height);
      outgoingTarget?.setSize(width, height);
      finish.uniforms.filmPixels.value.set(width,height);
      if (hdrCanvas) {
        if (hdrCanvas.width !== width) hdrCanvas.width = width;
        if (hdrCanvas.height !== height) hdrCanvas.height = height;
      }
      for (let i = 0; i < small.length; i++) {
        const w = Math.max(1, Math.ceil(width / (2 ** (i + 1))));
        const h = Math.max(1, Math.ceil(height / (2 ** (i + 1))));
        small[i].setSize(w, h);
        if (i >= 1 && i <= soft.length) soft[i - 1].setSize(w, h);
      }
    }

    function setSolarFlare(sun, camera, power, travel) {
      finish.uniforms.flarePower.value = power;
      if (power <= 0) return;
      const lens = camera.projectionMatrix.elements;
      finish.uniforms.flareOptics.value.set(sun.x * .5 + .5, sun.y * .5 + .5, .5 - lens[8] * .5, .5 - lens[9] * .5);
      finish.uniforms.focusTravel.value = travel;
    }

    function captureOutgoing(scene, sceneCamera) {
      if (lost || disposed) return;
      if (!outgoingTarget) {
        outgoingTarget = buffer(true, sceneTarget.samples);
        outgoingTarget.setSize(sceneTarget.width, sceneTarget.height);
        edit.outgoingShot.value = outgoingTarget.texture;
      }
      renderer.setRenderTarget(outgoingTarget);
      renderer.render(scene, sceneCamera);
    }

    function render(scene, sceneCamera, arrival = 1, lightLead = 0) {
      if (lost || disposed) return;
      edit.arrival.value = arrival;
      edit.lightLead.value = lightLead;
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, sceneCamera);
      let source = sceneTarget;
      for (let i = 0; i < small.length; i++) {
        down.uniforms.image.value = source.texture;
        down.uniforms.texel.value.set(1 / source.width, 1 / source.height);
        down.uniforms.threshold.value = i === 0 ? 1 : 0;
        pass(small[i], down);
        source = small[i];
      }
      for (let i = soft.length - 1; i >= 0; i--) {
        up.uniforms.detail.value = small[i + 1].texture;
        up.uniforms.coarse.value = source.texture;
        up.uniforms.texel.value.set(1 / source.width, 1 / source.height);
        pass(soft[i], up);
        source = soft[i];
      }
      frameReady = true;
      presentFrame();
    }

    const contextLost = () => { lost = true; frameReady = false; generation++; useSDR(); };
    const contextRestored = () => { lost = false; checkDisplay(); };
    sdrCanvas.addEventListener("webglcontextlost", contextLost);
    sdrCanvas.addEventListener("webglcontextrestored", contextRestored);
    high?.addEventListener("change", checkDisplay);
    resize(sdrCanvas.width, sdrCanvas.height);
    checkDisplay();
    return {
      resize, setSolarFlare, captureOutgoing, render,
      dispose() {
        disposed = true;
        generation++;
        useSDR();
        high?.removeEventListener("change", checkDisplay);
        sdrCanvas.removeEventListener("webglcontextlost", contextLost);
        sdrCanvas.removeEventListener("webglcontextrestored", contextRestored);
        outgoingTarget?.dispose();
        [sceneTarget, ...small, ...soft, down, up, finish, geometry].forEach(item => item.dispose());
      }
    };
  }

  // Optical titles sit at paper white, above the exposed picture and bloom.
  // The first two shots share this card while the camera draws away from SV-07.
  const title = {
    opacityAt(time) {
      const ease = value => {
        const x = Math.max(0, Math.min(1, value));
        return x*x*(3-2*x);
      };
      return ease((time-7.8)/1.6) * (1-ease((time-13.15)/1.85));
    },
    paint(canvas) {
      const context = canvas.getContext("2d");
      if (!context) return;
      const width = canvas.width, height = canvas.height;
      const narrow = width/height < .85;
      const letters = "PENUMBRA";
      const tracking = 7;
      context.clearRect(0, 0, width, height);
      context.save();
      context.font = 'italic 800 128px "Barlow Display", Impact, sans-serif';
      const widths = Array.from(letters, letter => context.measureText(letter).width);
      const advance = widths.reduce((sum, next) => sum + next, tracking * (letters.length-1));
      const printedWidth = Math.min(width*(narrow ? .77 : .43), height*1.04);
      const scale = printedWidth/advance;
      context.translate((width-printedWidth)/2, height*(narrow ? .78 : .875));
      context.scale(scale, scale);
      context.fillStyle = "#edece2";
      context.shadowColor = "rgba(2,6,12,.5)";
      context.shadowBlur = 3 * scale;
      context.textBaseline = "alphabetic";
      let x = 0;
      for (let i=0; i<letters.length; i++) {
        context.fillText(letters[i], x, 0);
        x += widths[i] + tracking;
      }
      context.restore();
    }
  };

  // The opening remains fully black through both notes and their short tail.
  function openingOpacity(time, callEnd) {
    const u = Math.max(0, Math.min(1, (time-callEnd-.10)/.95));
    return 1-u*u*(3-2*u);
  }

  window.PenumbraDisplay = { create, title, openingOpacity };
})();
