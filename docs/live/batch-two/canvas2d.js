'use strict';

window.NativeCanvas2D = (() => {
  const preserve = {preserveElementGeometry:true};

  function open(canvas, {render, ready, fallback}) {
    const ctx = canvas.getContext('2d',{alpha:false,willReadFrequently:true});
    if (!ctx || typeof ctx.drawElementImage !== 'function' ||
        typeof canvas.captureElementImage !== 'function' || typeof canvas.requestPaint !== 'function' ||
        typeof canvas.updateElementGeometry !== 'function' || typeof canvas.clearElementGeometry !== 'function') {
      fallback('Native element capture is unavailable here. The source controls are open in HTML.');
      return null;
    }
    const frozen = new Map(), events = new AbortController();
    const options = {signal:events.signal};
    const observer = new ResizeObserver(request);
    let frame = 0, painted = false, width, height, rx, ry;
    let registered = new Set(), updated = new Set();

    function resetTransform() { ctx.setTransform(rx,0,0,ry,0,0); }

    function blit(asset, matrix, settings = {}) {
      const {source, cssWidth, cssHeight} = asset;
      ctx.save();
      ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
      ctx.globalAlpha = settings.opacity ?? 1;
      ctx.globalCompositeOperation = settings.blend ?? 'source-over';
      if (settings.uv) {
        const [x,y,w,h] = settings.uv;
        const size = asset.size ?? canvas.getElementImageDefaultSize?.(source);
        const iw = size?.width ?? cssWidth*rx, ih = size?.height ?? cssHeight*ry;
        ctx.drawElementImage(source,x*iw,y*ih,w*iw,h*ih,0,0,cssWidth,cssHeight,preserve);
      } else {
        ctx.drawElementImage(source,0,0,cssWidth,cssHeight,preserve);
      }
      ctx.restore();
    }

    const scene = {
      grid() {
        ctx.fillStyle = '#0d1721';
        ctx.fillRect(0,0,width,height);
        ctx.strokeStyle = '#253a48';
        ctx.lineWidth = .7;
        ctx.beginPath();
        for (let x=0; x<width; x+=24) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
        for (let y=0; y<height; y+=24) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
        ctx.stroke();
      },
      surface(source, matrix, settings) {
        blit({source,cssWidth:source.offsetWidth,cssHeight:source.offsetHeight},matrix,settings);
      },
      freeze(key, element) {
        scene.drop(key);
        const source = canvas.captureElementImage(element);
        frozen.set(key,{source,cssWidth:element.offsetWidth,cssHeight:element.offsetHeight,
          size:{width:source.width,height:source.height}});
      },
      frozen(key) { return frozen.has(key); },
      snapshot(key, matrix, settings) {
        if (frozen.has(key)) blit(frozen.get(key),matrix,settings);
      },
      drop(key) {
        frozen.get(key)?.source?.close?.();
        frozen.delete(key);
      },
      register(element,matrix,clip) {
        updated.add(element);
        canvas.updateElementGeometry(element,{canvasTransform:matrix,...(clip ? {canvasClip:clip} : {})});
      },
      clip(x,y,w,h,draw) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
        try { draw(); } finally { ctx.restore(); }
      },
      box(x,y,w,h,color) {
        ctx.fillStyle=color;
        ctx.fillRect(x,y,w,h);
      },
      line(x,y,x2,y2,color,lineWidth=1) {
        ctx.strokeStyle=color; ctx.lineWidth=lineWidth;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
      },
      text(value,x,y,maxWidth=200,color='#bed0d7') {
        ctx.font='12px Consolas, monospace';
        ctx.textBaseline='top';
        ctx.fillStyle=color;
        ctx.fillText(value,x,y,maxWidth);
      },
      region(x,y,w,h) {
        const x0 = Math.min(canvas.width-1,Math.max(0,Math.floor(x*rx)));
        const y0 = Math.min(canvas.height-1,Math.max(0,Math.floor(y*ry)));
        const pw = Math.min(canvas.width-x0,Math.max(1,Math.floor(w*rx)));
        const ph = Math.min(canvas.height-y0,Math.max(1,Math.floor(h*ry)));
        return ctx.getImageData(x0,y0,pw,ph);
      },
      sample(x,y) { return [...scene.region(x,y,1/rx,1/ry).data]; }
    };

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
      for (const key of frozen.keys()) scene.drop(key);
      return true;
    }
    function fail(message) { if (dispose()) fallback(message); }
    function onPaint() {
      try {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        if (!width || !height) return;
        const dpr = Math.min(2,window.devicePixelRatio || 1);
        const w = Math.round(width*dpr), h = Math.round(height*dpr);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        rx = w/width; ry = h/height;
        resetTransform();
        updated = new Set();
        render(scene,width,height);
        for (const element of registered) {
          if (!updated.has(element)) canvas.clearElementGeometry(element);
        }
        registered = updated;
        if (!painted) {
          painted = true;
          clearTimeout(timer);
          ready();
        }
      } catch (error) {
        fail('The browser could not export the live DOM frame. The source controls are open in HTML.');
      }
    }
    const timer = setTimeout(() => fail('The browser did not paint the live frame. The source controls are open in HTML.'),3000);
    observer.observe(canvas);
    canvas.addEventListener('paint',onPaint,options);
    request();
    return {request,dispose};
  }

  return {open};
})();
