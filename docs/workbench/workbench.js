'use strict';
(() => {
  const projects = window.workbenchProjects.sort((a,b) => a.number - b.number);
  const scenePainter = window.WorkbenchScene;
  const $ = id => document.getElementById(id);
  const canvas = $('scene');
  const surface = $('scene-surface');
  const flat = $('flat-annotation');
  const annotation = $('annotation');
  const note = $('annotation-note');
  const markerSelect = $('marker-select');
  const context = canvas.getContext('2d');
  const hasNative = typeof context?.drawElementImage === 'function' && typeof canvas.requestPaint === 'function';
  const resize = new ResizeObserver(() => requestDraw());
  const sessions = new Map();
  const media = new Map();
  const categories = ['Learning and research', 'Science and mathematics', 'Learning and research', 'Software and media', 'Decisions and practical work'];
  const categoryOf = n => categories[n <= 4 ? 0 : n <= 13 ? 1 : n <= 22 ? 2 : n <= 31 ? 3 : 4];
  const textTypes = /\.(txt|csv|tsv|json|md|markdown|log|obj|vtt|srt|dat|xyz|yaml|yml)$/i;
  const imageTypes = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const videoTypes = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
  const id = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  let project, session, result, view, selected, markers = [];
  let native = hasNative, nativeTimer, pendingDraw, pendingPng, placing = false, panning = false;
  let drag = null, playback = null, recording = null;
  let frameMediaUses = new Map();

  function element(tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function option(value, label = value) {
    const item = element('option',label);
    item.value = value;
    return item;
  }

  function button(label, action) {
    const control = element('button',label);
    control.type = 'button';
    control.addEventListener('click',action);
    return control;
  }

  function defaults(item) {
    return {
      values:Object.fromEntries(item.fields.map(field => [field.key,field.value])),
      sources:[], pins:[], notes:Object.create(null), reference:null, selected:null, camera:{scale:1,x:0,y:0}
    };
  }

  function normalizeNumber(field,value) {
    const min = field.min ?? -Infinity, max = field.max ?? Infinity;
    const step = Number(field.step), base = field.min ?? 0;
    const bounded = scenePainter.clamp(value,min,max);
    if (!(step > 0)) return bounded;
    const snapped = Number((base + Math.round((bounded-base)/step)*step).toPrecision(14));
    return scenePainter.clamp(snapped,min,max);
  }

  function renderCatalog() {
    const search = $('project-search').value.trim().toLowerCase();
    const category = $('project-category').value;
    const filtered = projects.filter(item =>
      (!category || categoryOf(item.number) === category) &&
      (!search || [item.title, item.summary, item.number].some(value => String(value).toLowerCase().includes(search)))
    );
    $('catalog-count').textContent = filtered.length + ' / ' + projects.length;
    $('project-list').replaceChildren(...filtered.map(item => {
      const link = element('a',item.title);
      link.href = '#' + item.id;
      if (project === item) link.setAttribute('aria-current','page');
      link.addEventListener('click',() => {
        if (matchMedia('(max-width: 650px)').matches) $('catalog').open = false;
      });
      const row = element('li');
      row.append(link);
      return row;
    }));
  }

  function renderFields() {
    const nodes = project.fields.map(field => {
      const row = element('div');
      row.className = 'field';
      const label = element('label',field.label);
      label.htmlFor = 'field-' + field.key;
      const input = element(field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'input');
      input.id = label.htmlFor;
      if (input.tagName === 'INPUT') input.type = field.type;
      if (field.type === 'textarea') input.rows = field.rows || 4;
      if (field.type === 'select') input.append(...field.options.map(value => option(value)));
      const numeric = field.type === 'number' || field.type === 'range';
      if (numeric) {
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        input.step = field.step ?? 'any';
      }
      if (field.type === 'checkbox') input.checked = session.values[field.key];
      else input.value = session.values[field.key];
      const readout = element('output');
      readout.htmlFor = input.id;
      function syncReadout() {
        readout.textContent = (field.type === 'range' ? input.value : '') + (field.unit ? ' ' + field.unit : '');
      }
      row.append(label);
      if (field.type === 'range' || field.unit) row.append(readout);
      row.append(input);
      syncReadout();
      input.addEventListener('input',() => {
        const value = numeric ? input.valueAsNumber : field.type === 'checkbox' ? input.checked : input.value;
        if (numeric && (!Number.isFinite(value) || !input.validity.valid)) return;
        session.values[field.key] = value;
        syncReadout();
        update();
      });
      input.addEventListener('change', () => {
        if (numeric && (!Number.isFinite(input.valueAsNumber) || !input.validity.valid)) input.value = session.values[field.key];
      });
      if (field.playback && field.type === 'range') {
        const play = button('Play',() => togglePlayback(field,input));
        play.id = 'play-' + field.key;
        row.append(play);
      }
      return row;
    });
    $('project-fields').replaceChildren(...nodes);
    $('play-scene').hidden = !project.fields.some(field => field.playback && field.type === 'range');
    $('project-actions').replaceChildren(...(project.actions || []).map(action => button(action.label,() => {
      try {
        stopPlayback();
        Object.assign(session.values,action.run({...session.values},session.sources));
        renderFields();
        update();
      } catch (error) {
        notice(error.message);
      }
    })));
  }

  function stopPlayback() {
    if (!playback) return;
    cancelAnimationFrame(playback.frame);
    $('play-' + playback.field.key).textContent = 'Play';
    $('play-scene').textContent = 'Play scene';
    playback = null;
  }

  function togglePlayback(field,input) {
    const wasPlaying = playback?.field === field;
    stopPlayback();
    if (wasPlaying) return;
    $('play-' + field.key).textContent = 'Pause';
    if (project.fields.find(item => item.playback && item.type === 'range') === field) {
      $('play-scene').textContent = 'Pause scene';
    }
    const min = Number(field.min), max = Number(field.max), step = Number(field.step) || 1;
    const start = performance.now();
    const initial = input.valueAsNumber >= max ? min : input.valueAsNumber;
    const duration = Number(session.values[field.durationKey]) || field.duration || Math.max(5,Math.min(30,max-min));
    playback = {field};
    function advance(now) {
      const value = Math.min(max,min + Math.round((initial - min + (now-start)*(max-min)/(duration*1000))/step)*step);
      if (value !== input.valueAsNumber) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
      }
      if (value < max) playback.frame = requestAnimationFrame(advance);
      else stopPlayback();
    }
    playback.frame = requestAnimationFrame(advance);
  }

  function renderSources() {
    $('source-list').replaceChildren(...session.sources.map(source => {
      const row = element('li',source.name + ' · ' + source.kind);
      const remove = button('Remove',() => {
        session.sources = session.sources.filter(entry => entry.id !== source.id);
        for (const [key,asset] of media) {
          if (asset.source === source) media.delete(key);
        }
        renderSources();
        update();
      });
      remove.setAttribute('aria-label','Remove ' + source.name);
      row.append(remove);
      return row;
    }));
  }

  function notice(message = '') {
    $('notice').textContent = message;
  }

  function stopRecording() {
    if (!recording) return;
    clearTimeout(recording.armTimer);
    if (!recording.started) releaseRecording(recording);
    else if (recording.recorder.state === 'recording') recording.recorder.stop();
  }

  function setProject(item, focus = false) {
    if (!item || project === item) return;
    stopRecording();
    stopPlayback();
    pendingPng = undefined;
    project = item;
    if (!sessions.has(item.id)) sessions.set(item.id,defaults(item));
    session = sessions.get(item.id);
    selected = session.selected;
    setPlacing(false);
    setPanning(false);
    $('zoom').value = String(session.camera.scale);
    $('pan').disabled = session.camera.scale === 1;
    notice();
    $('project-title').textContent = item.title;
    $('project-category-name').textContent = categoryOf(item.number);
    $('project-summary').textContent = item.summary;
    $('project-guide').textContent = item.guide;
    document.title = item.title + ' · Canvas Workbench';
    renderFields();
    renderSources();
    renderCatalog();
    update();
    if (focus) $('project-title').focus();
  }

  function route(focus) {
    const target = location.hash.slice(1);
    if (target === 'project-title') return;
    setProject(projects.find(item => item.id === target) || projects[0],focus);
  }

  function resultRows(metrics) {
    return (metrics || []).map(([label,value]) => {
      const row = element('div');
      row.append(element('dt',label),element('dd',value));
      return row;
    });
  }

  function update() {
    try {
      result = project.run({...session.values},session.sources);
    } catch (error) {
      result = {summary:'The current inputs could not be processed.',details:[error.message],scene:{kind:'board',shapes:[]}};
    }
    $('result-summary').textContent = result.summary;
    $('metrics').replaceChildren(...resultRows(result.metrics));
    const details = (result.details || []).map(text => element('li',text));
    if (session.reference) {
      details.push(element('li','Frozen reference — ' + session.reference.summary));
      if (session.reference.metrics?.length) {
        const list = element('dl');
        list.append(...resultRows(session.reference.metrics));
        details.at(-1).append(list);
      }
    }
    $('result-details').replaceChildren(...details);
    $('pin-reference').textContent = session.reference ? 'Clear reference' : 'Freeze reference';
    const projectMarkers = (result.scene.markers || []).filter(item => Number.isFinite(item.x) && Number.isFinite(item.y));
    markers = [...projectMarkers.map((marker,i) => ({...marker,key:String(marker.key ?? 'sample-' + i)})), ...session.pins];
    if (!markers.length) {
      // Every project can carry a note, including scenes without calculated markers.
      markers.push({key:'observation',label:'Observation',relative:true,x:32,y:70});
    }
    if (!markers.some(marker => marker.key === selected)) selected = markers[0].key;
    const existing = [...markerSelect.options].map(item => item.value + '\n' + item.textContent).join('\n');
    const requested = markers.map(marker => marker.key + '\n' + marker.label).join('\n');
    if (existing !== requested) markerSelect.replaceChildren(...markers.map(marker => option(marker.key,marker.label)));
    selectMarker(selected);
  }

  function selectMarker(key) {
    const marker = markers.find(item => item.key === key);
    if (!marker) return;
    selected = key;
    session.selected = key;
    markerSelect.value = key;
    $('annotation-title').textContent = marker.label;
    note.title = marker.detail || '';
    const saved = session.notes[key] || '';
    if (note.value !== saved) note.value = saved;
    $('remove-pin').hidden = !marker.pin;
    requestDraw();
  }

  function setPlacing(value) {
    if (value) setPanning(false);
    placing = value;
    surface.classList.toggle('placing',value);
    $('place-pin').setAttribute('aria-pressed',String(value));
    $('place-pin').textContent = value ? 'Cancel pin' : 'Place pin';
  }

  function setPanning(value) {
    if (value) setPlacing(false);
    panning = value;
    drag = null;
    surface.classList.toggle('panning',value);
    $('pan').setAttribute('aria-pressed',String(value));
    $('pan').textContent = value ? 'Finish panning' : 'Pan view';
  }

  function moveCamera(dx,dy) {
    const camera = session.camera, limit = (camera.scale-1)/2;
    camera.x = scenePainter.clamp(camera.x+dx,-limit,limit);
    camera.y = scenePainter.clamp(camera.y+dy,-limit,limit);
    requestDraw();
  }

  function viewTransform(base,width,height) {
    const {scale,x,y} = session.camera;
    const ox = ((1-scale)/2+x)*width, oy = ((1-scale)/2+y)*height;
    const screenX = position => position*scale+ox, screenY = position => position*scale+oy;
    return {
      scale, ox, oy,
      left:screenX(base.left), top:screenY(base.top), w:base.w*scale, h:base.h*scale,
      x:value => screenX(base.x(value)), y:value => screenY(base.y(value)),
      from:(sx,sy) => base.from((sx-ox)/scale,(sy-oy)/scale)
    };
  }

  function mediaFor(sourceId, time) {
    const source = session.sources.find(item => item.id === sourceId) ||
      session.reference?.sources?.find(item => item.id === sourceId);
    if (!source?.url) return null;
    const index = frameMediaUses.get(sourceId) || 0;
    frameMediaUses.set(sourceId,index+1);
    const key = source.kind === 'video' ? sourceId + ':' + index : sourceId;
    if (!media.has(key)) {
      const asset = document.createElement(source.kind === 'video' ? 'video' : 'img');
      asset.addEventListener(source.kind === 'video' ? 'seeked' : 'load',requestDraw);
      if (source.kind === 'video') {
        asset.muted = true;
        asset.preload = 'auto';
        asset.addEventListener('loadeddata',requestDraw);
        asset.addEventListener('durationchange',requestDraw);
      }
      asset.addEventListener('error',() => notice('Could not open ' + source.name + ' in this browser.'));
      asset.src = source.url;
      media.set(key,{asset,source});
    }
    const entry = media.get(key), {asset} = entry;
    if (source.kind === 'video' && asset.readyState >= 2 && !asset.seeking && Number.isFinite(time)) {
      const duration = asset.duration;
      const target = Math.max(0,Math.min(time,Number.isFinite(duration) ? duration-.001 : Infinity));
      if (entry.seekTarget !== target && Math.abs(asset.currentTime-target) > .03) {
        entry.seekTarget = target;
        asset.currentTime = target;
      }
    }
    if (source.kind === 'video' && asset.readyState < 2) return null;
    return asset;
  }

  function renderedMarkers(map) {
    return markers.map(marker => {
      if (!marker.relative) return marker;
      return {...marker,...map.from(map.left + map.w * marker.x/100,map.top + map.h * marker.y/100)};
    });
  }

  function render(painted) {
    if (!result || !context) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(2,devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(ratio,0,0,ratio,0,0);
    context.fillStyle = '#101a25';
    context.fillRect(0,0,width,height);
    frameMediaUses = new Map();
    const scene = result.scene;
    const frozen = session.reference?.scene;
    const reference = frozen?.kind === 'plot' && (frozen.xLabel !== scene.xLabel || frozen.yLabel !== scene.yLabel)
      ? null : frozen;
    const base = scenePainter.axes(scene,width,height,reference);
    view = viewTransform(base,width,height);
    const liveMarkers = renderedMarkers(base);
    context.setTransform(ratio*view.scale,0,0,ratio*view.scale,ratio*view.ox,ratio*view.oy);
    scenePainter.draw(context,scene,base,reference,liveMarkers,selected,mediaFor);
    context.setTransform(ratio,0,0,ratio,0,0);
    const marker = liveMarkers.find(item => item.key === selected);
    if (!marker) return;
    const cardWidth = annotation.offsetWidth || 164, cardHeight = annotation.offsetHeight || 82;
    const bounds = scenePainter.notePosition(view.x(marker.x),view.y(marker.y),cardWidth,cardHeight,width,height);
    if (native && painted) {
      try {
        context.drawElementImage(annotation,bounds.x,bounds.y,cardWidth,cardHeight);
        clearTimeout(nativeTimer);
        $('renderer-status').textContent = 'HTML-in-Canvas';
      } catch (error) {
        useNative(false);
        notice('The live canvas could not draw this annotation. The plain view is active.');
        return;
      }
    } else if (!native) {
      annotation.style.left = bounds.x + 'px';
      annotation.style.top = bounds.y + 'px';
      if (pendingPng) scenePainter.exportNote(context,{...bounds,width:cardWidth,height:cardHeight},marker,note.value);
    }
    if (recording) {
      recording.note = native ? null : {bounds:{...bounds,width:cardWidth,height:cardHeight},marker,text:note.value};
    }
    if (pendingPng && (painted || !native)) {
      const name = pendingPng;
      pendingPng = undefined;
      canvas.toBlob(blob => {
        if (blob) download(blob,name);
        else notice('The current frame could not be saved.');
      },'image/png');
      if (!native) requestDraw();
    }
  }

  function requestDraw() {
    if (pendingDraw !== undefined) return;
    pendingDraw = requestAnimationFrame(() => {
      pendingDraw = undefined;
      if (native) {
        canvas.requestPaint();
      } else {
        render(false);
      }
    });
  }

  function useNative(enabled) {
    clearTimeout(nativeTimer);
    native = enabled && hasNative;
    if (native) {
      annotation.style.removeProperty('left');
      annotation.style.removeProperty('top');
      canvas.append(annotation);
      $('renderer-status').textContent = 'Preparing canvas';
      requestDraw();
      nativeTimer = setTimeout(() => {
        useNative(false);
        notice('This browser did not paint the live annotation. The plain view is active.');
      },2500);
    } else {
      flat.append(annotation);
      $('renderer-status').textContent = 'Plain view';
      requestDraw();
    }
    $('render-mode').textContent = native ? 'Use plain view' : 'Use HTML-in-Canvas';
  }

  function handleCanvasClick(event) {
    if (event.target !== canvas || !view || panning) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (placing) {
      const key = 'pin-' + id();
      const point = view.from(x,y);
      session.pins.push({...point,key,label:'Pin ' + (session.pins.length+1),pin:true});
      selected = key;
      setPlacing(false);
      update();
      note.focus();
      return;
    }
    let nearest, distance = 21;
    for (const marker of renderedMarkers(view)) {
      const delta = Math.hypot(view.x(marker.x)-x,view.y(marker.y)-y);
      if (delta < distance) { nearest = marker; distance = delta; }
    }
    if (nearest) selectMarker(nearest.key);
  }

  function download(blob,name) {
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  }

  function asDataUrl(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  function normalizeMedia(url,kind) {
    const match = typeof url === 'string' && url.match(/^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i);
    const acceptable = kind === 'image' ? /^image\/(png|jpeg|gif|webp|bmp|avif|x-ms-bmp)$/i : /^video\/(mp4|webm|ogg|quicktime|x-m4v)$/i;
    return match && acceptable.test(match[1]) ? url : null;
  }

  function loadSource(file) {
    const source = {id:id(),name:file.name};
    if (imageTypes.test(file.name) || videoTypes.test(file.name)) {
      source.kind = imageTypes.test(file.name) ? 'image' : 'video';
      let type = file.type;
      if (!type || type === 'application/octet-stream') {
        const ext = file.name.split('.').at(-1).toLowerCase();
        const subtype = ({jpg:'jpeg',ogv:'ogg',mov:'quicktime',m4v:'x-m4v'})[ext] || ext;
        type = source.kind + '/' + subtype;
      }
      return asDataUrl(file.slice(0,file.size,type)).then(url => {
        source.url = normalizeMedia(url,source.kind);
        if (!source.url) throw new Error('Unsupported media type for ' + file.name);
        return source;
      });
    }
    if (textTypes.test(file.name) || file.type.startsWith('text/')) {
      source.kind = 'text';
      return file.text().then(text => ({...source,text}));
    }
    return Promise.reject(new Error('Unsupported file type for ' + file.name));
  }

  function addSources(files) {
    const target = session;
    Promise.allSettled([...files].map(loadSource)).then(items => {
      const problems = [];
      for (const item of items) {
        if (item.status === 'fulfilled') target.sources.push(item.value);
        else problems.push(item.reason.message);
      }
      if (session !== target) return;
      renderSources();
      update();
      notice(problems.join(' '));
    });
  }

  function restoredSources(sources) {
    if (!Array.isArray(sources)) return [];
    const verified = [];
    for (const source of sources) {
      if (!source || typeof source.id !== 'string' || typeof source.name !== 'string') continue;
      if (source.kind === 'text' && typeof source.text === 'string') verified.push({id:source.id,name:source.name,kind:'text',text:source.text});
      if (['image','video'].includes(source.kind) && normalizeMedia(source.url,source.kind)) {
        verified.push({id:source.id,name:source.name,kind:source.kind,url:source.url});
      }
    }
    return verified;
  }

  function restoredValues(item, savedValues) {
    const values = {};
    for (const field of item.fields) {
      const value = Object.hasOwn(savedValues,field.key) ? savedValues[field.key] : undefined;
      values[field.key] = field.value;
      if (field.type === 'select' && field.options.includes(value)) values[field.key] = value;
      if (field.type === 'checkbox' && typeof value === 'boolean') values[field.key] = value;
      if (['text','textarea'].includes(field.type) && typeof value === 'string') values[field.key] = value;
      if (['range','number'].includes(field.type) && Number.isFinite(value)) {
        values[field.key] = normalizeNumber(field,value);
      }
    }
    return values;
  }

  function importSession(saved) {
    const item = projects.find(entry => entry.id === saved?.project);
    if (saved?.version !== 1 || !item || typeof saved.values !== 'object' || !saved.values) {
      throw new Error('Choose a JSON session saved by Canvas Workbench.');
    }
    const restored = defaults(item);
    restored.values = restoredValues(item,saved.values);
    restored.sources = restoredSources(saved.sources);
    if (Array.isArray(saved.pins)) {
      restored.pins = saved.pins.filter(pin => pin && typeof pin.key === 'string' && typeof pin.label === 'string' &&
        Number.isFinite(pin.x) && Number.isFinite(pin.y)).map(pin => ({x:pin.x,y:pin.y,label:pin.label,key:pin.key,pin:true}));
    }
    if (saved.camera && [1,1.25,1.5,2,2.5].includes(saved.camera.scale)) {
      const limit = (saved.camera.scale-1)/2;
      restored.camera = {
        scale:saved.camera.scale,
        x:scenePainter.clamp(Number(saved.camera.x) || 0,-limit,limit),
        y:scenePainter.clamp(Number(saved.camera.y) || 0,-limit,limit)
      };
    }
    for (const [key,value] of Object.entries(saved.notes || {})) {
      if (typeof value === 'string') restored.notes[key] = value.slice(0,4000);
    }
    if (typeof saved.selected === 'string') restored.selected = saved.selected;
    if (saved.referenceValues && typeof saved.referenceValues === 'object') {
      try {
        const pool = [...restored.sources,...restoredSources(saved.referenceSources)];
        const baseline = Array.isArray(saved.referenceSourceIds)
          ? saved.referenceSourceIds.map(id => pool.find(source => source.id === id)).filter(Boolean) : restored.sources;
        const values = restoredValues(item,saved.referenceValues);
        const ref = item.run(values,baseline);
        restored.reference = {...ref,values,sources:baseline};
      } catch (error) {
        // Restore the current work even if the prior reference cannot be computed.
      }
    }
    sessions.set(item.id,restored);
    project = null;
    media.clear();
    setProject(item);
    history.replaceState(null,'','#' + item.id);
    notice('Session opened.');
  }

  function exportPng() {
    if (!context) return;
    pendingPng = project.id + '.png';
    requestDraw();
  }

  const recordingType = ['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm']
    .find(type => window.MediaRecorder?.isTypeSupported(type));

  function drawRecordingFrame(capture) {
    const {mirror, painter, track, note: snapshot} = capture;
    if (!canvas.width || !canvas.height || !canvas.clientWidth || !canvas.clientHeight) return;
    const scale = Math.min(mirror.width / canvas.width,mirror.height / canvas.height);
    const width = canvas.width * scale, height = canvas.height * scale;
    const x = (mirror.width - width) / 2, y = (mirror.height - height) / 2;
    track.requestFrame?.();
    painter.resetTransform();
    painter.fillStyle = '#101a25';
    painter.fillRect(0,0,mirror.width,mirror.height);
    painter.drawImage(canvas,x,y,width,height);
    if (snapshot) {
      painter.setTransform(width/canvas.clientWidth,0,0,height/canvas.clientHeight,x,y);
      scenePainter.exportNote(painter,snapshot.bounds,snapshot.marker,snapshot.text);
    }
  }

  function hasEncodedFrame(blob) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      let finished = false;
      function done(valid) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        video.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve(valid);
      }
      const timer = setTimeout(() => done(false),5000);
      video.addEventListener('loadeddata',() => done(video.videoWidth > 0),{once:true});
      video.addEventListener('error',() => done(false),{once:true});
      video.muted = true;
      video.preload = 'auto';
      video.src = url;
    });
  }

  function releaseRecording(capture) {
    cancelAnimationFrame(capture.frame);
    clearTimeout(capture.armTimer);
    for (const track of capture.stream.getTracks()) track.stop();
    capture.mirror.remove();
    if (recording === capture) {
      recording = null;
      $('record').textContent = 'Record WebM';
      $('record').disabled = false;
      $('play-scene').disabled = false;
    }
  }

  function startRecording(retried = false) {
    if (recording) { stopRecording(); return; }
    if (!recordingType || !canvas.captureStream || !canvas.width || !canvas.height) return;
    const mirror = document.createElement('canvas');
    let stream;
    try {
      // Mirror the completed stage outside its paint event so the capture sees a regular canvas.
      mirror.width = canvas.width;
      mirror.height = canvas.height;
      mirror.setAttribute('aria-hidden','true');
      Object.assign(mirror.style,{position:'fixed',top:'0',left:'0',width:'1px',height:'1px',pointerEvents:'none'});
      document.body.append(mirror);
      const painter = mirror.getContext('2d');
      painter.drawImage(canvas,0,0);
      stream = mirror.captureStream(24);
      const recorder = new MediaRecorder(stream,{mimeType:recordingType});
      const name = project.id, clips = [];
      const capture = {mirror,painter,stream,track:stream.getVideoTracks()[0],
        recorder,frame:undefined,note:null,failed:false,started:false};
      recording = capture;
      recorder.ondataavailable = event => { if (event.data.size) clips.push(event.data); };
      recorder.onerror = () => { capture.failed = true; };
      recorder.onstart = () => {
        clearTimeout(capture.armTimer);
        if (recording !== capture || capture.failed || recorder.state !== 'recording') return;
        $('record').textContent = 'Stop and save WebM';
        $('record').disabled = false;
        $('play-scene').disabled = false;
      };
      recorder.onstop = async () => {
        releaseRecording(capture);
        if (capture.retry) {
          startRecording(true);
          return;
        }
        const clip = new Blob(clips,{type:'video/webm'});
        if (!capture.failed && clip.size && await hasEncodedFrame(clip)) download(clip,name + '.webm');
        else if (!recording) notice('No video frame was recorded. Keep the workbench visible while recording.');
      };
      $('record').textContent = 'Preparing recording';
      $('record').disabled = true;
      $('play-scene').disabled = true;
      requestDraw();
      let previous = -Infinity;
      const tick = now => {
        if (recorder.state !== 'recording') return;
        if (now - previous >= 1000/24) {
          drawRecordingFrame(capture);
          previous = now;
        }
        capture.frame = requestAnimationFrame(tick);
      };
      capture.frame = requestAnimationFrame(() => {
        drawRecordingFrame(capture);
        capture.frame = requestAnimationFrame(() => {
          try {
            recorder.start();
            capture.started = true;
            capture.armTimer = setTimeout(() => {
              capture.failed = true;
              capture.retry = !retried;
              recorder.stop();
            },3500);
            drawRecordingFrame(capture);
            capture.frame = requestAnimationFrame(tick);
          } catch (error) {
            releaseRecording(capture);
            notice('Recording is unavailable in this browser. PNG export is available.');
          }
        });
      });
    } catch (error) {
      recording = null;
      stream?.getTracks().forEach(track => track.stop());
      mirror.remove();
      notice('Recording is unavailable in this browser. PNG export is available.');
    }
  }

  if (!projects.length) {
    $('project-summary').textContent = 'No project files loaded. Open index.html alongside its project scripts.';
    return;
  }
  if (!context) {
    $('renderer-status').textContent = 'Canvas 2D unavailable';
    $('export-image').disabled = true;
    $('place-pin').disabled = true;
  }
  $('project-category').append(option('','All categories'),...[...new Set(categories)].map(value => option(value)));
  $('project-search').addEventListener('input',renderCatalog);
  $('project-category').addEventListener('change',renderCatalog);
  window.addEventListener('hashchange',() => route(true));
  if (matchMedia('(max-width: 650px)').matches) $('catalog').open = false;
  markerSelect.addEventListener('change',() => selectMarker(markerSelect.value));
  note.addEventListener('input',() => {
    session.notes[selected] = note.value;
    requestDraw();
  });
  $('place-pin').addEventListener('click',() => setPlacing(!placing));
  $('zoom').addEventListener('change', event => {
    session.camera.scale = Number(event.target.value);
    moveCamera(0,0);
    $('pan').disabled = session.camera.scale === 1;
    if ($('pan').disabled) setPanning(false);
  });
  $('pan').addEventListener('click',() => setPanning(!panning));
  canvas.addEventListener('pointerdown',event => {
    if (!panning || event.target !== canvas || event.button !== 0) return;
    drag = {x:event.clientX,y:event.clientY,id:event.pointerId};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event => {
    if (drag?.id !== event.pointerId) return;
    moveCamera((event.clientX-drag.x)/canvas.clientWidth,(event.clientY-drag.y)/canvas.clientHeight);
    drag = {x:event.clientX,y:event.clientY,id:event.pointerId};
  });
  canvas.addEventListener('lostpointercapture',() => { drag = null; });
  canvas.addEventListener('keydown',event => {
    if (event.target !== canvas || session.camera.scale === 1) return;
    const movement = {ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]}[event.key];
    if (movement) {
      event.preventDefault();
      moveCamera(...movement);
    }
  });
  $('remove-pin').addEventListener('click',() => {
    session.pins = session.pins.filter(pin => pin.key !== selected);
    delete session.notes[selected];
    update();
  });
  $('pin-reference').addEventListener('click',() => {
    session.reference = session.reference ? null : {...structuredClone(result),values:{...session.values},sources:[...session.sources]};
    update();
  });
  canvas.addEventListener('click',handleCanvasClick);
  canvas.addEventListener('paint',() => { if (native) render(true); });
  $('export-image').addEventListener('click',exportPng);
  $('play-scene').addEventListener('click',() => {
    const field = project.fields.find(item => item.playback && item.type === 'range');
    if (field) togglePlayback(field,$('field-' + field.key));
  });
  $('render-mode').hidden = !hasNative;
  $('render-mode').addEventListener('click',() => useNative(!native));
  $('record').hidden = !(canvas.captureStream && recordingType);
  $('record').addEventListener('click',() => startRecording());
  $('source-files').addEventListener('change',event => {
    addSources(event.target.files);
    event.target.value = '';
  });
  $('open-session').addEventListener('click',() => $('session-file').click());
  $('session-file').addEventListener('change',async event => {
    try {
      if (event.target.files[0]) importSession(JSON.parse(await event.target.files[0].text()));
    } catch (error) {
      notice(error.message);
    } finally {
      event.target.value = '';
    }
  });
  $('save-session').addEventListener('click',() => {
    const {values,sources,pins,notes,reference,camera,selected:activePin} = session;
    const data = {version:1,project:project.id,values,sources,pins,notes,camera,selected:activePin,
      referenceValues:reference?.values,referenceSourceIds:reference?.sources.map(source => source.id),
      referenceSources:reference?.sources.filter(source => !sources.some(current => current.id === source.id))};
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),project.id + '.json');
  });
  $('reset').addEventListener('click',() => {
    const current = project;
    sessions.delete(current.id);
    media.clear();
    project = null;
    setProject(current);
    notice('Project reset to its sample data.');
  });
  route(false);
  resize.observe(surface);
  useNative(hasNative);
})();
