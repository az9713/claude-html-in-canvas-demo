'use strict';
(() => {
  const host=document.getElementById('experiment');
  const nav=document.getElementById('experiments');
  const keepGeometry={preserveElementGeometry:true};
  let session;
  const fit=(source,x,y,w,h) => {
    const s=Math.min(w/source.offsetWidth,h/source.offsetHeight);
    return {x:x+(w-s*source.offsetWidth)/2,y:y+(h-s*source.offsetHeight)/2,
      w:s*source.offsetWidth,h:s*source.offsetHeight,s};
  };
  const transform=box => new DOMMatrix().translate(box.x,box.y).scale(box.s);
  const report=(node,text) => { if (node.textContent !== text) node.textContent=text; };
  const caption=(ctx,label,x,y,w) => {
    ctx.font='12px Consolas, monospace'; ctx.fillStyle='#b7cbd4'; ctx.textBaseline='top'; ctx.fillText(label,x,y,w);
  };
  function frameSize(canvas) {
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
    return {w,h,dpr,width:Math.round(w*dpr),height:Math.round(h*dpr)};
  }
  function background(ctx,w,h) {
    ctx.fillStyle='#0e1923'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#2a4050'; ctx.lineWidth=.65; ctx.beginPath();
    for(let x=0;x<w;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,h);}
    for(let y=0;y<h;y+=26){ctx.moveTo(0,y);ctx.lineTo(w,y);}
    ctx.stroke();
  }
  function capture(ctx,source,box) {
    ctx.drawElementImage(source,box.x,box.y,box.w,box.h,keepGeometry);
  }
  function live(ctx,canvas,source,box) {
    capture(ctx,source,box);
    canvas.updateElementGeometry(source,{canvasTransform:transform(box)});
  }
  function twoZones(w,h) {
    if(w>=670) return [[14,33,(w-42)/2,h-48],[w/2+7,33,(w-42)/2,h-48]];
    const ph=(h-63)/2;
    return [[14,32,w-28,ph],[14,ph+48,w-28,ph]];
  }
  function makeSession() {
    const lifecycle=new AbortController();
    const canvas=host.querySelector('canvas');
    const cleanups=[];
    const {signal}=lifecycle;
    const $=id=>host.querySelector('#'+id);
    const listen=(node,event,fn,options={})=>node.addEventListener(event,fn,{signal,...options});
    return {
      canvas, $,
      status:text=>report(host.querySelector('.status'),text),
      listen, cleanup:fn=>cleanups.push(fn),
      dispose() { lifecycle.abort(); for(const fn of cleanups) fn(); },
      fail(text) {
        if (signal.aborted) return;
        const plain=host.querySelector('.plain');
        for(const child of [...canvas.children]) {
          child.inert=false; plain.append(child);
        }
        for(const child of plain.querySelectorAll('[inert]')) child.inert=false;
        canvas.hidden=true; plain.hidden=false;
        for(const control of host.querySelectorAll('.controls :is(button,input,select)')) control.disabled=true;
        report(host.querySelector('.status'),text+' The original controls are available in the plain HTML view.');
        this.dispose();
      },
      observe(fn) {
        const observer=new ResizeObserver(fn);
        observer.observe(canvas);
        cleanups.push(()=>observer.disconnect());
      },
      get stopped(){return signal.aborted;}
    };
  }
  function start2d(ui,render,ready) {
    const {canvas}=ui;
    const ctx=canvas.getContext('2d',{alpha:false});
    if (typeof ctx?.drawElementImage!=='function' || typeof canvas.requestPaint!=='function' ||
        typeof canvas.updateElementGeometry!=='function' || typeof canvas.clearElementGeometry!=='function') {
      ui.fail('Native Canvas 2D element drawing is unavailable.'); return;
    }
    let first=true;
    const timeout=setTimeout(()=>ui.fail('No native paint arrived.'),3500);
    ui.cleanup(()=>clearTimeout(timeout));
    ui.listen(canvas,'paint',event=>{
      try {
        const dims=frameSize(canvas);
        if (!dims.w || !dims.h) return;
        if (canvas.width!==dims.width) canvas.width=dims.width;
        if (canvas.height!==dims.height) canvas.height=dims.height;
        ctx.setTransform(dims.width/dims.w,0,0,dims.height/dims.h,0,0);
        background(ctx,dims.w,dims.h);
        render(ctx,dims.w,dims.h,event);
        if(first) { first=false; clearTimeout(timeout); ui.status(ready); }
      } catch(error) {
        ui.fail('Native Canvas 2D composition failed '+error.message);
      }
    });
    ui.observe(()=>canvas.requestPaint());
    canvas.requestPaint();
  }
  function nested(ui) {
    const {canvas,$}=ui, notice=$('notice'), stamp=$('signoff'), mode=$('signoff-placement');
    ui.listen(mode,'change',()=>{
      stamp.inert=mode.value==='parent';
      canvas.requestPaint();
    });
    $('sign').addEventListener('click',()=>report($('sign-result'),'Reviewed '+$('revision').value));
    start2d(ui,(ctx,w,h)=>{
      const [a,b]=twoZones(w,h);
      const primary=fit(notice,...a);
      caption(ctx,'Parent notice paint',a[0],a[1]-19,a[2]);
      live(ctx,canvas,notice,primary);
      if(mode.value==='parent'){
        canvas.clearElementGeometry(stamp);
        caption(ctx,'Independent child omitted',b[0],b[1]-19,b[2]);
      } else {
        const badge=mode.value==='dock'
          ? fit(stamp,primary.x+primary.w*.47,primary.y+primary.h*.46,primary.w*.53,primary.h*.53)
          : fit(stamp,...b);
        live(ctx,canvas,stamp,badge);
        if(mode.value==='margin') caption(ctx,'Nested sign-off paint',b[0],b[1]-19,b[2]);
      }
      report($('nested-metrics'),notice.contains(stamp)?'Sign-off is a DOM child of the notice':'Sign-off detached');
    },'Live Canvas 2D · Parent and nested child paint independently');
  }
  function dirty(ui) {
    const {canvas,$}=ui, cards=[...canvas.querySelectorAll('.dock')];
    if(typeof canvas.captureElementImage!=='function'){ui.fail('Canvas snapshots are unavailable.');return;}
    const assets=new Map(), counts=new Map(cards.map(node=>[node,0]));
    let reversed=false;
    ui.cleanup(()=>{for(const asset of assets.values()) asset.close?.();});
    ui.listen($('reflow'),'click',()=>{
      reversed=!reversed;
      $('reflow').setAttribute('aria-pressed',String(reversed));
      canvas.requestPaint();
    });
    ui.listen($('reset-counts'),'click',()=>{
      for(const card of cards) counts.set(card,0);
      canvas.requestPaint();
    });
    for(const card of cards) {
      ui.listen(card.querySelector('select'),'change',event=>{
        card.style.background=({Ready:'#214f41',Loading:'#634a27',Closed:'#574051'})[event.target.value];
      });
    }
    start2d(ui,(ctx,w,h,event)=>{
      if(!event.changedElements) throw new Error('This build does not expose paint.changedElements.');
      const dirty=new Set(event.changedElements);
      for(const card of cards){
        if(!assets.has(card)||dirty.has(card)){
          const next=canvas.captureElementImage(card);
          assets.get(card)?.close?.();
          assets.set(card,next);
          counts.set(card,counts.get(card)+1);
        }
      }
      const order=reversed?[...cards].reverse():cards;
      const vertical=w<680;
      order.forEach((card,index)=>{
        const box=vertical
          ? fit(card,13,24+index*(h-24)/3,w-26,(h-24)/3-19)
          : fit(card,13+index*(w-26)/3,25,(w-26)/3-8,h-50);
        capture(ctx,assets.get(card),box);
        canvas.updateElementGeometry(card,{canvasTransform:transform(box)});
        caption(ctx,counts.get(card)+' captures',box.x,box.y+box.h+5,box.w);
      });
      report($('dirty-log'),cards.map((card,i)=>String.fromCharCode(65+i)+' '+counts.get(card)).join(' · ')+' captures');
    },'Live browser paint · Capture only the changed dock cards');
  }
  function geometry(ui) {
    const {canvas,$}=ui, history=$('history'), drawer=$('drawer');
    let clicks=0;
    $('open-history').addEventListener('click',()=>report($('hit-result'),'History received click '+(++clicks)+'.'));
    $('hold').addEventListener('click',()=>report($('hit-result'),'Hold received click '+(++clicks)+'.'));
    ui.listen($('sync-clip'),'change',()=>canvas.requestPaint());
    start2d(ui,(ctx,w,h)=>{
      const box=fit(history,15,32,w-30,h-57);
      live(ctx,canvas,history,box);
      ctx.save();
      ctx.beginPath(); ctx.rect(box.x+box.w/2,box.y,box.w/2,box.h); ctx.clip();
      capture(ctx,drawer,box);
      ctx.restore();
      const half=$('sync-clip').checked;
      canvas.updateElementGeometry(drawer,{canvasTransform:transform(box),
        canvasClip:new DOMRect(half?drawer.offsetWidth/2:0,0,half?drawer.offsetWidth/2:drawer.offsetWidth,drawer.offsetHeight)});
      caption(ctx,'Canvas clip',box.x+box.w/2+5,box.y+box.h+6,box.w/2);
    },'Live overlap · Native hit testing follows the selected geometry');
  }
  function worker(ui) {
    const {canvas,$}=ui, dispatch=$('dispatch');
    if(typeof Worker!=='function'||typeof canvas.captureElementImage!=='function'||
      typeof canvas.transferControlToOffscreen!=='function'||typeof canvas.requestPaint!=='function'){
      ui.fail('Transferable native element capture is unavailable.'); return;
    }
    const thread=new Worker('worker.js');
    ui.cleanup(()=>thread.terminate());
    let sent=0, rendered=0, updates=0, watchdog;
    ui.cleanup(()=>clearTimeout(watchdog));
    ui.listen(thread,'error',()=>ui.fail('The drawing worker could not start.'));
    ui.listen(thread,'message',({data})=>{
      if(data.error){ui.fail(data.error);return;}
      if(data.blob){
        const url=URL.createObjectURL(data.blob);
        const anchor=document.createElement('a'); anchor.href=url; anchor.download='dispatch-proof.png';
        anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      if(data.rendered){
        rendered=data.rendered;
        renderMetrics();
        if(rendered===1){
          clearTimeout(watchdog);
          $('save-proof').disabled=false;
          ui.status('Live worker · ElementImage transferred to OffscreenCanvas');
        }
      }
    });
    function renderMetrics() {
      report($('worker-metrics'),rendered+' worker draws · '+updates+' geometry updates');
    }
    ui.listen(canvas,'elementgeometryupdate',()=>{updates++;renderMetrics();});
    ui.listen(canvas,'paint',()=>{
      try {
        const dims=frameSize(canvas);
        const element=canvas.captureElementImage(dispatch);
        const msg={serial:++sent,element, dims, css:[dispatch.offsetWidth,dispatch.offsetHeight], copies:Number($('copies').value)};
        thread.postMessage(msg,[element]);
      } catch(error){ui.fail('Could not transfer the native HTML capture.');}
    });
    ui.listen($('copies'),'change',()=>canvas.requestPaint());
    ui.listen($('save-proof'),'click',()=>thread.postMessage({save:true}));
    const offscreen=canvas.transferControlToOffscreen();
    thread.postMessage({canvas:offscreen},[offscreen]);
    watchdog=setTimeout(()=>ui.fail('No worker paint arrived.'),4000);
    ui.observe(()=>canvas.requestPaint());
    canvas.requestPaint();
  }
  const experiments={worker,nested,dirty,geometry,compute:ui=>window.AtlasGPU.start(ui)};
  function route() {
    const requested=location.hash.slice(1);
    const name=Object.hasOwn(experiments,requested)?requested:'worker';
    session?.dispose();
    host.className='experiment-'+name;
    host.replaceChildren(document.getElementById(name+'-view').content.cloneNode(true));
    for(const link of nav.querySelectorAll('a')){
      if(link.hash==='#'+name) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    session=makeSession();
    try {
      experiments[name](session);
    } catch(error) {
      session.fail('The native experiment could not start.');
    }
  }
  window.addEventListener('hashchange',route);
  route();
})();
