'use strict';

(() => {
  const pale = [.91, .92, .87, 1];
  const ink = [.09, .13, .16, 1];
  const gold = [.95, .63, .29, 1];
  const teal = [.36, .78, .72, 1];
  const muted = [.26, .35, .37, 1];

  function node(tag, props = {}, ...children) {
    const result = document.createElement(tag);
    Object.assign(result, props);
    result.append(...children);
    return result;
  }

  function paper(api, label, width, height, kicker = 'Release proof') {
    const panel = api.panel(label, width, height);
    Object.assign(panel.style, {
      background: '#eef0e8', color: '#162729', padding: '14px',
      boxSizing: 'border-box', border: '1px solid #899c92', position: 'relative', display: 'flex',
      flexDirection: 'column', gap: '6px', overflow: 'hidden'
    });
    const eyebrow = node('div', {className: 'source-kicker', textContent: kicker});
    eyebrow.style.color = '#35635b';
    const heading = node('h3', {className: 'source-title', textContent: label});
    heading.style.color = 'inherit';
    panel.append(eyebrow, heading);
    return panel;
  }

  function input(panel, label, id, value, more = {}) {
    const field = node('input', {id, type: 'text', value, ...more});
    panel.append(node('label', {}, label, field));
    return field;
  }

  function area(panel, label, id, value) {
    const field = node('textarea', {id, rows: 2, value});
    field.style.resize = 'none';
    panel.append(node('label', {}, label, field));
    return field;
  }

  function slider(api, name, id, min, max, value, step = 1) {
    const control = node('input', {id, type: 'range', min, max, step, value});
    const current = node('output', {value: String(value)});
    current.setAttribute('for', id);
    control.addEventListener('input', () => { current.value = control.value; });
    api.controls.append(node('label', {}, name + ' ', current, control));
    return control;
  }

  function choice(api, label, id, values) {
    const select = node('select', {id});
    values.forEach(([value, text]) => select.append(node('option', {value, textContent: text})));
    api.controls.append(node('label', {}, label, select));
    return select;
  }

  function action(api, id, title, run) {
    const button = node('button', {id, type: 'button', textContent: title});
    button.addEventListener('click', () => { run(); api.invalidate(); });
    api.controls.append(button);
    return button;
  }

  function status(api, id, initial) {
    const output = node('output', {id, className: 'source-status', textContent: initial});
    output.setAttribute('aria-live', 'polite');
    api.controls.append(output);
    return output;
  }

  function panelNote(panel, text) {
    panel.append(node('small', {textContent: text}));
  }

  function spaces(w, h, first = .5) {
    const p = 14;
    if (w < 660) {
      const unit = h - 3 * p;
      return [[p, p, w - 2 * p, unit * first], [p, p * 2 + unit * first, w - 2 * p, unit * (1 - first)]];
    }
    const unit = w - 3 * p;
    return [[p, p, unit * first, h - 2 * p], [p * 2 + unit * first, p, unit * (1 - first), h - 2 * p]];
  }

  function region(api, scene, box, color) {
    scene.solid(api.rect(...box), color);
  }

  function stripe(api, scene, x, y, w, h, color = gold) {
    region(api, scene, [x, y, w, h], color);
  }

  function fit(api, scene, panel, box, interactive = false, options) {
    const matrix = api.fit(panel, ...box);
    scene.surface(panel, matrix, options);
    if (interactive) scene.register(panel, matrix);
    return matrix;
  }

  function matrixFor(panel, x, y, w, h) {
    return new DOMMatrix().translate(x, y).scale(w / panel.offsetWidth, h / panel.offsetHeight);
  }

  function inset(box, pad) {
    return [box[0] + pad, box[1] + pad, box[2] - pad * 2, box[3] - pad * 2];
  }

  function cropMarks(api, scene, x, y, w, h, color = gold) {
    for (const xx of [x, x + w]) {
      for (const yy of [y, y + h]) {
        stripe(api, scene, xx - 5, yy, 10, 1, color);
        stripe(api, scene, xx, yy - 5, 1, 10, color);
      }
    }
  }

  window.CanvasDemos.push(
    {
      number: 21,
      id: 'responsive-evidence-board',
      title: 'Responsive evidence board',
      summary: 'Attach three actual widths of one edited release notice to a layout review without asking the reader to resize their browser.',
      mechanism: 'Each live HTML version reflows at its own source width. The canvas arranges those browser-painted states at a common display scale, so an exact evidence sheet needs no custom text wrapping or manual screen captures.',
      tryIt: 'Edit the notice headline in any version and tighten the narrow specimen width. Review the actual browser line wrapping at three sizes.',
      test: {selector: '#evidence-width', value: '210', expect: {selector: '#evidence-status', text: 'Narrow specimen 210 px'}},
      mount(api) {
        const panels = [250, 330, 440].map((width, i) => paper(api, 'Workshop access', width, 234, ['Narrow', 'Standard', 'Wide'][i] + ' · ' + width + ' px'));
        const headers = panels.map((panel, i) => input(panel, 'Notice headline', 'evidence-headline-' + i, 'Temporary access at the east entrance'));
        const proofs = panels.map(panel => {
          const heading = node('strong', {textContent: headers[0].value});
          heading.style.cssText = 'font:700 28px/1.12 Georgia, serif;overflow-wrap:anywhere';
          panel.append(heading);
          panelNote(panel, 'Service crews may use the marked gate.');
          return heading;
        });
        headers.forEach(field => field.addEventListener('input', () => {
          headers.forEach(other => { if (other !== field) other.value = field.value; });
          proofs.forEach(heading => { heading.textContent = field.value; });
        }));
        const width = slider(api, 'Narrow specimen width', 'evidence-width', 190, 295, 250);
        const output = status(api, 'evidence-status', 'Narrow specimen 250 px');
        width.addEventListener('input', () => {
          panels[0].style.width = width.value + 'px';
          panels[0].firstChild.textContent = 'Narrow · ' + width.value + ' px';
          output.textContent = 'Narrow specimen ' + width.value + ' px';
        });
        return (scene, w, h) => {
          scene.grid();
          const horizontal = w >= 680;
          const margin = 12, gap = 10;
          const sum = panels.reduce((total, panel) => total + panel.offsetWidth, 0);
          const s = Math.min(1, horizontal ? (w - 2 * margin - 2 * gap) / sum : (w - 2 * margin) / 440,
            horizontal ? (h - 2 * margin) / 234 : (h - 2 * margin - 2 * gap) / (3 * 234));
          let x = horizontal ? (w - sum * s - 2 * gap) / 2 : margin;
          let y = horizontal ? (h - 234 * s) / 2 : (h - 3 * 234 * s - 2 * gap) / 2;
          for (const panel of panels) {
            const bx = horizontal ? x : (w - panel.offsetWidth * s) / 2;
            const matrix = new DOMMatrix().translate(bx, y).scale(s);
            scene.surface(panel, matrix);
            scene.register(panel, matrix);
            if (horizontal) x += panel.offsetWidth * s + gap;
            else y += 234 * s + gap;
          }
        };
      }
    },
    {
      number: 22,
      id: 'handoff-receipt',
      title: 'Freeze a handoff receipt',
      summary: 'Preserve the exact DOM-rendered custody receipt at checkout and compare it with edits made on return.',
      mechanism: 'The saved side is an independent texture copied from browser paint, including the rendered controls. It survives edits to the live DOM without a separate layout implementation or a screen capture picker.',
      tryIt: 'Choose Freeze checkout, then edit the receiving station. The frozen checkout keeps the old text and the live receipt changes.',
      test: {selector: '#handoff-freeze', expect: {selector: '#handoff-status', text: 'Checkout frozen'}},
      mount(api) {
        const receipt = paper(api, 'Equipment handoff', 324, 270, 'Custody · sample');
        input(receipt, 'Asset tag', 'handoff-tag', 'CART-042');
        input(receipt, 'Receiving station', 'handoff-station', 'Test bench A');
        input(receipt, 'Condition', 'handoff-condition', 'Checked · two leads');
        const badge = status(api, 'handoff-status', 'Freeze checkout to keep this version');
        let freeze = false;
        action(api, 'handoff-freeze', 'Freeze checkout', () => { freeze = true; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          fit(api, scene, receipt, editor, true);
          if (freeze) {
            scene.freeze('checkout', receipt);
            freeze = false;
            badge.textContent = 'Checkout frozen';
          }
          region(api, scene, proof, ink);
          const projection = api.fit(receipt, ...inset(proof, 8));
          if (scene.frozen('checkout')) {
            scene.snapshot('checkout', projection);
            stripe(api, scene, proof[0] + 8, proof[1] + 5, proof[2] - 16, 2, teal);
          } else {
            scene.surface(receipt, projection, {effect: 'grayscale', opacity: .32});
          }
        };
      }
    },
    {
      number: 23,
      id: 'bidirectional-typesetting-proof',
      title: 'Bidirectional typesetting proof',
      summary: 'Review Latin and Arabic notice copy with embedded room codes and numbers on a shared publication plate.',
      mechanism: 'Each text direction uses native browser shaping, alignment, and editing. Independently painted excerpts become one framed proof, without rewriting bidi ordering or glyph layout in an image compositor.',
      tryIt: 'Edit the Arabic line with more mixed-script room codes. Switch the proof order while the two native editors keep their directions.',
      test: {selector: '#typeset-order', value: 'rtl', expect: {selector: '#typeset-status', text: 'Arabic panel first'}},
      mount(api) {
        const left = paper(api, 'English notice', 275, 180, 'Left-to-right editorial');
        const right = paper(api, 'Arabic notice', 275, 180, 'Right-to-left editorial');
        const english = area(left, 'English copy', 'typeset-english', 'Use room B-12 at 09:30. Follow marker ٤ to the south exit.');
        const arabic = area(right, 'Arabic copy', 'typeset-arabic', 'استخدم الغرفة B-12 عند الساعة 09:30. اتبع العلامة ٤ إلى المخرج الجنوبي.');
        english.dir = 'ltr';
        arabic.dir = 'rtl';
        arabic.lang = 'ar';
        const order = choice(api, 'Plate order', 'typeset-order', [['ltr', 'English first'], ['rtl', 'Arabic first']]);
        const output = status(api, 'typeset-status', 'English panel first');
        order.addEventListener('change', () => { output.textContent = order.value === 'rtl' ? 'Arabic panel first' : 'English panel first'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          const [ex, ey, ew, eh] = editor;
          for (const [i, panel] of [left, right].entries()) fit(api, scene, panel, [ex, ey + i * eh / 2, ew, eh / 2 - 3], true);
          region(api, scene, proof, pale);
          const [x, y, pw, ph] = inset(proof, 12);
          const ordered = order.value === 'rtl' ? [right, left] : [left, right];
          stripe(api, scene, x + pw / 2, y, 1, ph, muted);
          for (const [i, panel] of ordered.entries()) {
            const bx = x + i * pw / 2 + 4, bw = pw / 2 - 8;
            const cropHeight = .66;
            const scale = Math.min(bw / panel.offsetWidth, ph / (panel.offsetHeight * cropHeight));
            const width = panel.offsetWidth * scale, bh = panel.offsetHeight * cropHeight * scale;
            const imageX = bx + (bw - width) / 2, by = y + (ph - bh) / 2;
            scene.surface(panel, matrixFor(panel, imageX, by, width, bh), {uv: [0, .19, 1, cropHeight]});
            cropMarks(api, scene, imageX, by, width, bh, muted);
          }
        };
      }
    },
    {
      number: 24,
      id: 'layered-approval-proof',
      title: 'Layered approval proof',
      summary: 'Check an approval mark’s opacity and position over an editable service notice before releasing a flattened image.',
      mechanism: 'The notice and mark are two independently painted HTML textures. The GPU places and blends the layers in the same PNG while the source controls retain their native focus targets.',
      tryIt: 'Edit the approval line or adjust its opacity. The right-hand composite updates independently from the source controls.',
      test: {selector: '#approval-opacity', value: '42', expect: {selector: '#approval-status', text: 'Mark opacity 42%'}},
      mount(api) {
        const doc = paper(api, 'Maintenance notice', 340, 245, 'Release candidate');
        input(doc, 'Task', 'approval-task', 'Replace north bench lighting');
        input(doc, 'Window', 'approval-window', 'Monday · 08:00–10:00');
        const mark = paper(api, 'Review mark', 252, 126, 'Approval layer');
        Object.assign(mark.style, {background: '#25634f', color: '#effce4', border: '2px solid #9eae75', padding: '8px'});
        mark.firstChild.style.color = '#dbe4a3';
        input(mark, 'Decision', 'approval-decision', 'Release approved');
        const alpha = slider(api, 'Mark opacity', 'approval-opacity', 15, 100, 68);
        const output = status(api, 'approval-status', 'Mark opacity 68%');
        alpha.addEventListener('input', () => { output.textContent = 'Mark opacity ' + alpha.value + '%'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          const [x, y, ew, eh] = editor;
          fit(api, scene, doc, [x, y, ew, eh * .64], true);
          fit(api, scene, mark, [x, y + eh * .64 + 3, ew, eh * .36 - 3], true);
          fit(api, scene, doc, proof);
          const [px, py, pw, ph] = proof;
          const scale = Math.min(pw * .69 / mark.offsetWidth, ph * .31 / mark.offsetHeight, 1);
          const matrix = api.project(mark, {x: px + pw * .58, y: py + ph * .67, roll: -9, scale});
          scene.surface(mark, matrix, {opacity: Number(alpha.value) / 100});
        };
      }
    },
    {
      number: 25,
      id: 'keyed-caption-composite',
      title: 'Keyed caption composite',
      summary: 'Remove a dark caption plate and composite the same edited lettering over two different backgrounds.',
      mechanism: 'The luma key turns dark pixels of the browser-painted HTML into transparency before blending. Live mixed-script lettering and antialiasing come from the browser, so the same export pipeline needs neither a text renderer nor a flattened type asset.',
      tryIt: 'Edit the caption text, then lower the key cutoff until the dark plate returns. Raise it again to isolate the lettering over both backgrounds.',
      test: {selector: '#key-cutoff', value: '8', expect: {selector: '#key-status', text: 'Luminance cutoff 8%'}},
      mount(api) {
        const panel = paper(api, 'Caption plate', 360, 220, 'Luma-key source · sample');
        const source = input(panel, 'Title text', 'key-source', 'Workshop open · 工場');
        const text = node('div', {textContent: source.value});
        text.style.cssText = 'margin-top:6px;padding:10px;background:#27353b;color:#fffde3;font:700 24px/1.12 Georgia, serif;overflow-wrap:anywhere;min-height:52px';
        panel.append(text);
        source.addEventListener('input', () => { text.textContent = source.value; });
        const cutoff = slider(api, 'Luminance cutoff', 'key-cutoff', 4, 70, 22);
        const output = status(api, 'key-status', 'Luminance cutoff 22%');
        cutoff.addEventListener('input', () => { output.textContent = 'Luminance cutoff ' + cutoff.value + '%'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          fit(api, scene, panel, editor, true);
          const [x, y, pw, ph] = proof;
          const colors = [[.21, .37, .45, 1], [.38, .20, .24, 1]];
          for (const [i, color] of colors.entries()) {
            const height = ph / 2 - 4, top = y + i * ph / 2;
            region(api, scene, [x, top, pw, height], color);
            region(api, scene, [x + pw * .62, top, pw * .38, height], [.08 + i * .12, .22 - i * .06, .27 - i * .09, 1]);
            stripe(api, scene, x + 10, top + height * .74, pw - 20, 2, i ? gold : teal);
            const boxH = Math.min(height * .54, (pw - 20) * .26);
            scene.surface(panel, matrixFor(panel, x + 10, top + (height - boxH) / 2, pw - 20, boxH), {
              uv: [text.offsetLeft / panel.offsetWidth, text.offsetTop / panel.offsetHeight, text.offsetWidth / panel.offsetWidth, text.offsetHeight / panel.offsetHeight],
              effect: 'key', params: [Number(cutoff.value) / 100, 0, 0, 0]
            });
          }
        };
      }
    },
    {
      number: 26,
      id: 'native-numeral-specimen',
      title: 'Native numeral specimen',
      summary: 'Proof the spacing of inventory counts and prices when choosing between proportional and fixed-width type.',
      mechanism: 'The browser lays out the actual installed fonts. Canvas samples the live specimen rows onto shared guides using their measured DOM widths, avoiding an approximation based on character count or standalone canvas text metrics.',
      tryIt: 'Change the style to Fixed-width type and edit the sample numbers. Compare their rendered widths against the tick marks.',
      test: {selector: '#numeral-mode', value: 'fixed', expect: {selector: '#numeral-status', text: 'Fixed-width type selected'}},
      mount(api) {
        const panel = paper(api, 'Price specimen', 360, 248, 'Numeral alignment');
        const first = input(panel, 'First amount', 'numeral-first', '111.41');
        const second = input(panel, 'Second amount', 'numeral-second', '888.98');
        const rows = [first, second].map(field => {
          const text = node('span', {textContent: field.value});
          text.style.cssText = 'display:inline-block;align-self:flex-start;font:600 23px/1.13 Georgia,serif;white-space:nowrap';
          panel.append(text);
          field.addEventListener('input', () => { text.textContent = field.value; });
          return text;
        });
        const digits = choice(api, 'Numeral style', 'numeral-mode', [['proportional', 'Proportional type'], ['fixed', 'Fixed-width type']]);
        const output = status(api, 'numeral-status', 'Proportional type selected');
        const lengths = status(api, 'numeral-lengths', '');
        function update() {
          for (const row of rows) {
            row.style.fontFamily = digits.value === 'fixed' ? 'Consolas, ui-monospace, monospace' : 'Georgia, serif';
            row.style.fontVariantNumeric = digits.value === 'fixed' ? 'tabular-nums' : 'proportional-nums';
          }
          output.textContent = digits.selectedOptions[0].textContent + ' selected';
          lengths.textContent = rows.map(row => row.offsetWidth + ' px').join(' / ');
        }
        digits.addEventListener('change', update);
        first.addEventListener('input', update);
        second.addEventListener('input', update);
        update();
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          fit(api, scene, panel, editor, true);
          region(api, scene, proof, pale);
          const [x, y, pw, ph] = inset(proof, 16);
          const sw = panel.offsetWidth - rows[0].offsetLeft - 15;
          const scale = pw / sw;
          for (const [i, text] of rows.entries()) {
            const rowY = y + ph * (.15 + i * .47);
            const rowH = Math.min(ph * .29, text.offsetHeight * scale);
            const uv = [text.offsetLeft / panel.offsetWidth, text.offsetTop / panel.offsetHeight, sw / panel.offsetWidth, text.offsetHeight / panel.offsetHeight];
            scene.surface(panel, matrixFor(panel, x, rowY, pw, rowH), {uv});
            const marker = Math.min(pw, text.offsetWidth * scale);
            stripe(api, scene, x, rowY + rowH + 5, marker, 2, muted);
            stripe(api, scene, x + marker, rowY - 3, 2, rowH + 13, muted);
            for (let tick = 0; tick < pw; tick += 15 * scale) stripe(api, scene, x + tick, rowY + rowH, 1, 4, muted);
          }
        };
      }
    },
    {
      number: 27,
      id: 'headline-crop-proof',
      title: 'Headline crop proof',
      summary: 'Check a web masthead against wide and square thumbnail crops using the actual live headline layout.',
      mechanism: 'Both ratios sample different UV rectangles of one live browser-painted title treatment. No background-image rebuild or duplicate text layout is needed to compare crops or export the contact sheet.',
      tryIt: 'Edit the headline and change the shared crop position. The square cut can remove a word that remains visible in the wide crop.',
      test: {selector: '#headline-crop', value: '28', expect: {selector: '#headline-status', text: 'Crop center 28%'}},
      mount(api) {
        const panel = paper(api, 'Release masthead', 400, 236, 'Operations bulletin');
        Object.assign(panel.style, {
          background: 'linear-gradient(115deg,#123c47 0%,#205e64 55%,#c3a06d 100%)', color: '#f1ffec'
        });
        panel.firstChild.style.color = '#cdeebc';
        const headline = input(panel, 'Headline', 'headline-text', 'Reopen the north workshop');
        const headlineDisplay = node('p', {textContent: headline.value});
        Object.assign(headlineDisplay.style, {font: '700 27px/1.05 Georgia, serif', margin: 0, width: '85%'});
        panel.append(headlineDisplay);
        headline.addEventListener('input', () => { headlineDisplay.textContent = headline.value; });
        const center = slider(api, 'Crop center', 'headline-crop', 0, 100, 50);
        const output = status(api, 'headline-status', 'Crop center 50%');
        center.addEventListener('input', () => { output.textContent = 'Crop center ' + center.value + '%'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h, .48);
          fit(api, scene, panel, editor, true);
          const [x, y, pw, ph] = proof;
          for (const [i, ratio] of [16/9, 1].entries()) {
            const fw = Math.min(pw - 10, (ph / 2 - 12) * ratio), fh = fw / ratio;
            const bx = x + (pw - fw) / 2, by = y + i * ph / 2 + (ph / 2 - fh) / 2;
            const sw = Math.min(1, ratio * panel.offsetHeight / panel.offsetWidth);
            const sh = Math.min(1, panel.offsetWidth / (ratio * panel.offsetHeight));
            scene.surface(panel, matrixFor(panel, bx, by, fw, fh), {uv: [(1 - sw) * Number(center.value) / 100, (1 - sh) / 2, sw, sh]});
            cropMarks(api, scene, bx, by, fw, fh, teal);
          }
        };
      }
    },
    {
      number: 28,
      id: 'printer-feed-calibration',
      title: 'Printer feed calibration',
      summary: 'Preview a known sheet-feed stretch and check whether the printed procedure fits between its registration marks.',
      mechanism: 'Canvas stretches one browser-painted source independently along each axis and keeps the physical guide fixed. The actual text, spacing, and form chrome move together in the proof without stretching the native editor or creating a separate print renderer.',
      tryIt: 'Set feed scale below 100%. The live source stays upright while the proof shortens against the fixed vertical marks.',
      test: {selector: '#feed-height', value: '88', expect: {selector: '#feed-status', text: 'Horizontal 100% · feed 88%'}},
      mount(api) {
        const panel = paper(api, 'Loading procedure', 330, 252, 'Printer calibration · sample');
        input(panel, 'Station', 'feed-station', 'Sample station 05');
        area(panel, 'Printed note', 'feed-note', 'Align the leading edge with the guide. Check both marks after the feed cycle.');
        const width = slider(api, 'Horizontal scale', 'feed-width', 80, 115, 100);
        const height = slider(api, 'Feed scale', 'feed-height', 80, 115, 106);
        const output = status(api, 'feed-status', 'Horizontal 100% · feed 106%');
        function update() { output.textContent = 'Horizontal ' + width.value + '% · feed ' + height.value + '%'; }
        width.addEventListener('input', update);
        height.addEventListener('input', update);
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          fit(api, scene, panel, editor, true);
          region(api, scene, proof, ink);
          const ideal = api.fit(panel, ...inset(proof, Math.min(36, proof[3] * .13)));
          const tw = ideal.a * panel.offsetWidth, th = ideal.d * panel.offsetHeight;
          const x = ideal.e, y = ideal.f;
          scene.surface(panel, matrixFor(panel, x, y, tw * Number(width.value) / 100, th * Number(height.value) / 100));
          cropMarks(api, scene, x, y, tw, th, gold);
          for (let i = 0; i <= 8; i++) {
            stripe(api, scene, x - 10, y + i * th / 8, i % 2 ? 4 : 7, 1, teal);
            stripe(api, scene, x + i * tw / 8, y - 10, 1, i % 2 ? 4 : 7, teal);
          }
        };
      }
    },
    {
      number: 29,
      id: 'runbook-excerpt',
      title: 'Runbook excerpt plate',
      summary: 'Extract the relevant heading and procedure from a live runbook for a short visual incident update.',
      mechanism: 'The crop samples the original formatted line breaks and native edits at their source coordinates. The magnified excerpt and its crop marker can be rendered independently without cloning the DOM or simulating the user’s screen.',
      tryIt: 'Move Excerpt start down to the verification step. The frame marks the source strip and shows just those pixels on the right.',
      test: {selector: '#excerpt-start', value: '43', expect: {selector: '#excerpt-status', text: 'Starts at 43% down the source'}},
      mount(api) {
        const panel = paper(api, 'Restart routine', 346, 325, 'Runbook · simulated fixture');
        input(panel, '1 · Isolate', 'excerpt-isolate', 'Park the sample tray');
        input(panel, '2 · Restart', 'excerpt-restart', 'Wait for both LEDs');
        input(panel, '3 · Verify', 'excerpt-verify', 'Compare display with log');
        panelNote(panel, 'Record the reference ID for the next shift.');
        const start = slider(api, 'Excerpt start', 'excerpt-start', 0, 68, 28);
        const output = status(api, 'excerpt-status', 'Starts at 28% down the source');
        start.addEventListener('input', () => { output.textContent = 'Starts at ' + start.value + '% down the source'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          const source = fit(api, scene, panel, editor, true);
          const fraction = Number(start.value) / 100;
          const y = source.f + source.d * panel.offsetHeight * fraction;
          stripe(api, scene, source.e, y, source.a * panel.offsetWidth, 2, gold);
          region(api, scene, proof, ink);
          const [x, py, pw, ph] = inset(proof, 10);
          const ratio = panel.offsetWidth / (panel.offsetHeight * .32);
          const dw = Math.min(pw, ratio * ph), dh = dw / ratio;
          const bx = x + (pw - dw) / 2, by = py + (ph - dh) / 2;
          scene.surface(panel, matrixFor(panel, bx, by, dw, dh), {uv: [0, fraction, 1, .32]});
          cropMarks(api, scene, bx, by, dw, dh, gold);
        };
      }
    },
    {
      number: 30,
      id: 'two-ink-registration',
      title: 'Two-ink registration proof',
      summary: 'Slide a translucent certification layer horizontally over a label to check alignment and legibility on the combined plate.',
      mechanism: 'Independent DOM layers preserve native text shaping and their edited content through position and opacity changes. The composite proof uses one framebuffer, the same pixels included in the PNG.',
      tryIt: 'Change either ink layer, then adjust the registration offset. The certification texture moves across the base while the editable sources keep their own hit targets.',
      test: {selector: '#registration-shift', value: '18', expect: {selector: '#registration-status', text: 'Registration shift 18 px'}},
      mount(api) {
        const base = paper(api, 'Base plate', 294, 184, 'Black · sample job');
        input(base, 'Product', 'registration-product', 'Bay adapter');
        panelNote(base, 'LOT 4206 · Orientation mark at upper right');
        const overlay = paper(api, 'Spot plate', 226, 114, 'Teal · certification layer');
        Object.assign(overlay.style, {background: '#237c75', color: '#fffbee', padding: '7px', border: '1px solid #cddba6'});
        overlay.firstChild.style.color = '#eef5c8';
        input(overlay, 'Certification', 'registration-mark', 'Checked');
        const shift = slider(api, 'Horizontal plate shift', 'registration-shift', -40, 40, 0);
        const output = status(api, 'registration-status', 'Registration shift 0 px');
        shift.addEventListener('input', () => { output.textContent = 'Registration shift ' + shift.value + ' px'; });
        return (scene, w, h) => {
          scene.grid();
          const [editor, proof] = spaces(w, h);
          const [ex, ey, ew, eh] = editor;
          fit(api, scene, base, [ex, ey, ew, eh * .6], true);
          fit(api, scene, overlay, [ex, ey + eh * .6, ew, eh * .4], true);
          const [x, y, pw, ph] = proof;
          const baseMatrix = fit(api, scene, base, inset(proof, 6));
          const scale = Math.min(baseMatrix.a, pw * .66 / overlay.offsetWidth);
          const center = x + pw / 2, target = center + Number(shift.value) * baseMatrix.a;
          const matrix = api.project(overlay, {x: target, y: y + ph * .62, scale});
          scene.clip(x, y, pw, ph, () => scene.surface(overlay, matrix, {opacity: .69}));
          stripe(api, scene, center - 6, y + 8, 12, 1, gold);
          stripe(api, scene, center, y + 4, 1, 9, gold);
          stripe(api, scene, target - 6, y + ph - 9, 12, 1, teal);
          stripe(api, scene, target, y + ph - 13, 1, 9, teal);
        };
      }
    }
  );
})();
