'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), controller = $('controller');
  const angle = $('angle'), load = $('load'), fan = $('enabled'), profile = $('profile');
  const device = $('device'), result = $('result');
  const maxTemperature = 48;
  let renderer;

  function readout() {
    const cooling = fan.checked ? Number(profile.value) : 1.2;
    const temperature = 23 + Number(load.value) / cooling;
    const margin = maxTemperature - temperature;
    $('temperature').textContent = temperature.toFixed(1) + ' °C';
    $('margin').textContent = (margin < 0 ? Math.abs(margin).toFixed(1) + ' °C over limit' : margin.toFixed(1) + ' °C below limit');
    $('load-value').textContent = load.value + ' W';
    return temperature;
  }

  function changedSetting() {
    readout();
    result.textContent = 'Ready for check';
    renderer?.request();
  }

  function changedAngle() {
    $('angle-value').textContent = angle.value + '°';
    renderer?.request();
  }

  for (const field of [load, fan, profile, device]) field.addEventListener('input', changedSetting);
  angle.addEventListener('input', changedAngle);
  $('front').addEventListener('click', () => {
    angle.value = '0';
    changedAngle();
  });
  $('commission').addEventListener('click', () => {
    const label = device.value.trim() || 'Bench';
    const temperature = readout();
    result.textContent = temperature > maxTemperature ? label + ' · Hold. Temperature exceeds ' + maxTemperature + ' °C.'
      : !fan.checked ? label + ' · Hold. Fan is disabled.'
      : label + ' · Pass. Fan is enabled and temperature is within range.';
    renderer?.request();
  });
  $('export').addEventListener('click', () => LiveCanvas.save(canvas, '3d-control-panel.png'));
  changedSetting();
  changedAngle();

  renderer = LiveCanvas.open(canvas, {
    panels:[controller],
    render(scene, width, height) {
      const panelWidth = controller.offsetWidth, panelHeight = controller.offsetHeight;
      const border = 17, yaw = Number(angle.value);
      let scale = Math.min(width * .95 / (panelWidth + 2*border), height * .88 / (panelHeight + 2*border), 1.16);
      const perspective = new DOMMatrix();
      perspective.m34 = -1/850;
      const shellWidth = panelWidth + 2*border, shellHeight = panelHeight + 2*border;
      function project() {
        return new DOMMatrix().translate(width/2, height/2).multiply(perspective)
          .rotate(yaw === 0 ? 0 : -11, yaw, 0).scale(scale,scale,scale).translate(-panelWidth/2,-panelHeight/2);
      }
      function bounds(matrix) {
        const housing = matrix.translate(-border,-border);
        const projected = [0,-36].flatMap(z => LiveCanvas.corners(housing,shellWidth,shellHeight,z));
        const xs = projected.map(point => point.x/point.w);
        const ys = projected.map(point => point.y/point.w);
        return {left:Math.min(...xs), right:Math.max(...xs), top:Math.min(...ys), bottom:Math.max(...ys)};
      }
      let matrix = project(), box = bounds(matrix);
      scale *= Math.min(1, (width-22)/(box.right-box.left), (height-22)/(box.bottom-box.top));
      matrix = project();
      box = bounds(matrix);
      matrix = new DOMMatrix().translate((width-box.left-box.right)/2,(height-box.top-box.bottom)/2).multiply(matrix);
      const shell = matrix.translate(-border,-border);
      const front = LiveCanvas.corners(shell, shellWidth, shellHeight);
      const back = LiveCanvas.corners(shell, shellWidth, shellHeight, -36);
      scene.grid();
      scene.solid(back, [.11,.18,.23,1]);
      scene.solid([back[0],back[1],front[0],front[1]], [.18,.29,.33,1]);
      scene.solid([front[2],front[3],back[2],back[3]], [.20,.32,.36,1]);
      scene.solid([back[0],front[0],back[2],front[2]], [.28,.38,.40,1]);
      scene.solid([front[1],back[1],front[3],back[3]], [.14,.24,.28,1]);
      scene.solid(front, [.31,.39,.41,1]);
      scene.surface(controller, matrix);
      scene.register(controller, matrix);
    },
    ready() {
      $('export').hidden = false;
      $('engine').textContent = 'Live HTML-in-Canvas · The rendered texture and hit targets use the same 3D transform';
    },
    fallback(message) {
      $('plain').append(controller);
      $('plain').hidden = false;
      canvas.hidden = true;
      $('angle-control').hidden = true;
      $('front').hidden = true;
      $('export').hidden = true;
      $('engine').textContent = message;
    }
  });
})();
