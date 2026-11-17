'use strict';
(() => {
  const scene = document.querySelector('#scene');
  const links = [...document.querySelectorAll('nav a')];
  const preserve = { preserveElementGeometry: true };
  const motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const width = 720;
  let dispose = () => {};

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function rect(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function label(ctx, text, x, y, size, color, family = 'monospace') {
    ctx.fillStyle = color;
    ctx.font = '700 ' + size + 'px ' + family;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function ellipse(ctx, color, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function paint(ctx, element, x, y, w, h) {
    ctx.drawElementImage(element, x, y, w, h, preserve);
  }

  function live({ canvas, ctx, cssScale }, element, x, y, scale = 1, clip) {
    paint(ctx, element, x, y, scale * element.offsetWidth, scale * element.offsetHeight);
    const canvasTransform = new DOMMatrix().scale(cssScale).translate(x, y).scale(scale);
    canvas.updateElementGeometry(element, clip ? { canvasTransform, canvasClip: clip } : { canvasTransform });
  }

  function sample(ctx, element, w, h, background) {
    // Native paint belongs to this canvas. Use its backing store before drawing the scene.
    ctx.save();
    ctx.resetTransform();
    rect(ctx, background, 0, 0, w, h);
    paint(ctx, element, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    ctx.restore();
    return data;
  }

  function createSession() {
    const listener = new AbortController();
    const cleanups = [];
    const status = scene.querySelector('.status');
    const canvases = [...scene.querySelectorAll('canvas')];
    const $ = id => scene.querySelector('#' + id);
    function on(element, event, handler) {
      element.addEventListener(event, handler, { signal: listener.signal });
    }
    function stop() {
      if (listener.signal.aborted) return;
      listener.abort();
      for (const cleanup of cleanups) cleanup();
    }
    function fail(message) {
      if (listener.signal.aborted) return;
      stop();
      const plain = document.createElement('div');
      plain.className = 'plain';
      plain.append(...canvases[0].children);
      canvases[0].before(plain);
      for (const canvas of canvases) canvas.hidden = true;
      for (const exhibit of scene.querySelectorAll('.exhibits')) exhibit.hidden = true;
      for (const control of scene.querySelectorAll('.controls :is(button,input,select)')) control.disabled = true;
      setText(status, message + ' The editable HTML is available in plain view.');
    }
    function stage(canvas, logicalWidth, painter, readback = false) {
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: readback });
      if (typeof ctx?.drawElementImage !== 'function' || typeof canvas.requestPaint !== 'function' ||
          typeof canvas.updateElementGeometry !== 'function') {
        fail('Native HTML-in-Canvas is unavailable.');
        return;
      }
      const request = () => { if (!listener.signal.aborted) canvas.requestPaint(); };
      const resize = new ResizeObserver(request);
      resize.observe(canvas);
      const watchdog = setTimeout(() => fail('The browser did not paint the scene.'), 4000);
      cleanups.push(() => { resize.disconnect(); clearTimeout(watchdog); });
      on(canvas, 'paint', () => {
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;
        if (!cssWidth || !cssHeight) return;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = Math.round(cssWidth * dpr);
        const h = Math.round(cssHeight * dpr);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const cssScale = cssWidth / logicalWidth;
        const logicalHeight = cssHeight / cssScale;
        ctx.setTransform(w/logicalWidth, 0, 0, h/logicalHeight, 0, 0);
        try {
          painter({ canvas, ctx, cssScale, height: logicalHeight });
          clearTimeout(watchdog);
          setText(status, 'Live browser paint');
        } catch (error) {
          console.error(error);
          fail('The browser could not compose the native scene.');
        }
      });
      request();
      return request;
    }
    function animate(tick) {
      let frame;
      let last = 0;
      function next(time) {
        if (!document.hidden && time - last >= 29) {
          last = time;
          tick(time);
        }
        if (!listener.signal.aborted) frame = requestAnimationFrame(next);
      }
      frame = requestAnimationFrame(next);
      cleanups.push(() => cancelAnimationFrame(frame));
    }
    return { canvases, $, on, stage, animate, stop, fail, get stopped() { return listener.signal.aborted; } };
  }

  function rain(ui) {
    const headline = ui.$('headline');
    const toggle = ui.$('rain-play');
    const cell = 4, cols = 180, rows = 121;
    const x0 = 60, y0 = 132;
    const water = new Uint8Array(cols * rows);
    const ink = new Uint8Array(water.length);
    let running = !motionReduced;
    let headlinePaint;
    let step = 0;
    let seed = 914;
    function random() {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    function flow() {
      const drops = Number(ui.$('rain-rate').value) * 10;
      for (let n = 0; n < drops; n++) water[Math.floor(random() * (cols - 32)) + 16] = 1;
      water.fill(0, cols * (rows - 1));
      const flip = step++ % 2;
      for (let y = rows - 2; y >= 0; y--) {
        for (let j = 1; j < cols - 1; j++) {
          const x = flip ? cols - j - 1 : j;
          const i = y * cols + x;
          if (!water[i]) continue;
          const below = i + cols;
          let next = below;
          if (ink[next] || water[next]) {
            const side = random() < 0.5 ? -1 : 1;
            next = below + side;
            if (ink[next] || water[next] || (ink[below] && ink[i + side])) next = below - side;
            if (ink[next] || water[next] || (ink[below] && ink[i + next - below])) continue;
          }
          water[next] = 1;
          water[i] = 0;
        }
      }
    }
    function primeCounters() {
      // Find paper reachable from the edge. Ink-enclosed counters are the cells left over.
      const open = new Uint8Array(ink.length);
      const queue = new Int32Array(ink.length);
      open[0] = 1;
      let end = 1;
      for (let start = 0; start < end; start++) {
        const i = queue[start];
        const x = i % cols;
        const adjacent = [
          x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1,
          i >= cols ? i - cols : -1, i + cols < ink.length ? i + cols : -1
        ];
        for (const cell of adjacent) {
          if (cell < 0 || ink[cell] || open[cell]) continue;
          open[cell] = 1;
          queue[end++] = cell;
        }
      }
      for (let i = 0; i < water.length; i++) {
        if (!ink[i] && !open[i]) water[i] = 1;
      }
    }
    function replaceInk(ctx) {
      const sampleWidth = headline.offsetWidth / cell;
      const sampleHeight = headline.offsetHeight / cell;
      const pixels = sample(ctx, headline, sampleWidth, sampleHeight, '#f4e9cf');
      const next = new Uint8Array(ink.length);
      for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
          const s = (y * sampleWidth + x) * 4;
          if (pixels[s] + pixels[s + 1] + pixels[s + 2] < 370) {
            next[(y + y0 / cell) * cols + x + x0 / cell] = 1;
          }
        }
      }
      const first = headlinePaint === undefined;
      headlinePaint = headline.value;
      ink.set(next);
      if (first && running) {
        primeCounters();
        for (let i = 0; i < 83; i++) flow();
      }
    }
    const draw = ui.stage(ui.canvases[0], width, frame => {
      const { ctx, height } = frame;
      if (headline.value !== headlinePaint) replaceInk(ctx);
      const paper = ctx.createLinearGradient(0, 0, width, height);
      paper.addColorStop(0, '#faf0d6');
      paper.addColorStop(.61, '#ecdfbd');
      paper.addColorStop(1, '#c6b491');
      rect(ctx, paper, 0, 0, width, height);
      for (let i = 0; i < 1520; i++) {
        rect(ctx, i % 2 ? '#50402513' : '#ffffe342', i * 7919 % 719, i * 1999 % 483, 2 + i % 3, 1);
      }
      label(ctx, 'THE LOWLANDS GAZETTE', 32, 28, 39, '#342331', 'Georgia');
      label(ctx, 'STORM EDITION     /     VOL. IX     /     TWO PENNIES', 34, 78, 16, '#734633');
      rect(ctx, '#9b5a48', 32, 111, 656, 2);
      rect(ctx, '#9b5a48', 32, 358, 656, 2);
      for (let i = 0; i < 3; i++) {
        label(ctx, ['RIVER WATCH', 'PRESS NOTES', 'AT THE WHARF'][i], 35+i*223, 375, 16, '#513b39');
        for (let j = 0; j < 6; j++) rect(ctx, '#7a6a5660', 35+i*223, 404+j*9, 182-(i*19+j*31)%33, 2);
      }
      live(frame, headline, x0, y0);
      let rests = 0;
      ctx.fillStyle = '#227aa4b3';
      for (let i = 0; i < water.length; i++) {
        if (!water[i]) continue;
        const y = Math.floor(i / cols);
        const x = i % cols;
        const resting = !!ink[i+cols] || !!water[i+cols];
        ctx.fillRect(x * cell + 1, y * cell, resting ? 4 : 2, resting ? 3 : 6);
        if (resting && y >= y0 / cell && y < 87) rests++;
      }
      setText(ui.$('rain-total'), rests + ' drops resting at the headline');
    }, true);
    if (!draw) return;
    function showState() {
      toggle.setAttribute('aria-pressed', String(running));
      setText(toggle, running ? 'Pause rain' : 'Start rain');
    }
    showState();
    ui.on(toggle, 'click', () => { running = !running; showState(); });
    ui.on(headline, 'input', draw);
    ui.on(ui.$('rain-reset'), 'click', () => { water.fill(0); draw(); });
    ui.animate(() => {
      if (!running) return;
      flow();
      flow();
      draw();
    });
  }

  function comic(ui) {
    const pins = [0, 280];
    const template = document.querySelector('#panel');
    const panels = ui.canvases.map(canvas => {
      const panel = template.content.firstElementChild.cloneNode(true);
      canvas.append(panel);
      return panel;
    });
    const rendering = ui.canvases.map((canvas, index) => ui.stage(canvas, index ? 440 : width, frame => {
      const { ctx, height } = frame;
      rect(ctx, '#2c2434', 0, 0, index ? 440 : width, height);
      if (index) {
        const left = pins[index - 1];
        const crop = new DOMRect(left, 0, 440, 390);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 440, 390);
        ctx.clip();
        live(frame, panels[index], -left, 0, 1, crop);
        ctx.restore();
      } else {
        live(frame, panels[index], 0, 0);
        const left = Number(ui.$('camera').value);
        rect(ctx, '#21182a91', 0, 0, left, height);
        rect(ctx, '#21182a91', left+440, 0, width-left-440, height);
        ctx.strokeStyle = '#fff0a5';
        ctx.lineWidth = 3;
        ctx.setLineDash([11, 7]);
        ctx.strokeRect(left+2, 2, 436, height-4);
        ctx.setLineDash([]);
      }
    }));
    if (ui.stopped) return;
    ui.on(ui.$('camera'), 'input', rendering[0]);
    for (const [index,id] of ['pin-a','pin-b'].entries()) {
      ui.on(ui.$(id), 'click', () => {
        pins[index] = Number(ui.$('camera').value);
        setText(ui.$(index ? 'label-b' : 'label-a'), 'Exhibit ' + (index ? 'B' : 'A') + ' · ' + (pins[index] < 140 ? 'left' : 'right') + ' crop');
        rendering[index+1]();
      });
    }
    ui.on(ui.$('save-exhibits'), 'click', () => {
      const [,a,b] = ui.canvases;
      const sheet = document.createElement('canvas');
      sheet.width = 916;
      sheet.height = 459;
      const ctx = sheet.getContext('2d');
      rect(ctx, '#2c2434', 0, 0, sheet.width, sheet.height);
      label(ctx, 'EXHIBIT A', 12, 18, 16, '#fce6ba');
      label(ctx, 'EXHIBIT B', 464, 18, 16, '#fce6ba');
      ctx.drawImage(a, 12, 45, 440, 390);
      ctx.drawImage(b, 464, 45, 440, 390);
      sheet.toBlob(blob => {
        if (!blob || ui.stopped) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'fountain-incident.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      });
    });
    for (const panel of panels) {
      ui.on(panel, 'input', ({ target }) => {
        if (!target.matches('textarea[data-line]')) return;
        for (const other of panels) {
          const field = other.querySelector('[data-line="' + target.dataset.line + '"]');
          if (field !== target) field.value = target.value;
        }
        for (const draw of rendering) draw();
      });
    }
  }

  function billboard(ui) {
    const left = ui.$('left-message').parentElement;
    const right = ui.$('right-message').parentElement;
    const x0 = 53, signWidth = 614, signHeight = 140;
    const sampleWidth = 180, sampleHeight = 51;
    const plates = [left, right];
    const textures = [];
    const content = [];
    const angle = ui.$('angle');
    const draw = ui.stage(ui.canvases[0], width, frame => {
      const { ctx, height } = frame;
      for (const [index, plate] of plates.entries()) {
        const current = plate.querySelector('input').value;
        if (current === content[index]) continue;
        textures[index] = sample(ctx, plate, sampleWidth, sampleHeight, '#171b24');
        content[index] = current;
      }
      const position = Number(angle.value);
      const mix = Math.min(1, Math.max(0, (position+18)/36));
      const tile = ctx.createLinearGradient(0, 0, 0, height);
      tile.addColorStop(0, '#2a363c');
      tile.addColorStop(.6, '#101b27');
      tile.addColorStop(1, '#382a37');
      rect(ctx, tile, 0, 0, width, height);
      for (let i = 0; i < 9; i++) rect(ctx, i % 2 ? '#516262' : '#3a4a50', i*90+15, 0, 2, 293);
      label(ctx, 'NORTH CONCOURSE', 54, 28, 23, '#c9ddc3');
      label(ctx, 'LENTICULAR WAYFINDING TEST', 54, 61, 14, '#a0babb');
      const y0 = 105;
      rect(ctx, '#0a0e17', x0-12, y0-12, signWidth+24, signHeight+24);
      const stripW = signWidth / sampleWidth;
      const pixelH = signHeight / sampleHeight;
      for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
          const i = (y * sampleWidth + x) * 4;
          const street = x % 2 === 1;
          const source = textures[street ? 1 : 0];
          const exposure = street ? mix : 1-mix;
          const gain = .065 + exposure * .935;
          const color = 'rgb(' + Math.round(source[i]*gain) + ',' + Math.round(source[i+1]*gain) + ',' + Math.round(source[i+2]*gain) + ')';
          rect(ctx, color, x0+x*stripW, y0+y*pixelH, stripW+.23, pixelH+.23);
        }
      }
      const pathY = 306;
      rect(ctx, '#89918d', 69, pathY, 582, 2);
      const mark = 69 + (position+60) / 120 * 582;
      ellipse(ctx, '#ffe2a8', mark, pathY+1, 7, 7);
      const side = mix < .05 ? 'Platform' : mix > .95 ? 'Street' : 'Both messages visible';
      label(ctx, side + ' · ' + position + '°', 60, 325, 20, '#f7dca9');
      label(ctx, 'EDIT THE TWO MESSAGE PLATES', 28, 368, 14, '#a0babb');
      live(frame, left, 28, 386, .98);
      live(frame, right, 370, 386, .98);
    }, true);
    if (!draw) return;
    ui.on(angle, 'input', draw);
    for (const plate of plates) ui.on(plate, 'input', draw);
    for (const button of scene.querySelectorAll('[data-angle]')) {
      ui.on(button, 'click', () => { angle.value = button.dataset.angle; draw(); });
    }
  }

  function theater(ui) {
    const canvas = ui.canvases[0];
    const script = ui.$('script-line');
    const glyphs = new Map();
    const stencils = new WeakMap();
    const marks = '?.!,;:…—';
    for (const face of ['serif', 'mono', 'sans']) {
      for (const mark of marks) {
        const node = document.createElement('div');
        node.className = 'punctuation';
        node.dataset.face = face;
        node.setAttribute('drawable', '');
        node.setAttribute('aria-hidden', 'true');
        node.inert = true;
        node.textContent = mark;
        glyphs.set(face + mark, node);
        canvas.append(node);
      }
    }
    let glyph = glyphs.get('serif?');
    const response = ui.$('stage-event');
    let stencil, actor, pending = false, shifted = 0;
    let started;
    const rock = { x:399, y:208 };
    const sampleWidth = 56, sampleHeight = 66;
    const actorWidth = 112, actorHeight = 132;
    const lastMark = () => script.value.match(/[?.!,;:…—]/gu)?.at(-1);
    let token = lastMark();
    function artwork(frame) {
      const { ctx, height } = frame;
      const surface = ctx.createRadialGradient(335, 205, 25, 335, 205, 345);
      surface.addColorStop(0, '#885458');
      surface.addColorStop(.62, '#43233d');
      surface.addColorStop(1, '#241527');
      rect(ctx, surface, 0, 0, width, height);
      for (let x=1; x<width; x+=19) {
        const nearEdge = x<96 || x>624;
        if (nearEdge) rect(ctx, x % 2 ? '#572338' : '#742d44', x, 0, 11, 329);
      }
      label(ctx, 'THE   TYPE   FOUNDRY', 216, 22, 28, '#f2cf99', 'Georgia');
      label(ctx, 'STAGE DOOR / ACT I', 259, 61, 14, '#cf9a7c');
      rect(ctx, '#311f2e', 0, 323, width, 30);
      rect(ctx, '#996763', 0, 326, width, 2);
      for (let x=0; x<width; x+=36) rect(ctx, '#634553', x, 337, 30, 2);
      const peg = rock.x + shifted;
      rect(ctx, '#624547', peg-2, 248, 111, 76);
      rect(ctx, '#a27864', peg-2, 248, 111, 4);
      ctx.strokeStyle = '#e6bc81';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(peg+9, 271);
      ctx.lineTo(peg, rock.y);
      ctx.stroke();
      ellipse(ctx, '#ffd190', peg, rock.y, 5, 5);
      label(ctx, 'SCENERY', peg+21, 281, 13, '#f6d498');
      if (actor) paint(ctx, glyph, actor.x, actor.y, actorWidth, actorHeight);
      else paint(ctx, glyph, 126, 117, actorWidth, actorHeight);
      live(frame, script.parentElement, 65, 354);
    }
    function syncGlyph() {
      token = lastMark();
      const face = ui.$('face').value;
      const next = glyphs.get(face + (token || '?'));
      if (next !== glyph) {
        glyph = next;
        actor = undefined;
        started = undefined;
        shifted = 0;
        setText(response, 'Scene ready.');
      }
      draw();
    }
    function repaint(frame) {
      if (!stencils.has(glyph)) stencils.set(glyph, sample(frame.ctx, glyph, sampleWidth, sampleHeight, '#000'));
      stencil = stencils.get(glyph);
      if (pending) {
        pending = false;
        if (!token) {
          setText(response, 'Add a punctuation mark to the script.');
        } else {
          started = performance.now();
          shifted = 0;
          actor = { x: 110, y: 88, hooked: false, nextStep: 0, grip: 0, token };
          setText(response, 'On stage · ' + token);
        }
      }
      artwork(frame);
    }
    const draw = ui.stage(ui.canvases[0], width, repaint, true);
    if (!draw) return;
    ui.on(script, 'input', syncGlyph);
    ui.on(ui.$('face'), 'change', syncGlyph);
    ui.on(ui.$('cue'), 'click', () => { pending = true; draw(); });
    ui.on(ui.$('reset-stage'), 'click', () => {
      started = undefined;
      pending = false;
      actor = null;
      shifted = 0;
      setText(response, 'Scene ready.');
      draw();
    });
    function hitsPeg(x, y) {
      const px = Math.floor((rock.x-x)*sampleWidth/actorWidth);
      const py = Math.floor((rock.y-y)*sampleHeight/actorHeight);
      if (px < 0 || py < 0 || px >= sampleWidth || py >= sampleHeight) return false;
      return stencil?.[(py * sampleWidth + px)*4] > 145;
    }
    ui.animate(time => {
      if (started === undefined || !actor || !stencil) return;
      const elapsed = Math.max(0, time - started);
      const t = Math.min(1, elapsed / 1560);
      if (actor.token === '?') {
        const x = 110 + 314*t;
        const y = 89 + 93*Math.sin(Math.PI*t*.74);
        // A hook needs sustained contact. Use fixed path increments so a
        // one-pixel graze cannot catch the peg at one frame rate and miss at another.
        const slices = 360;
        const lastStep = Math.floor(t * slices);
        for (; !actor.hooked && actor.nextStep <= lastStep; actor.nextStep++) {
          const k = actor.nextStep / slices;
          const probeX = 110 + 314*k;
          const probeY = 89 + 93*Math.sin(Math.PI*k*.74);
          actor.grip = hitsPeg(probeX, probeY) ? actor.grip + 1 : 0;
          if (actor.grip === 3) {
            actor.hooked = true;
            actor.contact = probeX;
            setText(response, 'The painted edge caught the peg.');
          }
        }
        actor.x = x;
        actor.y = y;
        if (actor.hooked) shifted = Math.min(105, x-actor.contact);
      } else {
        actor.x = 190;
        actor.y = 88 + 129*t*t;
      }
      if (t === 1) {
        started = undefined;
        if (!actor.hooked) setText(response, actor.token === '?' ? 'The painted edge missed the peg.' : 'The punctuation landed.');
      }
      draw();
    });
  }

  const experiments = { rain, comic, sign: billboard, theater };
  function open() {
    dispose();
    const requested = location.hash.slice(1);
    const key = Object.hasOwn(experiments, requested) ? requested : 'rain';
    scene.replaceChildren(document.getElementById(key).content.cloneNode(true));
    for (const link of links) {
      if (link.hash === '#' + key) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const ui = createSession();
    dispose = ui.stop;
    try {
      experiments[key](ui);
    } catch (error) {
      console.error(error);
      ui.fail('The experiment could not initialize.');
    }
  }
  window.addEventListener('hashchange', open);
  open();
})();
