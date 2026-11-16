'use strict';

(() => {
  function make(tag, text, attributes = {}) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value);
    }
    return node;
  }

  function sheet(api, title, kicker, width, height) {
    const panel = api.panel(title, width, height);
    panel.style.position = 'relative';
    panel.append(make('p', kicker, {class:'source-kicker'}), make('h2', title, {class:'source-title'}));
    return panel;
  }

  function labeled(parent, caption, input) {
    const label = make('label', caption);
    label.append(input);
    parent.append(label);
    return input;
  }

  function range(api, id, caption, min, max, value) {
    const label = make('label', caption);
    const output = make('output', String(value));
    const slider = make('input', undefined, {id, type:'range', min, max, value});
    slider.addEventListener('input', () => { output.textContent = slider.value; });
    label.append(output, slider);
    api.controls.append(label);
    return slider;
  }

  function text(parent, caption, value, id) {
    return labeled(parent, caption, make('input', undefined, {id, type:'text', value, spellcheck:'false'}));
  }

  function checked(parent, caption, id, initial = false) {
    const input = make('input', undefined, {id, type:'checkbox'});
    input.checked = initial;
    return labeled(parent, caption, input);
  }

  function menu(parent, caption, id, choices) {
    const control = make('select', undefined, {id});
    control.append(...choices.map(([value, name]) => make('option', name, {value})));
    return labeled(parent, caption, control);
  }

  function report(parent, id, initial = '') {
    const output = make('output', initial, {id, class:'source-status'});
    parent.append(output);
    return output;
  }

  function button(parent, id, caption, activate) {
    const element = make('button', caption, {id, type:'button'});
    element.addEventListener('click', activate);
    parent.append(element);
    return element;
  }

  function say(output, message) {
    if (output.textContent !== message) output.textContent = message;
  }

  function pair(width, height) {
    const inset = 12, gap = 12;
    if (width >= 580) {
      const column = (width - 2 * inset - gap) / 2;
      return [[inset,inset,column,height - 2 * inset], [inset + column + gap,inset,column,height - 2 * inset]];
    }
    const row = (height - 2 * inset - gap) / 2;
    return [[inset,inset,width - 2 * inset,row], [inset,inset + row + gap,width - 2 * inset,row]];
  }

  function fit(api, panel, area) {
    return api.fit(panel, ...area);
  }

  function editable(scene, panel, matrix, options = {}) {
    scene.surface(panel, matrix, options);
    scene.register(panel, matrix);
  }

  function localBox(node, panel) {
    let left = 0, top = 0;
    for (let element = node; element && element !== panel; element = element.offsetParent) {
      left += element.offsetLeft;
      top += element.offsetTop;
    }
    return {left, top, width:node.offsetWidth, height:node.offsetHeight};
  }

  function point(matrix, x, y) {
    const p = matrix.transformPoint(new DOMPoint(x, y));
    return [p.x / p.w, p.y / p.w];
  }

  function center(matrix, node, panel) {
    const {left,top,width,height} = localBox(node, panel);
    return point(matrix, left + width/2, top + height/2);
  }

  function extract(panel, area, uv) {
    const [x,y,w,h] = area;
    const sw = panel.offsetWidth * uv[2], sh = panel.offsetHeight * uv[3];
    const scale = Math.min(w/sw, h/sh);
    const dw = sw*scale, dh = sh*scale;
    return new DOMMatrix().translate(x + (w-dw)/2, y + (h-dh)/2)
      .scale(dw/panel.offsetWidth, dh/panel.offsetHeight);
  }

  function swatch(parent, name, color) {
    const group = make('div');
    const legend = make('p', name);
    legend.style.fontSize = '12px';
    const block = make('div', undefined, {'aria-hidden':'true'});
    Object.assign(block.style, {height:'35px', width:'100%', background:color, borderRadius:'3px'});
    group.append(legend,block);
    parent.append(group);
    return block;
  }

  function twoColumns(panel) {
    const columns = make('div', undefined, {class:'source-grid'});
    Object.assign(columns.style, {display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'});
    panel.append(columns);
    return columns;
  }

  function strip(panel, value, color = '#e0b05d', backdrop = '#25394b') {
    const item = make('p', value);
    Object.assign(item.style, {margin:'4px 0',padding:'8px',borderRadius:'4px',color,background:backdrop});
    panel.append(item);
    return item;
  }

  function luminance(rgb) {
    const linear = [0,1,2].map(i => {
      const v = rgb[i] / 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    return .2126*linear[0] + .7152*linear[1] + .0722*linear[2];
  }

  const contrast = {
    number:1, id:'rendered-contrast', title:'Rendered contrast meter',
    summary:'Find a weak status label by measuring the foreground and background colors that actually reach the screen.',
    mechanism:'The browser paints the live status panel once. WebGL reads the composite swatch pixels, including panel opacity, and can export the same native text and controls without reconstructing CSS or antialiasing.',
    tryIt:'Move Text brightness. Compare the measured ratio and the live status label.',
    test:{selector:'#contrast-level', value:'175'},
    mount(api) {
      const brightness = range(api,'contrast-level','Text brightness',65,245,115);
      const opacity = range(api,'contrast-opacity','Label opacity',30,100,86);
      const ratio = report(api.controls,'contrast-ratio','Waiting for texture');
      api.onFallback?.(() => say(ratio,'Pixel measurement requires the native canvas'));
      const panel = sheet(api,'Equipment status','Rendered signal',340,246);
      const name = text(panel,'Status label','Ventilation operating','contrast-label');
      const status = strip(panel,name.value);
      const columns = twoColumns(panel);
      const fg = swatch(columns,'Text paint','#989898');
      const bg = swatch(columns,'Panel paint','#25394b');
      function update() {
        const v = Number(brightness.value);
        const a = Number(opacity.value)/100;
        const color = 'rgba(' + [v,v,v,a].join(',') + ')';
        status.style.color = color;
        fg.style.background = 'linear-gradient(' + color + ',' + color + '), #25394b';
        status.textContent = name.value;
      }
      for (const control of [brightness,opacity,name]) control.addEventListener('input', update);
      update();
      return (scene,w,h) => {
        scene.grid();
        const matrix = api.fit(panel,12,12,w-24,h-24);
        editable(scene,panel,matrix);
        const a = luminance(scene.sample(...center(matrix,fg,panel)));
        const b = luminance(scene.sample(...center(matrix,bg,panel)));
        const value = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        say(ratio, 'Rendered contrast ' + value.toFixed(2) + ' : 1');
      };
    }
  };

  const loupe = {
    number:2, id:'interactive-pixel-loupe', title:'Receipt pixel loupe',
    summary:'Read small transaction text at export size and inspect a magnified region while editing the original receipt.',
    mechanism:'Two sampling windows share the browser paint of the same editable receipt. The loupe magnifies actual output pixels without a second document layout or an independently rendered text replica.',
    tryIt:'Edit the item label, then move the inspection point. The enlarged crop follows the same browser paint.',
    test:{selector:'#loupe-item',value:'Workshop filter cartridge'},
    mount(api) {
      const position = range(api,'loupe-point','Vertical inspection point',28,72,53);
      const magnification = range(api,'loupe-magnify','Magnification',2,5,3);
      const panel = sheet(api,'Inventory receipt','180 g/m² proof',335,270);
      const item = text(panel,'Item','Bench filter','loupe-item');
      const line = strip(panel,'Bench filter · Qty 2', '#17212a', '#e6ded0');
      const evidence = strip(panel,'PICK ZONE C-4 · BIN 08', '#192536', '#d4dfde');
      Object.assign(line.style,{fontSize:'11px',letterSpacing:'.02em',fontFamily:'monospace'});
      Object.assign(evidence.style,{fontSize:'10px',letterSpacing:'.09em',fontFamily:'monospace'});
      item.addEventListener('input', () => { line.textContent = item.value + ' · Qty 2'; });
      return (scene,w,h) => {
        scene.grid();
        const [source, proof] = pair(w,h);
        editable(scene,panel,fit(api,panel,source));
        const size = 1 / Number(magnification.value);
        const uv = [.5 - size/2, Number(position.value)/100 - size/2, size, size];
        scene.surface(panel,extract(panel,proof,uv),{uv});
      };
    }
  };

  const redaction = {
    number:3, id:'redacted-handoff', title:'Redacted handoff proof',
    summary:'Create a shareable image of a work order that keeps the public fields and covers the internal reference in the exported pixels.',
    mechanism:'The mask is applied inside the framebuffer to native HTML paint. A canvas export contains the masked pixels directly, without relying on a CSS overlay that would be separate from the exported image.',
    tryIt:'Select Edit source to change the sample reference, then return to Redacted proof before saving.',
    test:{selector:'#redact-mode',value:'edit'},
    mount(api) {
      const mode = menu(api.controls,'View','redact-mode',[['proof','Redacted proof'],['edit','Edit source']]);
      const notice = report(api.controls,'redact-status','Preparing redacted proof');
      const panel = sheet(api,'Service work order','Dispatch copy',350,278);
      const reference = text(panel,'Internal reference','DEMO-RQ-4186','redact-id');
      const secret = reference.parentElement;
      secret.style.marginBottom = '5px';
      text(panel,'Dispatch instruction','Install spare filter','redact-instruction');
      panel.append(make('p','Send to dispatch only after checking the masked proof.'));
      function update() {
        panel.inert = mode.value === 'proof';
        say(notice, mode.value === 'proof' ? 'Preparing redacted proof' : 'Editing source with reference visible');
      }
      mode.addEventListener('change',update);
      api.onFallback?.(() => {
        mode.value = 'edit';
        mode.disabled = true;
        panel.inert = false;
        say(notice,'Plain HTML view · Reference visible · Redaction unavailable');
      });
      update();
      return (scene,w,h) => {
        scene.grid();
        const matrix = api.fit(panel,12,12,w-24,h-24);
        if (mode.value === 'edit') {
          editable(scene,panel,matrix);
        } else {
          const b = localBox(secret,panel);
          scene.surface(panel,matrix,{effect:'redact',params:[
            (b.left-3)/panel.offsetWidth, (b.top-3)/panel.offsetHeight,
            (b.width+6)/panel.offsetWidth, (b.height+6)/panel.offsetHeight
          ]});
          say(notice,'Redacted proof is ready to save');
        }
      };
    }
  };

  const vision = {
    number:4, id:'alarm-vision-proof', title:'Alarm color-vision proof',
    summary:'See whether machine-status controls can still be distinguished in an approximate red–green color-vision simulation.',
    mechanism:'The side-by-side shader transforms the final composited button fills, borders, label ink and focus paint together. The same interactive hardware-console markup drives both views.',
    tryIt:'Turn on Use words and symbols. Compare normal paint in the first view with the filtered proof in the second.',
    test:{selector:'#vision-symbols'},
    mount(api) {
      const showLabels = checked(api.controls,'Use words and symbols','vision-symbols');
      const panel = sheet(api,'Motor relay console','Alarm readability',330,251);
      const state = menu(panel,'Current state','vision-relay',[['run','Running'],['stop','Stopped']]);
      const columns = twoColumns(panel);
      const off = make('span','Idle');
      const on = make('span','Active');
      const current = strip(panel,'Running');
      for (const [badge, color] of [[on,'#c3484d'],[off,'#319661']]) {
        Object.assign(badge.style,{background:color,color:'#fff',padding:'10px 7px',borderRadius:'4px',textAlign:'center'});
        columns.append(badge);
      }
      function update() {
        off.textContent = showLabels.checked ? '■ Stopped' : '\u00a0';
        on.textContent = showLabels.checked ? '▶ Running' : '\u00a0';
        current.textContent = state.value === 'run' ? 'Relay is running' : 'Relay is stopped';
      }
      for (const control of [state,showLabels]) control.addEventListener('change',update);
      update();
      return (scene,w,h) => {
        scene.grid();
        const [source,proof] = pair(w,h);
        editable(scene,panel,fit(api,panel,source));
        scene.surface(panel,fit(api,panel,proof),{effect:'deuteranopia'});
      };
    }
  };

  const printCutoff = {
    number:5, id:'monochrome-print-cutoff', title:'Monochrome print cutoff',
    summary:'Proof a draft service tag against a one-bit print cutoff before relying on a low-contrast instruction.',
    mechanism:'Thresholding applies to the browser paint of native typography, input borders and filled cells as a unit. Printer-proof pixels can be exported from the same live document without recoding type layout for Canvas.',
    tryIt:'Lower the cutoff until the faint instruction and paper have the same tone.',
    test:{selector:'#print-cutoff',value:'46'},
    mount(api) {
      const cutoff = range(api,'print-cutoff','Monochrome cutoff',18,88,67);
      const panel = sheet(api,'Maintenance tag','One-bit device proof',340,268);
      Object.assign(panel.style,{background:'#eee7d9',color:'#172025'});
      panel.querySelector('.source-title').style.color = '#172025';
      panel.querySelector('.source-kicker').style.color = '#334742';
      const label = text(panel,'Instruction','Check cable seating','print-instruction');
      const proof = strip(panel,label.value,'#a29982','#eee7d9');
      const title = strip(panel,'REMOVE AFTER INSPECTION','#252630','#ddd6c9');
      proof.style.fontSize = '12px';
      title.style.fontWeight = '700';
      label.addEventListener('input', () => { proof.textContent = label.value; });
      return (scene,w,h) => {
        scene.grid();
        const [source,target] = pair(w,h);
        editable(scene,panel,fit(api,panel,source));
        scene.surface(panel,fit(api,panel,target),{effect:'threshold',params:[Number(cutoff.value)/100,0,0,0]});
      };
    }
  };

  const trim = {
    number:6, id:'trim-proof', title:'Packaging trim proof',
    summary:'Verify that an editable shipping-label design keeps its fine print and markings inside an adjustable trim area.',
    mechanism:'The source and the trimmed output sample one native browser paint. Cropping browser-painted pixels reproduces the physical loss and produces an export without recalculating text wrapping in a second renderer.',
    tryIt:'Set Trim inward to zero to see the full label, then raise it until the corner marks or text are cut off.',
    test:{selector:'#trim-inset',value:'14'},
    mount(api) {
      const inset = range(api,'trim-inset','Trim inward (%)',0,19,9);
      const panel = sheet(api,'KIT 04','Routing label',348,267);
      const route = text(panel,'Lane','North loading bay','trim-lane');
      const caption = strip(panel,route.value,'#3d2d16','#f3cc88');
      const band = strip(panel,'◩   ·   KEEP UPRIGHT   ·   ◪','#193024','#c4d5a9');
      Object.assign(band.style,{textAlign:'center',fontSize:'13px'});
      for (const [edge, side] of [['top','left'],['top','right'],['bottom','left'],['bottom','right']]) {
        const mark = make('span',undefined,{'aria-hidden':'true'});
        Object.assign(mark.style,{position:'absolute',[edge]:'5px',[side]:'5px',width:'6px',height:'6px',background:'#99bbd0'});
        panel.append(mark);
      }
      route.addEventListener('input',() => { caption.textContent = route.value; });
      return (scene,w,h) => {
        scene.grid();
        const [source,proof] = pair(w,h);
        const matrix = fit(api,panel,source);
        editable(scene,panel,matrix);
        const t = Number(inset.value)/100;
        const uv = [t,t,1-2*t,1-2*t];
        scene.surface(panel,extract(panel,proof,uv),{uv});
      };
    }
  };

  const alpha = {
    number:7, id:'alpha-edge-inspector', title:'Transparent edge inspector',
    summary:'Check an editable, semi-transparent caption over two backgrounds and sample the exact color at its edge.',
    mechanism:'The GPU composites browser-painted RGBA pixels, including antialiased glyphs, against a controlled backing. A sample from the final framebuffer includes the backing’s contribution and matches the exported image.',
    tryIt:'Change Backing to light squares, then lower Caption opacity and edit the caption.',
    test:{selector:'#alpha-backing',value:'light'},
    mount(api) {
      const backing = menu(api.controls,'Backing','alpha-backing',[['dark','Dark checkerboard'],['light','Light checkerboard']]);
      const opacity = range(api,'alpha-opacity','Caption opacity',15,100,72);
      const edgeSample = report(api.controls,'alpha-sample','Waiting for edge sample');
      api.onFallback?.(() => say(edgeSample,'Pixel measurement requires the native canvas'));
      const panel = api.panel('Transparent caption',333,232);
      Object.assign(panel.style,{background:'transparent',borderColor:'transparent',boxShadow:'none',position:'relative'});
      const message = text(panel,'Caption text','Set the zero reference','alpha-caption');
      Object.assign(message.parentElement.style,{background:'#172631',padding:'6px',borderRadius:'4px'});
      const headline = make('h2',message.value,{class:'source-title'});
      Object.assign(headline.style,{background:'#122433',color:'#eff9ff',borderRadius:'16px',padding:'18px',lineHeight:'1.3'});
      panel.append(headline);
      function update() {
        headline.textContent = message.value;
        headline.style.opacity = Number(opacity.value)/100;
      }
      for (const input of [message,opacity]) input.addEventListener('input',update);
      update();
      return (scene,w,h) => {
        scene.grid();
        const matrix = api.fit(panel,18,18,w-36,h-36);
        const [x,y] = point(matrix,0,0);
        const [right,bottom] = point(matrix,panel.offsetWidth,panel.offsetHeight);
        const colors = backing.value === 'light' ? [[.55,.62,.68,1],[.83,.88,.91,1]] : [[.08,.12,.2,1],[.19,.28,.4,1]];
        const sizeX = (right-x)/8, sizeY = (bottom-y)/6;
        for(let row=0; row<6; row++) for(let col=0; col<8; col++) {
          scene.solid(api.rect(x+col*sizeX,y+row*sizeY,sizeX,sizeY),colors[(row+col)%2]);
        }
        editable(scene,panel,matrix);
        const box = localBox(headline,panel);
        const rgb = scene.sample(...point(matrix,box.left + box.width - 14,box.top + 12)).slice(0,3);
        say(edgeSample, 'Caption edge RGB ' + rgb.join(' / '));
      };
    }
  };

  const ghosting = {
    number:8, id:'display-ghosting-proof', title:'Display ghosting proof',
    summary:'Keep a reference frame of a sign and see how retained pixels from the previous message could interfere with its replacement.',
    mechanism:'One GPU texture retains an exact source frame while native HTML continues accepting edits. Compositing the earlier and current paints preserves browser text, font and layout changes without reconstructing the earlier DOM or a text screenshot.',
    tryIt:'Capture the current reference, change the location text, then adjust Retained-frame opacity.',
    test:{selector:'#ghost-location',value:'North stair accessible'},
    mount(api) {
      const retention = range(api,'ghost-amount','Retained-frame opacity (%)',0,65,35);
      const panel = sheet(api,'Route sign','Slow-refresh proof',348,260);
      const route = text(panel,'Location','Exits via north stair','ghost-location');
      const headline = strip(panel,route.value,'#1f2c21','#c9d5a5');
      headline.style.fontSize = '26px';
      let retain = true;
      const state = report(api.controls,'ghost-state','Waiting for first paint');
      button(api.controls,'ghost-ref','Capture reference',() => { retain = true; api.invalidate(); });
      route.addEventListener('input',() => { headline.textContent = route.value; });
      return (scene,w,h) => {
        if (retain) {
          scene.freeze('prior-sign',panel);
          retain = false;
          say(state,'Reference · ' + route.value);
        }
        const [source,proof] = pair(w,h);
        scene.grid();
        editable(scene,panel,fit(api,panel,source));
        const projection = fit(api,panel,proof);
        scene.surface(panel,projection,{effect:'eink'});
        if (scene.frozen('prior-sign')) {
          scene.snapshot('prior-sign',projection,{effect:'eink',opacity:Number(retention.value)/100});
        }
      };
    }
  };

  const focus = {
    number:9, id:'multilingual-defocus-proof', title:'Small text defocus proof',
    summary:'Compare a multilingual instruction at normal focus and under a simulated blur to see which size survives an imperfect display.',
    mechanism:'The blur works on actual browser-shaped glyphs, bidirectional text and controls from the same live input. The renderer keeps native shaping and selection and exports the focused and defocused composite together.',
    tryIt:'Switch the instruction to Arabic, then adjust Glyph size and Blur radius.',
    test:{selector:'#defocus-language',value:'ar'},
    mount(api) {
      const language = menu(api.controls,'Instruction language','defocus-language',[['en','English'],['ar','Arabic'],['zh','Traditional Chinese']]);
      const size = range(api,'defocus-size','Glyph size (px)',12,27,18);
      const blur = range(api,'defocus-blur','Blur radius (pixels)',0,8,3);
      const samples = {en:'Tighten evenly · 8 N·m',ar:'أحكم الربط بالتساوي · ٨ نيوتن متر',zh:'均勻鎖緊 · 8 牛頓米'};
      const panel = sheet(api,'Assembly instruction','Focus check',348,248);
      const caption = text(panel,'Instruction',samples.en,'defocus-caption');
      const proof = strip(panel,caption.value,'#e4eae7','#203447');
      proof.style.marginTop = '13px';
      function update(reset = false) {
        const id = language.value;
        if (reset) caption.value = samples[id];
        caption.dir = proof.dir = id === 'ar' ? 'rtl' : 'ltr';
        caption.lang = proof.lang = id === 'zh' ? 'zh-Hant' : id;
        proof.textContent = caption.value;
        proof.style.fontSize = size.value + 'px';
      }
      language.addEventListener('change',() => update(true));
      for (const input of [caption,size]) input.addEventListener('input',() => update());
      update();
      return (scene,w,h) => {
        scene.grid();
        const [source,proofArea] = pair(w,h);
        editable(scene,panel,fit(api,panel,source));
        const radius = Number(blur.value);
        scene.surface(panel,fit(api,panel,proofArea),{effect:radius ? 'blur' : undefined,params:[radius,0,0,0]});
      };
    }
  };

  const brightnessMap = {
    number:10, id:'dashboard-brightness-map', title:'Dashboard brightness map',
    summary:'Find large bright regions that may distract operators on a low-light monitoring display.',
    mechanism:'The false-color view and pixel samples use native browser paint after labels, controls and surfaces have composited. This checks the final display instead of estimating brightness from stylesheet values.',
    tryIt:'Switch Display theme and compare the false-color panel and the 5 × 5 pixel sample tally.',
    test:{selector:'#dashboard-theme',value:'light'},
    mount(api) {
      const theme = menu(api.controls,'Display theme','dashboard-theme',[['dim','Dim'],['light','Bright']]);
      const value = report(api.controls,'dashboard-bright','Waiting for texture');
      api.onFallback?.(() => say(value,'Pixel measurement requires the native canvas'));
      const panel = sheet(api,'Exhaust monitoring','Display proof',350,273);
      const state = menu(panel,'Machine state','dashboard-machine',[['standby','Standby'],['online','Online']]);
      const overview = strip(panel,'Air quality · Standby','#d8eaf0','#27374b');
      const pressure = strip(panel,'Plenum pressure · −12 Pa','#a9d2d7','#27374b');
      function update() {
        const bright = theme.value === 'light';
        panel.style.background = bright ? '#e5edf2' : '#152431';
        panel.style.color = bright ? '#132a39' : '#e9f6ff';
        panel.querySelector('.source-title').style.color = panel.style.color;
        panel.querySelector('.source-kicker').style.color = bright ? '#28595b' : '';
        for (const badge of [overview,pressure]) {
          badge.style.background = bright ? '#f6e0ac' : '#27374b';
          badge.style.color = bright ? '#322710' : '#c9ddd6';
        }
        overview.textContent = state.value === 'online' ? 'Air quality · Online' : 'Air quality · Standby';
      }
      for (const control of [theme,state]) control.addEventListener('change',update);
      update();
      return (scene,w,h) => {
        scene.grid();
        const [source,proof] = pair(w,h);
        const matrix = fit(api,panel,source);
        editable(scene,panel,matrix);
        let total = 0;
        for (let row=0; row<5; row++) for(let col=0; col<5; col++) {
          const xy = point(matrix,(col+.5)*panel.offsetWidth/5,(row+.5)*panel.offsetHeight/5);
          if (luminance(scene.sample(...xy)) > .55) total++;
        }
        say(value,'Bright samples ' + total + ' of 25');
        scene.surface(panel,fit(api,panel,proof),{effect:'heat'});
      };
    }
  };

  window.CanvasDemos.push(contrast, loupe, redaction, vision, printCutoff, trim, alpha, ghosting, focus, brightnessMap);
})();
