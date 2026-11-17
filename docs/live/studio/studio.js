'use strict';
(() => {
  const view = document.querySelector('#experiment');
  const nav = document.querySelector('nav');
  const preserve = { preserveElementGeometry: true };
  const $ = id => view.querySelector('#' + id);
  const value = id => $(id).value;
  const checked = id => $(id).checked;
  let dispose = () => {};

  function fit(source, x, y, width, height, limit = 2) {
    const scale = Math.min(width / source.offsetWidth, height / source.offsetHeight, limit);
    const w = source.offsetWidth * scale;
    const h = source.offsetHeight * scale;
    return { x: x + (width - w) / 2, y: y + (height - h) / 2, w, h, scale };
  }

  function fill(ctx, color, ...box) {
    ctx.fillStyle = color;
    ctx.fillRect(...box);
  }

  function text(ctx, label, x, y, width, color = '#eedcc5') {
    ctx.fillStyle = color;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y, width);
  }

  function draw(ctx, source, box) {
    ctx.drawElementImage(source, box.x, box.y, box.w, box.h, preserve);
  }

  function live(ctx, canvas, source, box) {
    draw(ctx, source, box);
    canvas.updateElementGeometry(source, { canvasTransform: new DOMMatrix().translate(box.x, box.y).scale(box.scale) });
  }

  function circle(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function polygon(ctx, color, points) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function areas(w, h) {
    if (w >= 630) return [[16, 41, (w - 52) / 2, h - 64], [w / 2 + 10, 41, (w - 52) / 2, h - 64]];
    return [[12, 32, w - 24, (h - 76) / 2], [12, (h + 14) / 2, w - 24, (h - 76) / 2]];
  }

  function readPaint(ctx, snapshot, width, height) {
    // Chrome binds native snapshots to their owning canvas. Read the stage
    // before composing the visible artwork in the same paint callback.
    ctx.save();
    ctx.resetTransform();
    draw(ctx, snapshot, { x: 0, y: 0, w: width, h: height });
    const pixels = ctx.getImageData(0, 0, width, height);
    ctx.restore();
    return pixels;
  }

  function print(canvas, source) {
    const width = source.offsetWidth;
    const height = source.offsetHeight;
    const blue = new OffscreenCanvas(width, height).getContext('2d');
    const red = new OffscreenCanvas(width, height).getContext('2d');
    let sampleWidth = 0;
    let sampleHeight = 0;
    function ink(ctx, snapshot, w, h) {
      const original = readPaint(ctx, snapshot, w, h);
      sampleWidth = w;
      sampleHeight = h;
      const plates = [[blue, [24, 48, 92], 0.98], [red, [205, 58, 45], 0.74]];
      for (const [plate, rgb, gain] of plates) {
        const image = plate.createImageData(w, h);
        for (let i = 0; i < original.data.length; i += 4) {
          const lum = 0.2126 * original.data[i] + 0.7152 * original.data[i + 1] + 0.0722 * original.data[i + 2];
          image.data.set(rgb, i);
          image.data[i + 3] = lum < 182 ? (1 - lum / 255) * gain * original.data[i + 3] : 0;
        }
        plate.putImageData(image, 0, 0);
      }
    }
    return (ctx, w, h, snapshot, changed) => {
      const ratio = Math.min(1, canvas.width / width, canvas.height / height);
      const sampleW = Math.max(1, Math.floor(ratio * width));
      const sampleH = Math.max(1, Math.floor(ratio * height));
      if (changed || sampleW !== sampleWidth || sampleH !== sampleHeight) ink(ctx, snapshot, sampleW, sampleH);
      const [a, b] = areas(w, h);
      const original = fit(source, ...a, 1.16);
      const proof = fit(source, ...b, 1.16);
      const offset = Number(value('offset'));
      $('measure').textContent = offset + ' px';
      fill(ctx, '#292427', 0, 0, w, h);
      text(ctx, 'EDITABLE MASTER', a[0], a[1] - 22, a[2]);
      text(ctx, 'BLUE / RED OVERPRINT', b[0], b[1] - 22, b[2]);
      live(ctx, canvas, source, original);
      fill(ctx, '#fff1cb', proof.x, proof.y, proof.w, proof.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(proof.x, proof.y, proof.w, proof.h);
      ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(blue.canvas, 0, 0, sampleWidth, sampleHeight, proof.x, proof.y, proof.w, proof.h);
      ctx.drawImage(red.canvas, 0, 0, sampleWidth, sampleHeight, proof.x + offset * proof.scale, proof.y + offset * proof.scale / 3, proof.w, proof.h);
      ctx.restore();
    };
  }

  function motion(canvas, source) {
    return (ctx, w, h, snapshot) => {
      fill(ctx, '#161629', 0, 0, w, h);
      const edit = fit(source, 14, 32, w - 28, 116, 1.12);
      text(ctx, 'EDITABLE TITLE', 16, 13, w - 32);
      live(ctx, canvas, source, edit);
      const sw = Math.min(w * 0.52, 315);
      const sh = sw * source.offsetHeight / source.offsetWidth;
      const left = 18;
      const track = w - sw - left * 2;
      const top = 204;
      const travel = h - top - sh - 34;
      const position = frame => {
        const phase = 1 - Math.abs((frame + 120) % 120 - 60) / 60;
        const t = value('ease') === 'linear' ? phase : phase * phase * (3 - 2 * phase);
        return { x: left + track * t, y: top + (1 - Math.sin(t * Math.PI)) * travel, w: sw, h: sh };
      };
      ctx.strokeStyle = '#6b557c';
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const p = position(i);
        const x = p.x + p.w / 2;
        const y = p.y + p.h / 2;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const frame = Number(value('frame'));
      text(ctx, 'ONION SKINS  ·  FRAME ' + String(frame).padStart(3, '0'), 16, 168, w - 32, '#ffd991');
      for (const lag of [24, 16, 8, 0]) {
        ctx.globalAlpha = lag ? (32 - lag) / 88 : 1;
        draw(ctx, snapshot, position(frame - lag));
      }
      ctx.globalAlpha = 1;
    };
  }

  const chapters = {
    opening: ['THE TRANSMISSION', 'A voice in the fog', 'A radio crackles from the stairwell. A ferry asks for a signal, but the lighthouse lamp has gone dark.', 'Light the lantern', 'Answer the radio', 'light', 'radio'],
    light: ['THE LANTERN', 'Three short flashes', 'The ferry turns toward your flashing lantern. A second light appears closer to the rocks.', 'Guide the ferry', 'Investigate the second light', 'ferry', 'rescue'],
    radio: ['THE RADIO', 'A second signal', 'The radio operator hears a rowing boat. The ferry can wait offshore, but the rower needs a direction now.', 'Call the ferry over', 'Guide the rower in', 'ferry', 'rescue'],
    ferry: ['ENDING / SAFE PASSAGE', 'The channel opens', 'You guide the ferry between the rocks. At dawn, its deck lights blink once in thanks.', 'Tell the story again', '', 'opening'],
    rescue: ['ENDING / SMALL LIGHTS', 'The keeper’s welcome', 'A rower follows the glow to the harbor steps. The ferry answers with one long note from offshore.', 'Tell the story again', '', 'opening']
  };

  function story(canvas, source, update) {
    let scene = 'opening';
    function go(next) {
      scene = next;
      const [chapter, title, paragraph, first, second] = chapters[scene];
      $('chapter').textContent = chapter;
      $('scene-title').textContent = title;
      $('scene-text').textContent = paragraph;
      $('first').textContent = first;
      $('second').textContent = second;
      $('second').hidden = !second;
      update();
    }
    $('restart').addEventListener('click', () => go('opening'));
    $('first').addEventListener('click', () => go(chapters[scene][5]));
    $('second').addEventListener('click', () => go(chapters[scene][6]));
    return (ctx, w, h) => {
      const lit = scene !== 'opening';
      const warm = ['light', 'rescue'].includes(scene);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, warm ? '#593e56' : '#182a47');
      sky.addColorStop(1, '#161823');
      fill(ctx, sky, 0, 0, w, h);
      const x = w * 0.26;
      const y = h * 0.23;
      circle(ctx, w * 0.77, h * 0.17, 31, warm ? '#ffd699' : '#a3bdc2');
      polygon(ctx, '#101623', [[0,h * .49],[w*.2,h*.36],[w*.44,h*.49],[w,h*.44],[w,h],[0,h]]);
      for (let i = 0; i < 7; i++) {
        fill(ctx, i % 2 ? '#293849' : '#495268', (i * 107) % w, h * .56 + i * 23, 44 + i * 7, 2);
      }
      polygon(ctx, '#d8bcac', [[x-19,y+147],[x-13,y+4],[x+13,y+4],[x+23,y+147]]);
      polygon(ctx, '#af6659', [[x-15,y+24],[x+15,y+24],[x+17,y+47],[x-16,y+47]]);
      polygon(ctx, '#201b28', [[x-22,y+4],[x,y-20],[x+22,y+4]]);
      if (lit) {
        polygon(ctx, warm ? '#fbc37174' : '#b2e5d670', [[x,y+10],[w,y-58],[w,y+84]]);
        circle(ctx, x, y+10, 8, '#ffdc92');
      }
      const box = w < 630 ? fit(source, 9, h*.46, w-18, h*.52) : fit(source, w*.43, h*.31, w*.54, h*.63, 1.3);
      live(ctx, canvas, source, box);
    };
  }

  function comic(canvas, source) {
    const balloon = source.querySelector('.balloon');
    return (ctx, w, h) => {
      const box = fit(source, 12, 13, w - 24, h - 26);
      fill(ctx, '#211c28', 0, 0, w, h);
      live(ctx, canvas, source, box);
      if (!checked('lettering')) {
        balloon.inert = true;
        canvas.clearElementGeometry(balloon);
        return;
      }
      balloon.inert = false;
      const isPilot = value('speaker') === 'pilot';
      const anchor = box.x + box.w * (isPilot ? .23 : .77);
      const balloonX = box.x + box.w * (isPilot ? .07 : .49);
      const label = fit(balloon, balloonX, box.y + box.h * .19, box.w * .44, box.h * .37);
      const base = Math.min(label.x + label.w * .79, Math.max(label.x + label.w * .2, anchor));
      polygon(ctx, '#1b1528', [[base-12,label.y+label.h-3],[base+13,label.y+label.h-3],[anchor,box.y+box.h*.65]]);
      polygon(ctx, '#fff2ce', [[base-7,label.y+label.h-4],[base+8,label.y+label.h-4],[anchor,box.y+box.h*.62]]);
      live(ctx, canvas, balloon, label);
    };
  }

  function sign(canvas, source) {
    let lastCols = 0;
    let pixels;
    return (ctx, w, h, snapshot, changed) => {
      const cols = Number(value('resolution'));
      const rows = Math.round(cols * .31);
      if (changed || cols !== lastCols) {
        pixels = readPaint(ctx, snapshot, cols, rows).data;
        lastCols = cols;
      }
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#233744');
      sky.addColorStop(1, '#12131e');
      fill(ctx, sky, 0, 0, w, h);
      circle(ctx, w*.79, 53, 32, '#ddbd96');
      const width = Math.min(w - 32, 620);
      const cell = width / cols;
      const x = (w - width) / 2;
      const y = 83;
      const ledHeight = rows * cell;
      for (let i = 0; i < Math.ceil(w/75); i++) {
        const top = y + ledHeight * (.8 + (i % 4) * .13);
        fill(ctx, i % 2 ? '#2b2c39' : '#1d2533', i*75, top, 47 + i % 3 * 9, h-top);
        fill(ctx, '#6a5357', i*75+9, top+18, 5, 6);
      }
      fill(ctx, '#0b1017', x-6, y-6, width+12, ledHeight+12);
      const broken = checked('defect') ? Math.floor(cols * .61) : -1;
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const i = (iy * cols + ix) * 4;
          const color = ix === broken ? '#0d1822' : 'rgb(' + pixels[i] + ' ' + pixels[i+1] + ' ' + pixels[i+2] + ')';
          circle(ctx, x + (ix + .5) * cell, y + (iy + .5) * cell, cell * .385, color);
        }
      }
      text(ctx, cols + ' × ' + rows + ' LED CELLS', x, y-25, width);
      const editorTop = y + ledHeight + 44;
      text(ctx, 'EDITABLE ARTWORK', x, editorTop-19, width);
      live(ctx, canvas, source, fit(source, x, editorTop, width, h-editorTop-15, 1.1));
    };
  }

  const scenes = { print, motion, story, comic, sign };

  function open() {
    dispose();
    const requested = location.hash.slice(1);
    const key = Object.hasOwn(scenes, requested) ? requested : 'print';
    view.className = 'studio-' + key;
    view.replaceChildren(document.getElementById(key).content.cloneNode(true));
    for (const link of nav.querySelectorAll('a')) link.toggleAttribute('aria-current', link.hash === '#' + key);
    nav.querySelector('[aria-current]').setAttribute('aria-current', 'page');

    const canvas = view.querySelector('canvas');
    const source = canvas.firstElementChild;
    const status = view.querySelector('.status');
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: key === 'print' || key === 'sign' });
    let observer, timeout, snapshot, raf, visible = true, lastTime = 0, saveUrl;
    let paused = true;
    const listeners = new AbortController();
    const on = (target, name, handle) => target.addEventListener(name, handle, { signal: listeners.signal });
    dispose = () => {
      listeners.abort();
      observer?.disconnect();
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
      snapshot?.close();
      if (saveUrl) URL.revokeObjectURL(saveUrl);
    };
    const update = () => { if (!canvas.hidden) canvas.requestPaint(); };
    function fallback(reason) {
      dispose();
      const plain = view.querySelector('.plain');
      for (const node of source.querySelectorAll('[inert]')) node.inert = false;
      plain.append(source);
      plain.hidden = false;
      canvas.hidden = true;
      for (const control of view.querySelectorAll('.controls :is(input, select, button):not(#restart)')) control.disabled = true;
      status.textContent = reason + ' The original HTML is available below the controls.';
    }
    const renderScene = scenes[key];
    const supported = typeof ctx?.drawElementImage === 'function' && typeof canvas.requestPaint === 'function' &&
      typeof canvas.updateElementGeometry === 'function' && typeof canvas.captureElementImage === 'function';
    let render;
    try {
      render = (supported || key === 'story') && renderScene(canvas, source, update);
    } catch {
      fallback('Native image processing is unavailable.'); return;
    }
    if (!supported) { fallback('Native HTML-in-Canvas is unavailable.'); return; }

    const needsSnapshot = ['print', 'motion', 'sign'].includes(key);
    on(canvas, 'paint', event => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      try {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.round(w * dpr), height = Math.round(h * dpr);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        ctx.setTransform(width/w, 0, 0, height/h, 0, 0);
        const changed = needsSnapshot && (!snapshot || !event.changedElements || event.changedElements.includes(source));
        if (changed) {
          snapshot?.close();
          snapshot = canvas.captureElementImage(source);
        }
        render(ctx, w, h, snapshot, changed);
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
          status.textContent = 'Live browser paint';
        }
      } catch {
        fallback('Native scene rendering is unavailable in this browser.');
      }
    });

    on(view, 'input', update);
    on(view, 'change', update);
    for (const save of view.querySelectorAll('[data-save]')) {
      on(save, 'click', () => {
        canvas.toBlob(blob => {
          if (!blob || listeners.signal.aborted) return;
          if (saveUrl) URL.revokeObjectURL(saveUrl);
          saveUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = saveUrl;
          link.download = 'canvas-studio-' + key + '.png';
          link.click();
        });
      });
    }
    if (key === 'motion') {
      const play = $('play');
      function tick(time) {
        raf = undefined;
        if (paused || !visible) return;
        if (!lastTime || time - lastTime >= 42) {
          lastTime = time;
          const frame = $('frame');
          frame.value = (Number(frame.value) + 1) % 120;
          update();
        }
        raf = requestAnimationFrame(tick);
      }
      on(play, 'click', () => {
        paused = !paused;
        play.setAttribute('aria-pressed', String(!paused));
        play.textContent = paused ? 'Play' : 'Pause';
        if (!paused && !raf) raf = requestAnimationFrame(tick);
      });
      on(document, 'visibilitychange', () => {
        visible = !document.hidden;
        if (visible && !paused && !raf) raf = requestAnimationFrame(tick);
      });
    }
    observer = new ResizeObserver(update);
    observer.observe(canvas);
    timeout = setTimeout(() => fallback('No native canvas paint arrived.'), 4000);
    update();
  }
  window.addEventListener('hashchange', open);
  open();
})();
