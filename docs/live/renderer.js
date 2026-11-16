'use strict';

window.LiveCanvas = (() => {
  const vertexSource = `#version 300 es
    in vec4 aPosition;
    in vec2 aUv;
    out vec2 vUv;
    void main() { gl_Position = aPosition; vUv = aUv; }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 pixel;
    uniform sampler2D uLeft, uRight;
    uniform int uMode;
    uniform float uWipe;
    uniform vec4 uColor;
    uniform int uEffect;
    uniform vec4 uCrop, uParams;
    uniform float uOpacity;
    float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
    vec4 process(vec4 source, vec2 coord) {
      vec3 color = source.rgb;
      float light = luminance(color);
      vec2 pixelStep = 1.0 / vec2(textureSize(uLeft, 0));
      if (uEffect == 1) color = vec3(light);
      if (uEffect == 2) color = clamp((color - 0.5) * (uParams.x > 0.0 ? uParams.x : 1.7) + 0.5, 0.0, 1.0);
      if (uEffect == 3) color = vec3(step(uParams.x > 0.0 ? uParams.x : 0.5, light));
      if (uEffect == 4) {
        float x = luminance(texture(uLeft, coord + vec2(pixelStep.x, 0)).rgb) - luminance(texture(uLeft, coord - vec2(pixelStep.x, 0)).rgb);
        float y = luminance(texture(uLeft, coord + vec2(0, pixelStep.y)).rgb) - luminance(texture(uLeft, coord - vec2(0, pixelStep.y)).rgb);
        color = clamp(length(vec2(x,y)) * 1.7, 0.0, 1.0) * vec3(0.52,0.94,0.82);
      }
      if (uEffect == 5) color = clamp(vec3(
        dot(color, vec3(0.37, 0.86, -0.23)),
        dot(color, vec3(0.28, 0.67, 0.05)),
        dot(color, vec3(-0.01, 0.04, 0.97))
      ), 0.0, 1.0);
      if (uEffect == 6) {
        vec4 blur = vec4(0);
        float radius = uParams.x > 0.0 ? uParams.x : 4.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) blur += texture(uLeft, coord + vec2(x,y) * pixelStep * radius);
        }
        return blur / 9.0;
      }
      if (uEffect == 7) {
        float levels = uParams.x >= 2.0 ? uParams.x : 4.0;
        color = round(color * (levels-1.0)) / (levels-1.0);
      }
      if (uEffect == 8) color = mix(mix(vec3(.10,.21,.41),vec3(.14,.70,.72),smoothstep(0.0,.5,light)),
        vec3(1.0,.64,.21),smoothstep(.4,1.0,light));
      if (uEffect == 9) {
        vec2 p = vec2(coord.x,1.0-coord.y);
        vec2 high = uParams.xy + uParams.zw;
        if (all(greaterThanEqual(p,uParams.xy)) && all(lessThanEqual(p,high))) return vec4(.025,.032,.043,1.0);
      }
      if (uEffect == 10) {
        color = mix(vec3(.14,.13,.115), vec3(.97,.95,.88), smoothstep(.38,.70,light));
      }
      if (uEffect == 11) {
        color = mix(vec3(.14,.18,.15),vec3(.86,.90,.80),floor(light*4.0+.5)/4.0);
      }
      if (uEffect == 12) {
        float cutoff = uParams.x > 0.0 ? uParams.x : .22;
        return source * smoothstep(cutoff,cutoff+.035,light);
      }
      return vec4(color, source.a);
    }
    void main() {
      if (uMode == 3) {
        pixel = uColor;
        return;
      }
      if (uMode == 4) {
        vec2 cell = abs(fract(vUv * vec2(32.0, 24.0) + 0.5) - 0.5) / fwidth(vUv * vec2(32.0, 24.0));
        float grid = 1.0 - min(min(cell.x, cell.y), 1.0);
        pixel = vec4(vec3(0.05, 0.085, 0.11) + vec3(0.04, 0.055, 0.06) * grid, 1.0);
        return;
      }
      vec2 coord = vec2(uCrop.x + vUv.x*uCrop.z, 1.0-uCrop.y-uCrop.w + vUv.y*uCrop.w);
      vec4 left = texture(uLeft, coord);
      if (uMode == 0) {
        pixel = process(left,coord) * uOpacity;
        return;
      }
      vec4 right = texture(uRight, coord);
      if (uMode == 1) {
        float divider = 1.0 - smoothstep(0.001, 0.004, abs(vUv.x - uWipe));
        pixel = mix(vUv.x < uWipe ? left : right, vec4(0.52, 0.94, 0.82, 1.0), divider) * uOpacity;
        return;
      }
      vec3 change = abs(left.rgb - right.rgb);
      float intensity = smoothstep(0.035, 0.32, max(change.r, max(change.g, change.b)));
      float backdrop = dot(right.rgb, vec3(0.21, 0.72, 0.07));
      pixel = vec4(mix(vec3(backdrop * 0.37 + 0.06), vec3(1.0, 0.57, 0.19), intensity), 1.0) * uOpacity;
    }
  `;

  function programFor(gl) {
    function compile(kind, source) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  function corners(matrix, width, height, depth = 0) {
    return [[0, 0], [0, height], [width, 0], [width, height]]
      .map(([x, y]) => matrix.transformPoint(new DOMPoint(x, y, depth)));
  }

  function open(canvas, { panels, render, fallback, ready }) {
    try {
      const gl = canvas.getContext('webgl2', {alpha:false, antialias:true, preserveDrawingBuffer:true});
      if (!gl || typeof gl.texElementSubImage2D !== 'function' ||
          typeof canvas.updateElementGeometry !== 'function' || typeof canvas.clearElementGeometry !== 'function' ||
          typeof canvas.requestPaint !== 'function') {
        fallback('HTML-in-Canvas is unavailable here. The controls still work in the plain HTML view.');
        return null;
      }
      return setup(gl, canvas, panels, render, ready, fallback);
    } catch (error) {
      fallback('The canvas could not start. The controls are available in the plain HTML view.');
      return null;
    }
  }

  function setup(gl, canvas, panels, render, ready, fallback) {
    const program = programFor(gl);
    const buffer = gl.createBuffer();
    const textures = new Map(panels.map(element => [element, {object:gl.createTexture(), width:0, height:0}]));
    const frozen = new Map();
    const events = new AbortController();
    const options = {signal:events.signal};
    let width = 0, height = 0, frame = 0, firstFrame = true;
    const uniforms = Object.fromEntries(['uLeft','uRight','uMode','uWipe','uColor','uEffect','uCrop','uParams','uOpacity']
      .map(key => [key, gl.getUniformLocation(program, key)]));

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [['aPosition',4,0], ['aUv',2,16]]) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 24, offset);
    }
    gl.uniform1i(uniforms.uLeft, 0);
    gl.uniform1i(uniforms.uRight, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    function check() {
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL upload or draw failed');
    }

    function upload(element, data) {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.getElementImageDefaultSize?.(element);
      const w = Math.ceil(size?.width ?? element.offsetWidth * ratio);
      const h = Math.ceil(size?.height ?? element.offsetHeight * ratio);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, data.object);
      if (data.width !== w || data.height !== h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        data.width = w;
        data.height = h;
      }
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element);
      check();
    }

    const effects = ['','grayscale','contrast','threshold','edges','deuteranopia','blur','posterize','heat','redact','print','eink','key'];
    let registered = new Set(), updated = new Set();
    function draw(points, mode, color, left, right, settings = {}) {
      const uv = [[0,1], [0,0], [1,1], [1,0]];
      const vertices = new Float32Array(points.flatMap(({x,y,w}, i) => [
        2*x/width-w, w-2*y/height, 0, w, ...uv[i]
      ]));
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
      gl.uniform1i(uniforms.uMode, mode);
      gl.uniform1f(uniforms.uWipe, settings.wipe ?? .5);
      gl.uniform1i(uniforms.uEffect, Math.max(0,effects.indexOf(settings.effect)));
      gl.uniform4fv(uniforms.uCrop, settings.uv ?? [0,0,1,1]);
      const [a=0,b=0,c=0,d=0] = settings.params ?? [];
      gl.uniform4fv(uniforms.uParams, [a,b,c,d]);
      gl.uniform1f(uniforms.uOpacity, settings.opacity ?? 1);
      if (color) gl.uniform4fv(uniforms.uColor, color);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (left ?? textures.get(panels[0])).object);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (right ?? left ?? textures.get(panels[0])).object);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const scene = {
      surface(element, matrix, settings = {}) {
        draw(corners(matrix, element.offsetWidth, element.offsetHeight), settings.mode ?? 0, null,
          textures.get(element), textures.get(settings.other) ?? frozen.get(settings.other), settings);
      },
      solid(points, color) { draw(points, 3, color); },
      grid() { draw(corners(new DOMMatrix(), width, height), 4); },
      register(element, matrix, clip) {
        updated.add(element);
        canvas.updateElementGeometry(element, {canvasTransform:matrix, ...(clip ? {canvasClip:clip} : {})});
      },
      unregister(element) { canvas.clearElementGeometry(element); },
      clip(x, y, w, h, renderClip) {
        const rx = canvas.width / width, ry = canvas.height / height;
        const previous = gl.isEnabled(gl.SCISSOR_TEST) ? gl.getParameter(gl.SCISSOR_BOX) : null;
        let x0 = Math.max(0,Math.floor(x*rx)), y0 = Math.max(0,Math.floor((height-y-h)*ry));
        let x1 = Math.min(canvas.width,Math.ceil((x+w)*rx)), y1 = Math.min(canvas.height,Math.ceil((height-y)*ry));
        if (previous) {
          x0 = Math.max(x0,previous[0]); y0 = Math.max(y0,previous[1]);
          x1 = Math.min(x1,previous[0]+previous[2]); y1 = Math.min(y1,previous[1]+previous[3]);
        }
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0,y0,Math.max(0,x1-x0),Math.max(0,y1-y0));
        try { renderClip(); } finally {
          if (previous) gl.scissor(...previous);
          else gl.disable(gl.SCISSOR_TEST);
        }
      },
      sample(x,y) {
        const color = new Uint8Array(4);
        const px = Math.min(canvas.width-1,Math.max(0,Math.floor(x*canvas.width/width)));
        const py = Math.min(canvas.height-1,Math.max(0,canvas.height-1-Math.floor(y*canvas.height/height)));
        gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,color);
        return [...color];
      },
      freeze(key, element) {
        scene.drop(key);
        const data = {object:gl.createTexture(),width:0,height:0,cssWidth:element.offsetWidth,cssHeight:element.offsetHeight};
        frozen.set(key,data);
        upload(element,data);
      },
      snapshot(key,matrix,settings = {}) {
        const data = frozen.get(key);
        if (data) draw(corners(matrix,data.cssWidth,data.cssHeight),settings.mode ?? 0,null,
          data,textures.get(settings.other) ?? frozen.get(settings.other),settings);
      },
      frozen(key) { return frozen.has(key); },
      drop(key) {
        if (!frozen.has(key)) return;
        gl.deleteTexture(frozen.get(key).object);
        frozen.delete(key);
      }
    };

    const observer = new ResizeObserver(request);
    function request() {
      if (frame || events.signal.aborted) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!events.signal.aborted) canvas.requestPaint();
      });
    }

    function dispose() {
      if (events.signal.aborted) return false;
      events.abort();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      for (const data of textures.values()) gl.deleteTexture(data.object);
      for (const key of frozen.keys()) scene.drop(key);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      return true;
    }

    function stop(message) {
      if (dispose()) fallback(message);
    }

    function paint() {
      try {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        if (!width || !height) return;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(width * ratio), h = Math.round(height * ratio);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.clearColor(.05, .085, .11, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const [element, data] of textures) upload(element, data);
        updated = new Set();
        render(scene, width, height);
        for (const element of registered) {
          if (!updated.has(element)) scene.unregister(element);
        }
        registered = updated;
        check();
        if (firstFrame) {
          firstFrame = false;
          clearTimeout(timer);
          ready();
        }
      } catch (error) {
        stop('The browser could not draw the live texture. The controls are available in the plain HTML view.');
      }
    }

    const timer = setTimeout(() => stop('The live texture did not start. The controls are available in the plain HTML view.'), 3000);
    canvas.addEventListener('paint', paint, options);
    canvas.addEventListener('webglcontextlost', () => stop('WebGL stopped. The controls are available in the plain HTML view.'), options);
    observer.observe(canvas);
    request();
    return { request, dispose };
  }

  function save(canvas, filename) {
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 'image/png');
  }

  return { open, corners, save };
})();
