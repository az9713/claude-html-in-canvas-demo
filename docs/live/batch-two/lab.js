'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const demos = window.CanvasDemos.sort((a,b) => a.number-b.number);
  const groups = ['Pixel inspection','Spatial interfaces','Publication and proofing','Measurement and verification'];
  const groupOf = demo => groups[Math.floor((demo.number-1)/10)];
  let active, renderer, cleanups = [];
  function element(name,text) {
    const result = document.createElement(name);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function option(value,name) {
    const result = element('option',name);
    result.value = value;
    return result;
  }
  function catalog() {
    const query = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const category = $('group').value;
    const matches = demos.filter(demo => (!category || category === groupOf(demo)) && query.every(term =>
      [demo.title,demo.summary,demo.mechanism].join(' ').toLowerCase().includes(term)));
    $('catalog-count').textContent = matches.length + ' / ' + demos.length;
    $('projects').replaceChildren(...matches.map(demo => {
      const row = element('li'), link = element('a',demo.title);
      link.href = '#' + demo.id;
      if (active === demo) link.setAttribute('aria-current','page');
      link.addEventListener('click',() => {
        if (matchMedia('(max-width:690px)').matches) $('catalog').open = false;
      });
      row.append(link);
      return row;
    }));
  }
  function mount(demo, focus = false) {
    if (!demo || demo === active) return;
    renderer?.dispose?.();
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    renderer = null;
    active = demo;
    const canvas = element('canvas');
    canvas.setAttribute('content','drawable');
    canvas.setAttribute('layoutsubtree','');
    canvas.setAttribute('aria-label',demo.title + ' rendered output');
    const controls = $('controls'), stage = $('stage'), fallbackHost = element('div');
    fallbackHost.className = 'fallback';
    fallbackHost.hidden = true;
    controls.replaceChildren();
    stage.replaceChildren(canvas,fallbackHost);
    $('status').textContent = 'Preparing the live canvas';
    $('save').hidden = true;
    $('save').onclick = () => LiveCanvas.save(canvas,demo.id + '.png');
    $('technique').textContent = groupOf(demo);
    $('project-title').textContent = demo.title;
    $('summary').textContent = demo.summary;
    $('try-it').textContent = demo.tryIt;
    $('mechanism').textContent = demo.mechanism;
    document.title = demo.title + ' · Live Canvas Lab';
    const panels = [];
    const fallbackCallbacks = [];
    function request() { if (active === demo) renderer?.request(); }
    const api = {
      controls, canvas, invalidate:request,
      onFallback(callback) { fallbackCallbacks.push(callback); },
      onDispose(callback) { cleanups.push(callback); },
      panel(title,width=340,height=280) {
        const panel = element('section');
        panel.className = 'live-source';
        panel.setAttribute('drawable','');
        panel.setAttribute('aria-label',title);
        panel.style.width = width + 'px';
        panel.style.height = height + 'px';
        panels.push(panel);
        canvas.append(panel);
        return panel;
      },
      fit(panel,x,y,w,h) {
        const s = Math.max(.02,Math.min(w / panel.offsetWidth,h / panel.offsetHeight));
        return new DOMMatrix().translate(x+(w-panel.offsetWidth*s)/2,y+(h-panel.offsetHeight*s)/2).scale(s);
      },
      project(panel,{x,y,scale=1,yaw=0,pitch=0,roll=0,depth=900}) {
        const perspective = new DOMMatrix();
        perspective.m34 = -1/depth;
        return new DOMMatrix().translate(x,y).multiply(perspective).rotate(pitch,yaw,roll)
          .scale(scale,scale,scale).translate(-panel.offsetWidth/2,-panel.offsetHeight/2);
      },
      rect(x,y,w,h) {
        return [[x,y],[x,y+h],[x+w,y],[x+w,y+h]].map(([px,py]) => new DOMPoint(px,py));
      }
    };
    const frame = demo.mount(api);
    const engine = demo.renderer === '2d' ? NativeCanvas2D : LiveCanvas;
    renderer = engine.open(canvas, {
      panels,
      render:frame,
      ready() {
        $('status').textContent = 'Live HTML-in-Canvas · ' + (demo.renderer === '2d' ? 'Canvas 2D' : 'WebGL');
        $('save').hidden = false;
      },
      fallback(message) {
        canvas.hidden = true;
        for (const panel of panels) { panel.inert = false; fallbackHost.append(panel); }
        fallbackHost.hidden = false;
        $('save').hidden = true;
        $('status').textContent = message;
        for (const callback of fallbackCallbacks) callback();
      }
    });
    for (const type of ['input','change','click','scroll','focusin','focusout']) {
      canvas.addEventListener(type,request,true);
    }
    for (const type of ['input','change','click']) controls['on'+type] = request;
    catalog();
    if (focus) $('project-title').focus();
  }
  function route(focus) {
    const id = location.hash.slice(1);
    mount(demos.find(demo => demo.id === id) || demos[0],focus);
  }
  $('group').append(...groups.map(group => option(group,group)));
  $('group').addEventListener('change',catalog);
  $('search').addEventListener('input',catalog);
  window.addEventListener('hashchange',() => route(true));
  if (matchMedia('(max-width:690px)').matches) $('catalog').open = false;
  route();
})();
