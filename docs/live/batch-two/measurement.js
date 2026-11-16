'use strict';
(() => {
  const e = (tag, text, properties = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return Object.assign(node,properties);
  };
  function source(api, title, subtitle, w=340, h=220) {
    const panel = api.panel(title,w,h);
    panel.append(e('span',subtitle,{className:'source-kicker'}),e('h2',title,{className:'source-title'}));
    return panel;
  }
  function input(host, id, name, value, options={}) {
    const field = e('input',undefined,{id,value,...options});
    const label = e('label',name);
    label.htmlFor = id;
    label.append(field); host.append(label);
    return field;
  }
  function choice(host,id,name,items) {
    const field = e('select',undefined,{id});
    for (const text of items) field.append(e('option',text,{value:text}));
    const label=e('label',name);
    label.htmlFor=id; label.append(field); host.append(label);
    return field;
  }
  function action(host,id,label,callback) {
    const button=e('button',label,{id,type:'button'});
    button.addEventListener('click',callback);
    host.append(button);
    return button;
  }
  function output(host,id,value='') {
    const node=e('output',value,{id,className:'source-status'});
    host.append(node);
    return node;
  }
  function set(node,text) { if (node.textContent !== text) node.textContent=text; }
  function two(width,height) {
    const p=12,gap=14;
    if(width>=650) return [[p,32,(width-p*2-gap)/2,height-44],[width/2+gap/2,32,(width-p*2-gap)/2,height-44]];
    const h=(height-56)/2;
    return [[p,24,width-2*p,h],[p,h+43,width-2*p,h]];
  }
  const fit=(api,pane,rect) => api.fit(pane,...rect);
  const caption=(scene,value,[x,y,w]) => scene.text(value,x+3,Math.max(3,y-17),w-5);
  function labelCanvas(scene,rect,value) {
    scene.box(rect[0],rect[1],rect[2],rect[3],'#122532');
    scene.text(value,rect[0]+9,rect[1]+10,rect[2]-18);
  }
  const bounds=(pane,matrix) => [matrix.e,matrix.f,pane.offsetWidth*matrix.a,pane.offsetHeight*matrix.d];
  function describe(title, actionText, proof, object) {
    return {...object,title,tryIt:actionText,mechanism:proof,renderer:'2d'};
  }

  const receipt=describe('Approval evidence strip','Edit the reference or stage, then retain two frames. Edit the form again and save the strip.',
    'Canvas 2D retains two native ElementImage snapshots while the same form stays editable. It lays the current form and the immutable browser-rendered records into one PNG, with native controls and wrapping preserved at capture time.',{
    number:31,id:'approval-evidence-strip',summary:'Keep the exact visible states of a two-step sign-off together for a handoff.',
    test:{selector:'#m31-capture',expect:{selector:'#m31-count',text:'1 of 2 frames retained'}},
    mount(api) {
      const form=source(api,'Service approval','Evidence strip',340,210);
      input(form,'m31-reference','Work reference','Sample work order 16');
      choice(form,'m31-state','Stage',['Awaiting inspection','Technician checked','Approved for handoff']);
      let queued=false, captures=0;
      const counter=output(api.controls,'m31-count','0 of 2 frames retained');
      action(api.controls,'m31-capture','Retain current frame',() => { queued=true; api.invalidate(); });
      action(api.controls,'m31-reset','Clear evidence',() => { captures=0; queued=false; api.invalidate(); });
      return (scene,w,h) => {
        scene.grid();
        if (!captures && !queued) { scene.drop('approval0'); scene.drop('approval1'); }
        if(queued) {
          scene.freeze('approval'+(captures%2),form);
          captures++; queued=false;
          set(counter,Math.min(2,captures)+' of 2 frames retained');
        } else if (!captures) set(counter,'0 of 2 frames retained');
        const side=w>=650, cell=side ? (w-42)/2 : w-24;
        const live=[12,29,cell,side?h-49:h*.49];
        const replayX=side?w/2+8:12, replayY=side?29:h*.55+18;
        const recess=side?(h-78)/2:(h-replayY-12);
        caption(scene,'Current editable form',live);
        const matrix=fit(api,form,live);
        scene.surface(form,matrix); scene.register(form,matrix);
        for(let i=0;i<2;i++) {
          const box=side?[replayX,replayY+i*(recess+15),cell,recess]:[12+i*(cell/2+5),replayY,cell/2-5,recess];
          const key='approval'+(captures>2?(captures+i)%2:i);
          labelCanvas(scene,box,scene.frozen(key)?'Retained '+(i+1):'Capture slot '+(i+1));
          if(scene.frozen(key)) scene.snapshot(key,fit(api,form,[box[0]+4,box[1]+25,box[2]-8,box[3]-29]));
        }
      };
    }
  });

  const stripes=describe('Thin-stripe scan proof','Change the stripe width inside the live label or lower Proof scale. Inspect the measured transitions.',
    'The scanline is measured from the rendered browser pixels after composition. It includes CSS painting, device scaling, and raster aliasing, which a calculation on the original stripe widths would miss.',{
    number:32,id:'stripe-scan-proof',summary:'Check whether a synthetic stripe pattern survives the scale used for a packing-label proof.',
    test:{selector:'#m32-scale',value:'32'},
    mount(api) {
      const panel=source(api,'Package label','Stripe resolution sample',324,185);
      const stroke=input(panel,'m32-stroke','Minimum stripe width (CSS px)','3',{type:'number',min:1,max:7});
      const pattern=e('div',undefined,{className:'measure-stripes'});
      panel.classList.add('measure-stripe-panel'); panel.append(pattern);
      const scale=input(api.controls,'m32-scale','Proof scale (%)','70',{type:'range',min:25,max:100});
      const result=output(api.controls,'m32-result','Waiting for scanline');
      const units=[1,2,1,1,3,1,2,1,1,2,1,1,3,1,1,2,1,2,2,1,1,2,1,1,3,1,2,1,3,1,2,1];
      function repaint() {
        const width=Math.min(7,Math.max(1,Number(stroke.value)||1));
        pattern.replaceChildren(...units.map((unit,i)=>{
          const stripe=e('span');
          stripe.style.width=(unit*width)+'px';
          stripe.style.backgroundColor=i%2?'#fff':'#12181d';
          return stripe;
        }));
      }
      stroke.addEventListener('input',repaint); repaint();
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h);
        const matrix=fit(api,panel,left);
        caption(scene,'Editable label',left);
        scene.surface(panel,matrix); scene.register(panel,matrix);
        const s=Math.min(right[2]/panel.offsetWidth,right[3]/panel.offsetHeight,Number(scale.value)/100);
        const proof=new DOMMatrix().translate(right[0]+(right[2]-panel.offsetWidth*s)/2,right[1]+(right[3]-panel.offsetHeight*s)/2).scale(s);
        caption(scene,'Scan the scaled label',right);
        scene.surface(panel,proof);
        const sampleX=proof.e+15*s, sampleY=proof.f+151*s;
        const patternWidth=units.reduce((a,b)=>a+b,0)*Math.min(7,Math.max(1,Number(stroke.value)||1));
        const pixels=scene.region(sampleX,sampleY,Math.min(294,patternWidth)*s,1).data;
        let previous, count=0;
        for(let i=0;i<pixels.length;i+=4) {
          const light=pixels[i]>127;
          if(previous!==undefined && previous!==light) count++;
          previous=light;
        }
        scene.line(sampleX,sampleY,sampleX+Math.min(294,patternWidth)*s,sampleY,'#f0a759',.8);
        set(result,count+' observed transitions · '+(units.length-1)+' intended');
      };
    }
  });

  const scroll=describe('Scrollable checklist contact sheet','Capture the first page, then capture the lower page. Update the checklist to see that the two proofs retain their earlier contents.',
    'The native scrolling checklist remains interactive while Canvas 2D stores and arranges both portions of its formerly visible pixels. Browser scrollbar treatment and text wrapping are captured with each scroll position.',{
    number:33,id:'scroll-checklist-proof',summary:'Send a buyer or reviewer evidence from two scroll positions of a checklist without taking separate desktop screenshots.',
    test:{selector:'#m33-lower',expect:{selector:'#m33-state',text:'Lower view retained'}},
    mount(api) {
      const panel=source(api,'Inspection checklist','Scrollable evidence',320,238);
      const viewport=e('div',undefined,{className:'measure-scroll'});
      ['External cover seated','Fasteners marked','Cooling inlet clear','Guard interlock cycles','Signal light tested','Transfer label applied','Final witness present'].forEach((text,i)=>{
        const label=e('label',text);
        label.prepend(e('input',undefined,{type:'checkbox',checked:i<3}));
        viewport.append(label);
      });
      panel.append(viewport);
      let pending;
      const status=output(api.controls,'m33-state','Choose a scroll position to capture');
      for(const [key,label] of [['top','Capture first view'],['lower','Capture lower view']]) {
        action(api.controls,'m33-'+key,label,()=>{
          viewport.scrollTop=key==='top'?0:viewport.scrollHeight;
          pending=key; api.invalidate();
        });
      }
      return (scene,w,h) => {
        scene.grid();
        if(pending) {
          scene.freeze(pending,panel);
          set(status,pending==='top'?'First view retained':'Lower view retained');
          pending=null;
        }
        const [home,proof]=two(w,h);
        caption(scene,'Live scrollable checklist',home);
        const matrix=fit(api,panel,home);
        scene.surface(panel,matrix); scene.register(panel,matrix);
        caption(scene,'Retained scroll positions',proof);
        for(const [i,key] of ['top','lower'].entries()) {
          const half=(proof[2]-8)/2;
          const box=[proof[0]+i*(half+8),proof[1],half,proof[3]];
          labelCanvas(scene,box,key==='top'?'First view':'Lower view');
          if(scene.frozen(key)) scene.snapshot(key,fit(api,panel,[box[0]+2,box[1]+24,box[2]-4,box[3]-28]));
        }
      };
    }
  });

  function checksum(pixels) {
    let value=2166136261;
    for(const color of pixels.data) value=Math.imul(value^color,16777619);
    return (value>>>0).toString(16).padStart(8,'0');
  }
  const witness=describe('Rendered pixel checksum','Record a baseline. Change the certificate text, then release focus to compare the exact painted states.',
    'A retained ElementImage is repainted at the same output coordinates to obtain a non-cryptographic pixel checksum. This measures the actual layout, fonts, and rendered controls instead of hashing their source text.',{
    number:34,id:'rendered-pixel-checksum',summary:'Establish whether an exported review frame still matches a recorded copy at the current viewport.',
    test:{selector:'#m34-freeze',expect:{selector:'#m34-result',text:'Pixels match'}},
    mount(api) {
      const panel=source(api,'Dispatch certificate','Pixel comparison',320,175);
      input(panel,'m34-number','Certificate label','Specimen 0021');
      choice(panel,'m34-format','Output format',['Standard','Priority']);
      let freeze=false;
      action(api.controls,'m34-freeze','Record baseline',()=>{freeze=true;api.invalidate();});
      const status=output(api.controls,'m34-result','Record a baseline to compare');
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h), live=fit(api,panel,left), retained=fit(api,panel,right);
        if(freeze) { scene.freeze('baseline',panel); freeze=false; }
        if(scene.frozen('baseline')) {
          // Hash both versions at the same origin so subpixel placement and device scale agree.
          const area=bounds(panel,live);
          scene.snapshot('baseline',live);
          const previous=checksum(scene.region(...area));
          scene.grid();
          scene.freeze('current',panel);
          scene.snapshot('current',live);
          const current=checksum(scene.region(...area));
          scene.drop('current');
          set(status,(current===previous?'Pixels match · ':'Pixels changed · ')+previous+' / '+current);
          scene.grid();
          scene.surface(panel,live);
          scene.snapshot('baseline',retained);
        } else {
          scene.surface(panel,live);
          labelCanvas(scene,right,'No baseline recorded');
        }
        caption(scene,'Live certificate',left);
        caption(scene,'Recorded baseline',right);
        scene.register(panel,live);
      };
    }
  });

  const fraction=describe('Subpixel readout stability','Change the offset between 0 and 1 device pixel. Edit the value in the registered readout to inspect another glyph.',
    'Both copies come from one native readout. Pixel readback detects shifts in the rasterized glyph under fractional placement at the current output resolution while its original browser input remains usable.',{
    number:35,id:'subpixel-readout-stability',summary:'Check whether fractional device-pixel placement changes a small numeric display during animation.',
    test:{selector:'#m35-shift',value:'0.85'},
    mount(api) {
      const panel=source(api,'Meter readout','Device pixel alignment',318,143);
      const value=input(panel,'m35-value','Readout','0188.808');
      value.className='measure-numeric';
      const shift=input(api.controls,'m35-shift','Offset (device pixels)','0.55',{type:'range',min:0,max:1,step:.05});
      const status=output(api.controls,'m35-result','');
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h), live=fit(api,panel,left), proof=fit(api,panel,right);
        const area=bounds(panel,live);
        scene.surface(panel,live);
        const baseline=checksum(scene.region(...area));
        const offset=Number(shift.value)/Math.min(2,devicePixelRatio||1);
        const shifted=new DOMMatrix().translate(offset,0).multiply(live);
        scene.grid();
        scene.surface(panel,shifted);
        const sample=checksum(scene.region(...area));
        scene.grid();
        scene.surface(panel,live);
        scene.register(panel,live);
        scene.surface(panel,new DOMMatrix().translate(offset,0).multiply(proof));
        caption(scene,'Registered input',left);
        caption(scene,'Offset '+Number(shift.value).toFixed(2)+' device px',right);
        set(status,baseline===sample?'Readback matches the grid-aligned sample':'Readback differs from the grid-aligned sample');
      };
    }
  });

  const focus=describe('Clipped focus-ring proof','Focus the document field, then tighten the proof margin. Compare the visible keyboard focus ring.',
    'The clip is applied to the browser’s actual focused control texture. The original control remains interactive and the second view shows how a crop affects the real focus ring and content.',{
    number:36,id:'focus-ring-clip-proof',summary:'Check whether a cropped kiosk or embedded preview leaves enough room for a visible focus indicator.',
    test:{selector:'#m36-tight',value:'27'},
    mount(api) {
      const panel=source(api,'Kiosk document lookup','Keyboard focus',320,175);
      const field=input(panel,'m36-field','Document number','SPEC-0051');
      const margin=input(api.controls,'m36-tight','Left crop (CSS px)','12',{type:'range',min:0,max:45});
      action(api.controls,'m36-focus','Focus document field',()=>{field.focus({preventScroll:true});api.invalidate();});
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h), live=fit(api,panel,left), proof=fit(api,panel,right);
        caption(scene,'Native keyboard focus',left);
        caption(scene,'Cropped export (+ '+margin.value+' CSS px)',right);
        scene.surface(panel,live); scene.register(panel,live);
        const crop=Number(margin.value)*proof.a;
        const [x,y,pw,ph]=bounds(panel,proof);
        scene.clip(x+crop,y,pw-crop,ph,()=>scene.surface(panel,proof));
        scene.line(x+crop,y,x+crop,y+ph,'#ebad66',1.5);
      };
    }
  });

  const selection=describe('Native selection evidence','Select the compound ID using the button, or use Shift and the arrow keys inside the address field. Retain the exact selection.',
    'The selected range is painted by the browser inside a real control. Capture preserves the editor pixels at the selected range so a keyboard or selection bug can be shown without recreating selection rectangles.',{
    number:37,id:'selection-evidence',summary:'Show exactly which part of a formatted value was selected in a support or QA report.',
    test:{selector:'#m37-select',expect:{selector:'#m37-result',text:'Selected characters'}},
    mount(api) {
      const panel=source(api,'Shipping reference','Selection reproduction',340,171);
      const field=input(panel,'m37-field','Formatted address','Area 12 / UNIT-40 / Dock B');
      let capture=false;
      const status=output(api.controls,'m37-result','Select a range in the live input');
      function describeRange(){
        const start=field.selectionStart, end=field.selectionEnd;
        if(end>start) set(status,'Selected characters '+start+'–'+end+' · '+field.value.slice(start,end));
      }
      field.addEventListener('select',()=>{describeRange();api.invalidate();});
      action(api.controls,'m37-select','Select compound ID',()=>{
        field.focus({preventScroll:true});
        const start=Math.min(10,field.value.length);
        field.setSelectionRange(start,Math.min(start+7,field.value.length));
        describeRange();
        capture=true; api.invalidate();
      });
      action(api.controls,'m37-save','Retain current selection',()=>{
        field.focus({preventScroll:true});
        describeRange();
        capture=true;api.invalidate();
      });
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h), live=fit(api,panel,left);
        if(capture) { scene.freeze('range',panel); capture=false; }
        caption(scene,'Editable selection',left);
        caption(scene,'Retained evidence',right);
        scene.surface(panel,live); scene.register(panel,live);
        if(scene.frozen('range')) scene.snapshot('range',fit(api,panel,right));
        else labelCanvas(scene,right,'Select a range to retain this exact UI');
      };
    }
  });

  const footprint=describe('Alert footprint measurement','Choose Amber or Red on the panel, then change the banner height. The meter measures the rasterized color footprint.',
    'The area is counted from rendered bitmap pixels, so the metric includes CSS borders, actual text, wrapping, and the chosen composition size. This is a footprint proof for a synthetic alert.',{
    number:38,id:'alert-footprint-measurement',summary:'Compare how much screen area a warning takes on a constrained device display.',
    test:{selector:'#m38-height',value:'94'},
    mount(api) {
      const panel=source(api,'Alert dashboard','Visible color coverage',328,240);
      const severity=choice(panel,'m38-severity','Severity',['Red','Amber']);
      const banner=e('div','Sample line halted. Review the interlock state.',{className:'measure-alert'});
      panel.append(banner);
      const size=input(api.controls,'m38-height','Banner height (px)','43',{type:'range',min:24,max:110});
      const status=output(api.controls,'m38-result','');
      function update() {
        banner.style.minHeight=size.value+'px';
        banner.style.backgroundColor=severity.value==='Red'?'#e94735':'#e8a540';
        api.invalidate();
      }
      severity.addEventListener('change',update);
      size.addEventListener('input',update);
      update();
      return (scene,w,h) => {
        scene.grid();
        const matrix=api.fit(panel,12,20,w-24,h-40);
        scene.surface(panel,matrix);
        scene.register(panel,matrix);
        const pixels=scene.region(...bounds(panel,matrix)).data;
        let marked=0;
        for(let i=0;i<pixels.length;i+=4) {
          const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
          if(r>135 && r>b*1.8 && r>g*1.18) marked++;
        }
        set(status,(400*marked/pixels.length).toFixed(1)+'% of rendered panel pixels match the alert color');
      };
    }
  });

  const stamp=describe('Stamp collision proof','Move the review stamp across the export copy; compare its measured coverage of bright field pixels.',
    'Canvas 2D combines a native editable record with a separate watermark layer and evaluates the overlap on the browser-painted export. The collision depends on the actual layout and rasterized text.',{
    number:39,id:'stamp-collision-proof',summary:'Place a review watermark where it obscures less content in a handoff export.',
    test:{selector:'#m39-position',value:'14'},
    mount(api) {
      const panel=source(api,'Inventory record','Watermark placement',322,188);
      input(panel,'m39-record','Item reference','Cabinet C / Bin 02');
      input(panel,'m39-count','Verified inventory','24 spare brackets');
      const position=input(api.controls,'m39-position','Stamp vertical position (%)','61',{type:'range',min:8,max:82});
      const status=output(api.controls,'m39-result','');
      return (scene,w,h) => {
        scene.grid();
        const [left,right]=two(w,h), live=fit(api,panel,left), proof=fit(api,panel,right);
        caption(scene,'Editable inventory',left); caption(scene,'Watermarked handoff',right);
        scene.surface(panel,live); scene.register(panel,live);
        scene.surface(panel,proof);
        const [x,y,pw,ph]=bounds(panel,proof);
        const stampX=x+pw*.15, stampY=y+ph*Number(position.value)/100, stampW=pw*.71, stampH=ph*.14;
        const sample=scene.region(stampX,stampY,stampW,stampH).data;
        let bright=0;
        for(let i=0;i<sample.length;i+=4) if((sample[i]+sample[i+1]+sample[i+2])/3>153) bright++;
        scene.box(stampX,stampY,stampW,stampH,'rgba(230,144,72,.63)');
        scene.text('REVIEW',stampX+8,stampY+3,stampW-13,'#fdf1dc');
        set(status,(400*bright/sample.length).toFixed(1)+'% bright pixels under stamp');
      };
    }
  });

  const hit=describe('Scaled pointer calibration','Change the display scale and tap B2 inside the live canvas. Check which real button received the event.',
    'The same matrix renders the browser-painted buttons and registers their geometry. The proof records a real PointerEvent target and inverse-projected coordinates alongside the rendered interface.',{
    number:40,id:'scaled-pointer-calibration',summary:'Confirm that controls remain reachable and verify hit mapping at a different display scale.',
    test:{selector:'#m40-b2',expect:{selector:'#m40-result',text:'B2 received the event'}},
    mount(api) {
      const panel=source(api,'Test key array','Pointer mapping',323,199);
      const grid=e('div',undefined,{className:'source-grid measure-keys'});
      panel.append(grid);
      const scale=input(api.controls,'m40-scale','Display scale (%)','85',{type:'range',min:45,max:125});
      const result=output(api.controls,'m40-result','Tap one of the native keys');
      let current, last;
      for(const value of ['A1','A2','B1','B2','C1','C2']) {
        const key=action(grid,'m40-'+value.toLowerCase(),value,()=>{
          if (!last || last.key!==value) last={key:value};
          set(result,value+' received the event');
          api.invalidate();
        });
        key.addEventListener('pointerdown',event=>{
          if(!current)return;
          const rect=api.canvas.getBoundingClientRect();
          const p=current.inverse().transformPoint(new DOMPoint(event.clientX-rect.left,event.clientY-rect.top));
          last={key:value,x:p.x,y:p.y};
        });
      }
      return (scene,w,h) => {
        scene.grid();
        const s=Math.min((w-24)/panel.offsetWidth,(h-90)/panel.offsetHeight,Number(scale.value)/100);
        current=new DOMMatrix().translate((w-panel.offsetWidth*s)/2,(h-panel.offsetHeight*s)/2).scale(s);
        scene.surface(panel,current); scene.register(panel,current);
        if(last) {
          scene.text(last.key+' received the event'+(Number.isFinite(last.x)?' · local '+last.x.toFixed(1)+', '+last.y.toFixed(1)+' CSS px':''),14,14,w-28,'#ffca8a');
          if(Number.isFinite(last.x)) {
            const x=current.e+last.x*s,y=current.f+last.y*s;
            scene.line(x-8,y,x+8,y,'#ffca8a',2); scene.line(x,y-8,x,y+8,'#ffca8a',2);
          }
        }
      };
    }
  });

  window.CanvasDemos.push(receipt,stripes,scroll,witness,fraction,focus,selection,footprint,stamp,hit);
})();
