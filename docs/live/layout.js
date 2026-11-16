'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('scene');
  const panels = [$('baseline'), $('candidate')];
  const [baseline, candidate] = panels;
  const widthInput = $('panel-width');
  const mode = $('view');
  const descriptions = {
    edit: 'Baseline first, candidate second. Only the candidate wraps the action buttons.',
    wipe: 'Baseline to the left of the line. Candidate to the right.',
    diff: 'Amber marks changed pixels. The candidate is visible in gray.'
  };
  const gap = 14, padding = 12;
  let renderer, observer;

  function sizing(width) {
    const panelWidth = baseline.offsetWidth;
    const panelHeight = baseline.offsetHeight;
    const available = Math.max(1, width - padding * 2);
    const editing = mode.value === 'edit';
    const columns = editing && available >= 2 * Math.min(panelWidth, 300) + gap ? 2 : 1;
    const rows = editing && columns === 1 ? 2 : 1;
    const scale = Math.min(1, (available - (columns - 1) * gap) / (columns * panelWidth));
    const content = columns * panelWidth * scale + (columns - 1) * gap;
    return {
      columns, scale, left:(width - content) / 2, top:padding,
      dx:panelWidth * scale + gap, dy:panelHeight * scale + gap,
      height:Math.ceil(rows * panelHeight * scale + (rows - 1) * gap + padding * 2)
    };
  }

  function measure() {
    for (const [i, slot] of ['before-overflow','after-overflow'].entries()) {
      const row = panels[i].querySelector('.actions');
      $(slot).textContent = Math.max(0, row.scrollWidth - row.clientWidth) + ' px';
    }
  }

  function update() {
    document.querySelector('.lab').style.setProperty('--ticket-width', widthInput.value + 'px');
    $('width-value').textContent = widthInput.value + ' px';
    const comparing = mode.value !== 'edit' && !canvas.hidden;
    for (const panel of panels) panel.inert = comparing;
    $('wipe-control').hidden = mode.value !== 'wipe' || canvas.hidden;
    $('view-note').textContent = descriptions[mode.value];
    if (!canvas.hidden && canvas.clientWidth > 0) {
      canvas.style.height = (sizing(canvas.clientWidth).height + 2) + 'px';
    }
    measure();
    renderer?.request();
  }

  panels.forEach(panel => {
    panel.append($('ticket-template').content.cloneNode(true));
    panel.addEventListener('input', event => {
      const field = event.target.dataset.field;
      if (!field) return;
      const other = panel === baseline ? candidate : baseline;
      other.querySelector(`[data-field="${field}"]`).value = event.target.value;
      renderer?.request();
    });
    panel.addEventListener('click', event => {
      if (!event.target.dataset.status) return;
      for (const form of panels) form.querySelector('.ticket-status').textContent = event.target.dataset.status;
      renderer?.request();
    });
  });

  for (const control of [widthInput, $('wipe')]) control.addEventListener('input', update);
  mode.addEventListener('change', update);
  $('export').addEventListener('click', () => LiveCanvas.save(canvas, 'live-layout-diff.png'));
  update();

  renderer = LiveCanvas.open(canvas, {
    panels,
    render(scene, width) {
      const {columns, scale, left, top, dx, dy} = sizing(width);
      scene.grid();
      const first = new DOMMatrix().translate(left, top).scale(scale);
      if (mode.value === 'edit') {
        const second = new DOMMatrix().translate(left + (columns === 2 ? dx : 0), top + (columns === 1 ? dy : 0)).scale(scale);
        scene.surface(baseline, first);
        scene.surface(candidate, second);
        scene.register(baseline, first);
        scene.register(candidate, second);
      } else {
        scene.surface(baseline, first, {
          mode:mode.value === 'wipe' ? 1 : 2,
          other:candidate,
          wipe:Number($('wipe').value) / 100
        });
        for (const panel of panels) scene.unregister(panel);
      }
    },
    ready() {
      $('export').hidden = false;
      $('engine').textContent = 'Live HTML-in-Canvas · Two native forms painted into WebGL textures';
    },
    fallback(message) {
      observer?.disconnect();
      mode.value = 'edit';
      $('plain').append(...panels);
      $('plain').hidden = false;
      canvas.hidden = true;
      $('view-control').hidden = true;
      $('export').hidden = true;
      $('engine').textContent = message;
      update();
      observer = new ResizeObserver(measure);
      observer.observe($('plain'));
    }
  });
  if (renderer) {
    observer = new ResizeObserver(update);
    observer.observe(canvas);
  }
})();
