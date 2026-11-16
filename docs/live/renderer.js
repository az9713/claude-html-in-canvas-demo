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
      vec4 left = texture(uLeft, vUv);
      if (uMode == 0) {
        pixel = left;
        return;
      }
      vec4 right = texture(uRight, vUv);
      if (uMode == 1) {
        float divider = 1.0 - smoothstep(0.001, 0.004, abs(vUv.x - uWipe));
        pixel = mix(vUv.x < uWipe ? left : right, vec4(0.52, 0.94, 0.82, 1.0), divider);
        return;
      }
      vec3 change = abs(left.rgb - right.rgb);
      float intensity = smoothstep(0.035, 0.32, max(change.r, max(change.g, change.b)));
      float backdrop = dot(right.rgb, vec3(0.21, 0.72, 0.07));
      pixel = vec4(mix(vec3(backdrop * 0.37 + 0.06), vec3(1.0, 0.57, 0.19), intensity), 1.0);
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
    let renderer;
    try {
      const gl = canvas.getContext('webgl2', {alpha:false, antialias:true, preserveDrawingBuffer:true});
      if (!gl || typeof gl.texElementSubImage2D !== 'function' ||
          typeof canvas.updateElementGeometry !== 'function' || typeof canvas.clearElementGeometry !== 'function' ||
          typeof canvas.requestPaint !== 'function') {
        fallback('HTML-in-Canvas is unavailable here. The controls still work in the plain HTML view.');
        return null;
      }
      renderer = setup(gl, canvas, panels, render, ready, fallback);
      return renderer;
    } catch (error) {
      fallback('The canvas could not start. The controls are available in the plain HTML view.');
      return null;
    }
  }

  function setup(gl, canvas, panels, render, ready, fallback) {
    const program = programFor(gl);
    const buffer = gl.createBuffer();
    const textures = new Map(panels.map(element => [element, {object:gl.createTexture(), width:0, height:0}]));
    const events = new AbortController();
    const options = {signal:events.signal};
    let width = 0, height = 0, frame = 0, firstFrame = true;
    const uniforms = Object.fromEntries(['uLeft','uRight','uMode','uWipe','uColor']
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

    function draw(points, mode, color, left, right, wipe) {
      const uv = [[0,1], [0,0], [1,1], [1,0]];
      const vertices = new Float32Array(points.flatMap(({x,y,w}, i) => [
        2*x/width-w, w-2*y/height, 0, w, ...uv[i]
      ]));
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
      gl.uniform1i(uniforms.uMode, mode);
      gl.uniform1f(uniforms.uWipe, wipe ?? .5);
      if (color) gl.uniform4fv(uniforms.uColor, color);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures.get(left ?? panels[0]).object);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures.get(right ?? left ?? panels[0]).object);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const scene = {
      surface(element, matrix, { mode = 0, other, wipe } = {}) {
        draw(corners(matrix, element.offsetWidth, element.offsetHeight), mode, null, element, other, wipe);
      },
      solid(points, color) { draw(points, 3, color); },
      grid() { draw(corners(new DOMMatrix(), width, height), 4); },
      register(element, matrix) { canvas.updateElementGeometry(element, {canvasTransform:matrix}); },
      unregister(element) { canvas.clearElementGeometry(element); }
    };

    const observer = new ResizeObserver(request);
    function request() {
      if (frame || events.signal.aborted) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!events.signal.aborted) canvas.requestPaint();
      });
    }

    function stop(message) {
      if (events.signal.aborted) return;
      events.abort();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      for (const data of textures.values()) gl.deleteTexture(data.object);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      fallback(message);
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
        render(scene, width, height);
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
    return { request };
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
