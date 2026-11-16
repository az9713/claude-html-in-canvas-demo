'use strict';

(() => {
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function heading(panel, eyebrow, title) {
    const header = node('header');
    header.append(node('p', eyebrow, 'source-kicker'), node('h2', title, 'source-title'));
    panel.append(header);
    return header.lastChild;
  }

  function input(parent, label, id, value, type = 'text') {
    const wrapper = node('label', label);
    const control = node('input');
    control.id = id;
    control.type = type;
    control.value = value;
    wrapper.append(control);
    parent.append(wrapper);
    return control;
  }

  function select(parent, label, id, entries) {
    const wrapper = node('label', label);
    const control = node('select');
    control.id = id;
    entries.forEach(([value, text]) => {
      const option = node('option', text);
      option.value = value;
      control.append(option);
    });
    wrapper.append(control);
    parent.append(wrapper);
    return control;
  }

  function textarea(parent, label, id, value, rows = 3) {
    const wrapper = node('label', label);
    const control = node('textarea');
    control.id = id;
    control.rows = rows;
    control.value = value;
    wrapper.append(control);
    parent.append(wrapper);
    return control;
  }

  function slider(parent, label, id, min, max, value) {
    const control = input(parent, label, id, value, 'range');
    control.min = min;
    control.max = max;
    const number = node('output', String(value));
    control.parentElement.append(number);
    control.addEventListener('input', () => { number.textContent = control.value; });
    return control;
  }

  function status(parent, id, initial) {
    const output = node('output', initial, 'source-status');
    output.id = id;
    output.setAttribute('aria-live', 'polite');
    parent.append(output);
    return output;
  }

  function pushButton(parent, label, id) {
    const button = node('button', label);
    button.type = 'button';
    button.id = id;
    parent.append(button);
    return button;
  }

  function live(scene, panel, transform) {
    scene.surface(panel, transform);
    scene.register(panel, transform);
  }

  function halves(width, height) {
    const edge = 12;
    const gap = 12;
    if (width >= 640) {
      const half = (width - 2 * edge - gap) / 2;
      return [[edge, edge, half, height - 2 * edge],
        [edge + half + gap, edge, half, height - 2 * edge]];
    }
    const half = (height - 2 * edge - gap) / 2;
    return [[edge, edge, width - 2 * edge, half],
      [edge, edge + half + gap, width - 2 * edge, half]];
  }

  const ink = [.09, .15, .19, 1];
  const line = [.30, .47, .50, 1];
  const accent = [.50, .86, .74, 1];
  const amber = [.90, .66, .34, 1];

  const projects = [{
    number: 11,
    id: 'print-label-imposition',
    title: 'Print label imposition',
    summary: 'Impose an editable shelf label as a sheet of aligned copies for two machine feed orientations.',
    mechanism: 'The editable label editor and the browser-laid-out print face are composited together. One raster of the print face supplies the entire repeat layout, so changing or rotating a run of copies does not require recreating its type layout in canvas text.',
    tryIt: 'Edit the shelf description, change the copy count, or switch the paper feed. Check the sheet alignment before saving a proof.',
    test: {selector: '#label-description', value: 'Oversize return bin'},
    mount(api) {
      const editor = api.panel('Shelf label editor', 320, 232);
      heading(editor, 'Warehouse print proof', 'Shelf label');
      const description = input(editor, 'Shelf description', 'label-description', 'Small pump spares');
      const code = input(editor, 'Stock code', 'label-stock-code', 'A–014');
      const print = api.panel('Rendered label stock', 260, 112);
      Object.assign(print.style, {background: '#f0e6d2', color: '#183837', padding: '8px 10px'});
      const title = heading(print, 'Spare parts · Aisle 3', description.value);
      const stock = node('p', code.value);
      Object.assign(title.style, {color: '#183837', whiteSpace: 'nowrap'});
      Object.assign(print.firstChild.firstChild.style, {color: '#365B55', margin: '0'});
      Object.assign(stock.style, {color: '#365B55', margin: '4px 0 0'});
      print.append(stock);
      print.inert = true;
      const copies = slider(api.controls, 'Copies on sheet', 'label-copies', 1, 6, 4);
      const feed = select(api.controls, 'Paper feed', 'label-feed', [['cross', 'Crosswise'], ['long', 'Lengthwise']]);
      function refresh() {
        title.textContent = description.value || 'Untitled shelf';
        stock.textContent = code.value || 'No stock code';
      }
      editor.addEventListener('input', refresh);
      return (scene, width, height) => {
        scene.grid();
        const [edit, output] = halves(width, height);
        live(scene, editor, api.fit(editor, ...edit));
        const [x, y, w, h] = output;
        const count = Number(copies.value);
        const turned = feed.value === 'long';
        const itemWidth = turned ? 112 : 260;
        const itemHeight = turned ? 260 : 112;
        const columns = Math.ceil(count / 2);
        const rows = Math.ceil(count / columns);
        const gap = 12;
        const scale = Math.min((w - 24 - gap * (columns - 1)) / (itemWidth * columns),
          (h - 24 - gap * (rows - 1)) / (itemHeight * rows));
        const fullWidth = itemWidth * scale;
        const rowHeight = itemHeight * scale;
        const sheetWidth = columns * fullWidth + gap * (columns - 1);
        const sheetHeight = rows * rowHeight + gap * (rows - 1);
        const start = y + (h - sheetHeight) / 2;
        const startX = x + (w - sheetWidth) / 2;
        scene.solid(api.rect(startX - 7, start - 7, sheetWidth + 14, sheetHeight + 14), ink);
        for (let copy = 0; copy < count; copy++) {
          const top = start + Math.floor(copy / columns) * (rowHeight + gap);
          const left = startX + (copy % columns) * (fullWidth + gap);
          const matrix = turned
            ? new DOMMatrix().translate(left + fullWidth, top).rotate(0, 0, 90).scale(scale)
            : new DOMMatrix().translate(left, top).scale(scale);
          scene.surface(print, matrix);
          scene.solid(api.rect(left - 4, top - 3, 8, 1), amber);
          scene.solid(api.rect(left + fullWidth - 4, top + rowHeight + 3, 8, 1), amber);
        }
      };
    }
  }, {
    number: 12,
    id: 'kiosk-safe-area',
    title: 'Kiosk keyboard safe area',
    summary: 'Check whether an onscreen keyboard covers the submit control on a narrow visitor kiosk.',
    mechanism: 'The second view scissors the same browser-painted form into a hardware viewport and adds a keyboard mask. It exposes occlusion using the actual input and button layout, with no second UI to synchronize or paint by hand.',
    tryIt: 'Enter a visitor code in the live form and increase keyboard coverage. Enable Raise form to see the workaround and submit the code.',
    test: {selector: '#kiosk-coverage', value: '51'},
    mount(api) {
      const kiosk = api.panel('Visitor kiosk form', 294, 267);
      kiosk.style.position = 'relative';
      heading(kiosk, 'Lobby · Visitor access', 'Visitor check-in');
      const code = input(kiosk, 'Visitor code', 'visitor-code', 'DEMO–84');
      const company = input(kiosk, 'Company', 'visitor-company', 'Example Co.');
      const submit = pushButton(kiosk, 'Confirm check-in', 'kiosk-submit');
      const feedback = status(kiosk, 'kiosk-result', 'Ready for input');
      submit.addEventListener('click', () => {
        feedback.textContent = code.value.trim() && company.value.trim() ? 'Check-in preview confirmed' : 'Complete both fields';
      });
      const cover = slider(api.controls, 'Keyboard coverage (%)', 'kiosk-coverage', 12, 62, 33);
      const lifted = select(api.controls, 'Kiosk adjustment', 'kiosk-lift', [['fixed', 'Fixed form'], ['raised', 'Raise form']]);
      const report = status(api.controls, 'kiosk-occlusion', 'Checking submit position');
      return (scene, width, height) => {
        scene.grid();
        const [left, right] = halves(width, height);
        live(scene, kiosk, api.fit(kiosk, ...left));
        const [x, y, w, h] = right;
        const origin = api.fit(kiosk, x, y, w, h);
        const panelWidth = kiosk.offsetWidth * origin.a;
        const panelHeight = kiosk.offsetHeight * origin.d;
        const maskHeight = panelHeight * Number(cover.value) / 100;
        const maskTop = origin.f + panelHeight - maskHeight;
        const shift = lifted.value === 'raised' ? maskHeight * .82 : 0;
        const screen = new DOMMatrix().translate(0, -shift).multiply(origin);
        scene.clip(origin.e, origin.f, panelWidth, panelHeight, () => scene.surface(kiosk, screen));
        scene.solid(api.rect(origin.e, maskTop, panelWidth, maskHeight), [.15, .21, .24, 1]);
        const keyH = Math.max(1, (maskHeight - 12) / 4);
        const keyW = (panelWidth - 20) / 9;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 9; c++) {
            scene.solid(api.rect(origin.e + 9 + c * keyW, maskTop + 4 + r * keyH, Math.max(2, keyW - 3), Math.max(2, keyH - 3)), line);
          }
        }
        const buttonBottom = screen.f + (submit.offsetTop + submit.offsetHeight) * screen.d;
        const message = buttonBottom > maskTop ? 'Preview: keyboard overlaps Confirm' : 'Preview: Confirm clears the keyboard';
        if (report.textContent !== message) report.textContent = message;
      };
    }
  }, {
    number: 13,
    id: 'teleprompter-glass-proof',
    title: 'Teleprompter glass proof',
    summary: 'Edit a cue in normal writing order while checking the mirrored, clipped feed for a reflecting prompter.',
    mechanism: 'The source editor keeps its native caret and character shaping. The compositor separately reflects the painted cue, clips it to a glass viewport, and keeps the whole proof exportable.',
    tryIt: 'Type a cue with mixed directions. Switch to Glass mirror, scrub the scroll position, and compare truncation at the guide line.',
    test: {selector: '#script-scroll', value: '72'},
    mount(api) {
      const editor = api.panel('Cue script editor', 316, 233);
      heading(editor, 'Studio scripts', 'Prompt operator');
      const cue = textarea(editor, 'Cue', 'operator-cue', 'Welcome to the field demonstration.\n\nPause at the sample tray.\nRead the next line before pointing to the output.\n\nالعينة ٣ · sample three', 5);
      const cuePanel = api.panel('Rendered prompter cue', 300, 228);
      heading(cuePanel, 'Cue preview', 'Field demonstration');
      const words = node('p', cue.value);
      words.dir = 'auto';
      Object.assign(words.style, {whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBlock: '5px', fontSize: '15px'});
      cuePanel.append(words);
      cuePanel.inert = true;
      cue.addEventListener('input', () => { words.textContent = cue.value; });
      const position = slider(api.controls, 'Scroll position (%)', 'script-scroll', 0, 100, 22);
      const image = select(api.controls, 'Prompter orientation', 'script-image', [['direct', 'Direct view'], ['mirror', 'Glass mirror']]);
      return (scene, width, height) => {
        scene.grid();
        const [left, right] = halves(width, height);
        live(scene, editor, api.fit(editor, ...left));
        const frame = api.fit(cuePanel, ...right);
        const w = cuePanel.offsetWidth * frame.a;
        const h = cuePanel.offsetHeight * frame.d;
        const viewportHeight = h * .65;
        const y = frame.f + (h - viewportHeight) / 2;
        const scroll = (h - viewportHeight) * Number(position.value) / 100;
        let content = new DOMMatrix().translate(0, y - frame.f - scroll).multiply(frame);
        if (image.value === 'mirror') {
          content = new DOMMatrix().translate(2 * frame.e + w, 0).scale(-1, 1).multiply(content);
        }
        scene.solid(api.rect(frame.e - 6, y - 6, w + 12, viewportHeight + 12), ink);
        scene.clip(frame.e, y, w, viewportHeight, () => scene.surface(cuePanel, content));
        scene.solid(api.rect(frame.e - 5, y + viewportHeight * .48, w + 10, 1), accent);
      };
    }
  }, {
    number: 14,
    id: 'floor-plan-wayfinding',
    title: 'Floor-plan wayfinding proof',
    summary: 'Rename and reorient room signs on a schematic floor plan while keeping their hit targets on their rooms.',
    mechanism: 'Native editable signs are textures in the same rotated plan as walls and route stripes. Saving the plan includes the sign glyphs and inputs at the exact tested orientation, without overlay alignment or a separate print layout.',
    tryIt: 'Rename the workshop sign, then rotate the plan or zoom the signs. Verify that you can still select each text field on its room.',
    test: {selector: '#route-rotation', value: '37'},
    mount(api) {
      const left = api.panel('Workshop wayfinding sign', 226, 126);
      const right = api.panel('Exit wayfinding sign', 226, 126);
      heading(left, 'Zone A · North', 'Workshop');
      heading(right, 'Zone B · South', 'Side exit');
      input(left, 'Sign label', 'workshop-sign', 'Training room');
      input(right, 'Sign label', 'exit-sign', 'Accessible exit');
      const angle = slider(api.controls, 'Plan rotation (°)', 'route-rotation', -38, 38, -12);
      const zoom = slider(api.controls, 'Plan zoom (%)', 'route-zoom', 70, 106, 91);
      return (scene, width, height) => {
        scene.grid();
        const degrees = Number(angle.value);
        const radians = degrees * Math.PI / 180;
        const sine = Math.abs(Math.sin(radians));
        const cosine = Math.abs(Math.cos(radians));
        const rotatedWidth = 564 * cosine + 314 * sine;
        const rotatedHeight = 564 * sine + 314 * cosine;
        const scale = Math.min((width - 20) / rotatedWidth, (height - 20) / rotatedHeight) * Number(zoom.value) / 106;
        const map = new DOMMatrix().translate(width / 2, height / 2).rotate(0, 0, degrees)
          .scale(scale).translate(-282, -157);
        const room = (x, y, w, h, color) => {
          scene.solid(api.rect(x,y,w,h).map(point => map.transformPoint(point)), color);
        };
        room(0, 0, 564, 314, line);
        room(5, 5, 243, 304, ink);
        room(316, 5, 243, 304, ink);
        room(256, 5, 52, 304, [.12, .23, .25, 1]);
        room(280, 25, 4, 264, accent);
        room(230, 155, 104, 4, accent);
        live(scene, left, map.translate(14, 79));
        live(scene, right, map.translate(324, 129));
      };
    }
  }, {
    number: 15,
    id: 'folded-leaflet-proof',
    title: 'Folded leaflet proof',
    summary: 'Check whether the native typography and contact entry on two leaflet panels remain legible across a fold.',
    mechanism: 'Each real HTML panel attaches to its own planar transform around a shared hinge. Native text layout and input selection still work, and the resulting proof can be exported with the fold intact.',
    tryIt: 'Edit the visitor information, then increase the fold angle. Click the pivoting title field and change the wording while tilted.',
    test: {selector: '#leaflet-fold', value: '54'},
    mount(api) {
      const front = api.panel('Leaflet cover', 254, 242);
      const inside = api.panel('Leaflet inside', 254, 242);
      heading(front, 'Cover · 01', 'Open workshop');
      input(front, 'Event title', 'leaflet-title', 'Meet the fabrication team');
      const time = input(front, 'Session start', 'leaflet-time', '10:30', 'time');
      heading(inside, 'Inside · 02', 'Arrival details');
      textarea(inside, 'Directions', 'leaflet-directions', 'Enter by the east door.\nFollow the blue floor markers.', 3);
      const summary = status(inside, 'leaflet-time-label', 'Start 10:30');
      time.addEventListener('input', () => { summary.textContent = time.value ? 'Start ' + time.value : 'No start time'; });
      const fold = slider(api.controls, 'Fold angle (°)', 'leaflet-fold', 0, 64, 35);
      return (scene, width, height) => {
        scene.grid();
        const scale = Math.min((width - 26) / 544, (height - 33) / 300, 1.22);
        const perspective = new DOMMatrix();
        perspective.m34 = -1 / 940;
        const hinge = new DOMMatrix().translate(width / 2, height / 2)
          .multiply(perspective).rotate(-8, -5, 0).scale(scale, scale, scale);
        const cover = hinge.translate(-254, -121);
        const folded = hinge.rotate(0, Number(fold.value), 0).translate(0, -121);
        live(scene, front, cover);
        live(scene, inside, folded);
        const rule = hinge.translate(-2, -127);
        scene.solid(api.rect(0,0,4,254).map(point => rule.transformPoint(point)), amber);
      };
    }
  }, {
    number: 16,
    id: 'kiosk-reach-rehearsal',
    title: 'Kiosk reach rehearsal',
    summary: 'Rehearse mounting a demo kiosk and move its form through a configurable visitor reach band.',
    mechanism: 'The projected cabinet, reach band, and working request form share one canvas. The native submit button remains clickable on the tilted mounting surface and appears in the same exported evidence.',
    tryIt: 'Choose a request in the kiosk and confirm it. Change mounting height and tilt, then compare the action marker with the green demo reach band.',
    test: {selector: '#fixture-mount-height', value: '134'},
    mount(api) {
      const panel = api.panel('Accessible service kiosk', 326, 242);
      heading(panel, 'Demo fixture', 'Request assistance');
      const service = select(panel, 'Service', 'fixture-service', [['orientation', 'Building orientation'], ['seating', 'Find seating']]);
      const submit = pushButton(panel, 'Confirm request', 'fixture-submit');
      const result = status(panel, 'fixture-result', 'No demo request sent');
      submit.addEventListener('click', () => { result.textContent = service.selectedOptions[0].text + ' selected'; });
      const mount = slider(api.controls, 'Mounting height (cm)', 'fixture-mount-height', 75, 145, 99);
      const tilt = slider(api.controls, 'Screen tilt (°)', 'fixture-tilt', -26, 26, -13);
      const reach = status(api.controls, 'fixture-reach-summary', 'Checking the demo reach band');
      return (scene, width, height) => {
        scene.grid();
        const span = Math.min(width - 32, 510);
        const bandX = (width - span) / 2;
        const bandTop = height * .46;
        const bandHeight = height * .23;
        scene.solid(api.rect(bandX, bandTop, span, bandHeight), [.12, .31, .27, .75]);
        const scale = Math.min(.98, (span - 20) / 326, height / 415);
        const margin = panel.offsetHeight * scale * .58 + 8;
        const requested = height * (.48 - (Number(mount.value) - 100) / 215);
        const y = Math.max(margin, Math.min(height - margin, requested));
        const frame = api.project(panel, {x: width / 2, y, scale, yaw: 14, pitch: Number(tilt.value)});
        const local = frame.transformPoint(new DOMPoint(panel.offsetWidth * .5, submit.offsetTop + submit.offsetHeight * .5));
        const markerY = local.y / local.w;
        live(scene, panel, frame);
        const markerX = bandX + span - 7;
        scene.solid(api.rect(markerX - 4, markerY - 5, 8, 10), amber);
        const message = markerY >= bandTop && markerY <= bandTop + bandHeight
          ? 'Action marker inside the demo band' : 'Action marker outside the demo band';
        if (reach.textContent !== message) reach.textContent = message;
      };
    }
  }, {
    number: 17,
    id: 'assembly-sequence-placards',
    title: 'Assembly sequence rehearsal',
    summary: 'Associate editable inspection placards with an exploded assembly and check a chosen sequence for omissions.',
    mechanism: 'The placards and schematic parts share a projected coordinate system. Their native inputs track the exploded view and their readings stay in the exported scene, avoiding a second layout for the evidence capture.',
    tryIt: 'Explode the assembly farther and set each visible placard to Checked. Change the step to inspect the next position.',
    test: {selector: '#assembly-separation', value: '93'},
    mount(api) {
      const seat = api.panel('Seat inspection placard', 223, 146);
      const clamp = api.panel('Clamp inspection placard', 223, 146);
      heading(seat, '1 · Seat', 'Check gasket');
      heading(clamp, '2 · Clamp', 'Check bolt');
      const choices = [['pending', 'Pending'], ['checked', 'Checked'], ['repeat', 'Repeat inspection']];
      const seatCheck = select(seat, 'Inspection', 'assembly-seat', choices);
      const clampCheck = select(clamp, 'Inspection', 'assembly-clamp', choices);
      const amount = slider(api.controls, 'Separation (%)', 'assembly-separation', 0, 100, 48);
      const step = select(api.controls, 'Active step', 'assembly-step', [['seat', 'Seat first'], ['clamp', 'Clamp next']]);
      const count = status(api.controls, 'assembly-count', '0 of 2 checked');
      function report() {
        const complete = Number(seatCheck.value === 'checked') + Number(clampCheck.value === 'checked');
        count.textContent = complete + ' of 2 checked';
      }
      seatCheck.addEventListener('change', report);
      clampCheck.addEventListener('change', report);
      return (scene, width, height) => {
        scene.grid();
        const sideBySide = width >= 620;
        const split = Number(amount.value) / 100;
        const distances = sideBySide ? 123 + 110 * split : 78 + 75 * split;
        const scale = Math.min(.95,
          (width - 20) / (sideBySide ? 2 * distances + 237 : 260),
          (height - 20) / (sideBySide ? 212 : 2 * distances + 204));
        for (const [index, panel] of [seat, clamp].entries()) {
          const direction = index === 0 ? -1 : 1;
          const x = width / 2 + (sideBySide ? direction * distances * scale : 0);
          const y = height / 2 + (sideBySide ? 0 : direction * distances * scale);
          const matrix = api.project(panel, {x, y: y - 16 * scale, scale, yaw: direction * 16, pitch: -7});
          const part = matrix.translate(9, 145);
          scene.solid(api.rect(0, 0, 205, 35).map(point => part.transformPoint(point)),
            (index === 0 ? step.value === 'seat' : step.value === 'clamp') ? accent : line);
          live(scene, panel, matrix);
        }
      };
    }
  }, {
    number: 18,
    id: 'carton-corner-label-proof',
    title: 'Carton corner label proof',
    summary: 'Check the naming and handling instructions on the front and side faces of a packing carton.',
    mechanism: 'The actual front and side HTML layouts occupy perpendicular faces. Native editing works on both surfaces and the same projected composition captures line wrapping and face placement for a packing proof.',
    tryIt: 'Enter a longer product name, set a handling instruction on the side, then swing around the corner to inspect each face.',
    test: {selector: '#carton-yaw', value: '-61'},
    mount(api) {
      const front = api.panel('Carton front label', 260, 250);
      const side = api.panel('Carton side label', 187, 250);
      heading(front, 'Front · SKU 028', 'Product label');
      input(front, 'Product name', 'carton-name', 'Acrylic sample sheets');
      input(front, 'Quantity', 'carton-quantity', '24', 'number');
      heading(side, 'Side · Handling', 'Shipping note');
      select(side, 'Orientation', 'carton-up', [['up', 'Keep upright'], ['flat', 'Stack flat']]);
      textarea(side, 'Handling note', 'carton-handling', 'Do not place under heavy stock.', 3);
      const yaw = slider(api.controls, 'View around corner (°)', 'carton-yaw', -68, -10, -33);
      return (scene, width, height) => {
        scene.grid();
        const s = Math.min((width - 22) / 428, (height - 37) / 320, 1.31);
        const perspective = new DOMMatrix();
        perspective.m34 = -1 / 920;
        const plane = new DOMMatrix().translate(width * .61, height / 2)
          .multiply(perspective).rotate(-9, Number(yaw.value), 0)
          .scale(s, s, s).translate(0, -125);
        const left = plane.translate(-260, 0);
        const right = plane.rotate(0, 90, 0);
        const top = plane.translate(-260, 0).rotate(90, 0, 0);
        scene.solid(api.rect(0, -187, 260, 187).map(point => top.transformPoint(point)), [.37, .45, .42, 1]);
        live(scene, front, left);
        live(scene, side, right);
      };
    }
  }, {
    number: 19,
    id: 'tabletop-double-sided-sign',
    title: 'Two-sided tabletop sign',
    summary: 'Check a meeting placard from seated positions on opposite sides of a desk.',
    mechanism: 'A single painted HTML sign gives the scene both a near editable face and a far reading view. The renderer projects the same text and status to two different matrices and holds their alignment in the exported proof.',
    tryIt: 'Change the room name or flip Availability. Move the observer slider and see both views update while the near sign stays editable.',
    test: {selector: '#table-sign-angle', value: '24'},
    mount(api) {
      const sign = api.panel('Meeting-room tabletop sign', 290, 206);
      heading(sign, 'Meeting rooms', 'Commons meeting room');
      const text = input(sign, 'Room name', 'table-room-name', 'Focus room A');
      const mode = select(sign, 'Availability', 'table-availability', [['free', 'Available'], ['busy', 'Meeting in progress']]);
      const small = status(sign, 'table-sign-status', 'Focus room A · Available');
      function refresh() {
        small.textContent = (text.value || 'Unnamed room') + ' · ' + mode.selectedOptions[0].text;
      }
      sign.addEventListener('input', refresh);
      sign.addEventListener('change', refresh);
      const turn = slider(api.controls, 'Observer angle (°)', 'table-sign-angle', -30, 30, -18);
      const distance = slider(api.controls, 'Far face size (%)', 'table-far-distance', 48, 94, 74);
      return (scene, width, height) => {
        scene.grid();
        const [near, far] = halves(width, height);
        const [x1,y1,w1,h1] = near;
        const [x2,y2,w2,h2] = far;
        const scale = Math.min((w1 - 16) / 320, (h1 - 18) / 252, 1.16);
        const smallScale = scale * Number(distance.value) / 100;
        const angle = Number(turn.value);
        const nearFace = api.project(sign, {x: x1 + w1 / 2, y: y1 + h1 / 2, scale, yaw: angle, pitch: -11});
        const farFace = api.project(sign, {x: x2 + w2 / 2, y: y2 + h2 / 2, scale: smallScale, yaw: -angle, pitch: 13});
        for (const face of [nearFace, farFace]) {
          scene.solid(api.rect(-7,-7,304,220).map(point => face.transformPoint(point)), line);
        }
        scene.surface(sign, farFace, {opacity: .85});
        live(scene, sign, nearFace);
      };
    }
  }, {
    number: 20,
    id: 'caption-safe-frame',
    title: 'Caption safe-frame proof',
    summary: 'Proof editable camera lower-third captions against a widescreen or vertical delivery crop.',
    mechanism: 'The camera crop, safe guides, and live browser-laid-out caption share one export. The input remains native and the preview shows its actual multiline text and alignment without rasterizing it through a separate text implementation.',
    tryIt: 'Edit the lower-third name and detail. Choose Vertical delivery and move Caption position to inspect how much margin the crop leaves.',
    test: {selector: '#caption-aspect', value: 'vertical'},
    mount(api) {
      const editor = api.panel('Lower-third caption editor', 302, 221);
      heading(editor, 'Synthetic camera rehearsal', 'Lower third');
      const title = input(editor, 'Caption title', 'caption-person', 'Workshop demonstration');
      const subtitle = input(editor, 'Detail', 'caption-detail', 'Camera B · Sample run');
      const composition = api.panel('Browser-rendered lower third', 300, 101);
      Object.assign(composition.style, {background: '#102b2f', borderLeft: '5px solid #80dfbf'});
      const head = heading(composition, 'Live capture', title.value);
      const detail = node('p', subtitle.value);
      composition.append(detail);
      composition.inert = true;
      editor.addEventListener('input', () => {
        head.textContent = title.value || 'Untitled capture';
        detail.textContent = subtitle.value;
      });
      const ratio = select(api.controls, 'Delivery frame', 'caption-aspect', [['wide', 'Widescreen'], ['vertical', 'Vertical']]);
      const position = slider(api.controls, 'Caption position (%)', 'caption-position', 48, 96, 79);
      return (scene, width, height) => {
        scene.grid();
        const [left, right] = halves(width, height);
        live(scene, editor, api.fit(editor, ...left));
        const [x, y, w, h] = right;
        const aspect = ratio.value === 'wide' ? 16 / 9 : 9 / 16;
        const boxWidth = Math.min(w - 12, (h - 12) * aspect);
        const boxHeight = boxWidth / aspect;
        const startX = x + (w - boxWidth) / 2;
        const startY = y + (h - boxHeight) / 2;
        scene.solid(api.rect(startX, startY, boxWidth, boxHeight), [.15, .26, .31, 1]);
        scene.solid(api.rect(startX + boxWidth * .59, startY + boxHeight * .18, boxWidth * .29, boxHeight * .45), [.24, .39, .39, 1]);
        const captionScale = boxWidth * .84 / 300;
        const captionHeight = composition.offsetHeight * captionScale;
        const captionY = startY + (boxHeight - captionHeight) * Number(position.value) / 100;
        const caption = new DOMMatrix().translate(startX + boxWidth * .08, captionY).scale(captionScale);
        scene.clip(startX, startY, boxWidth, boxHeight, () => scene.surface(composition, caption));
        const insetX = boxWidth * .07, insetY = boxHeight * .07;
        for (const edge of [insetX, boxWidth - insetX]) {
          scene.solid(api.rect(startX + edge, startY + insetY, 1, boxHeight - 2 * insetY), amber);
        }
        for (const edge of [insetY, boxHeight - insetY]) {
          scene.solid(api.rect(startX + insetX, startY + edge, boxWidth - 2 * insetX, 1), amber);
        }
      };
    }
  }];

  window.CanvasDemos.push(...projects);
})();
