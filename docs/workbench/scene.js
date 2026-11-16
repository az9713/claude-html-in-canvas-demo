'use strict';
window.WorkbenchScene = (() => {
  const colors = ['#f3c98b', '#7dd6cb', '#97b9f4', '#f09b9e', '#bfb0f0', '#bfd990'];
  const background = '#101a25';
  const muted = '#adbdc5';
  const grid = '#304252';
  const mono = '11px Consolas, monospace';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
  const number = value => value === 0 ? '0' : Math.abs(value) >= 1e4 || Math.abs(value) < .001
    ? value.toExponential(1) : Number(value.toPrecision(4)).toString();

  function extent(points, coordinate, explicit) {
    if (finite(explicit) && explicit[1] > explicit[0]) return explicit;
    let low = Infinity, high = -Infinity;
    for (const point of points) {
      if (!finite(point)) continue;
      low = Math.min(low, point[coordinate]);
      high = Math.max(high, point[coordinate]);
    }
    if (low > high) return [0, 1];
    const padding = (high - low || Math.abs(low) || 1) * .06;
    return [low - padding, high + padding];
  }

  function axes(scene, width, height, reference) {
    const plot = scene.kind === 'plot';
    const left = plot ? clamp(width * .14, 48, 63) : 14;
    const top = plot ? 36 : 22;
    const w = Math.max(1, width - left - (plot ? 22 : 14));
    const h = Math.max(1, height - top - (plot ? 68 : 28));
    const points = plot
      ? [...(scene.series || []), ...(reference?.kind === 'plot' ? reference.series : [])].flatMap(line => line.points)
      : [];
    const [x0, x1] = plot ? extent(points, 0, scene.xRange) : [0, 100];
    const [y0, y1] = plot ? extent(points, 1, scene.yRange) : [0, 100];
    return {
      left, top, w, h, x0, x1, y0, y1,
      x: value => left + w * (value - x0) / (x1 - x0),
      y: value => top + h * (plot ? (y1 - value) / (y1 - y0) : (value - y0) / (y1 - y0)),
      from(px, py) {
        const u = clamp((px - left) / w, 0, 1), v = clamp((py - top) / h, 0, 1);
        return { x: x0 + u * (x1 - x0), y: plot ? y1 - v * (y1 - y0) : y0 + v * (y1 - y0) };
      }
    };
  }

  function notePosition(x, y, cardWidth, cardHeight, width, height) {
    return {
      x: Math.round(clamp(x + 12 + cardWidth <= width - 7 ? x + 12 : x - cardWidth - 12, 7, width - cardWidth - 7)),
      y: Math.round(clamp(y - cardHeight - 10 >= 7 ? y - cardHeight - 10 : y + 10, 7, height - cardHeight - 7))
    };
  }

  function line(ctx, x0, y0, x1, y1, color) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function plot(ctx, scene, view, reference) {
    const {left,top,w,h,x0,x1,y0,y1} = view;
    const ticks = w < 340 ? 4 : 6;
    ctx.font = mono;
    ctx.lineWidth = 1;
    ctx.fillStyle = muted;
    for (let i = 0; i <= ticks; i++) {
      const u = i / ticks, x = left + u * w, y = top + (1 - u) * h;
      line(ctx, x, top, x, top + h, grid);
      line(ctx, left, y, left + w, y, grid);
      if (!scene.hideTickLabels) {
        ctx.textAlign = 'center';
        ctx.fillText(number(x0 + u * (x1 - x0)), x, top + h + 17);
        ctx.textAlign = 'right';
        ctx.fillText(number(y0 + u * (y1 - y0)), left - 7, y + 4);
      }
    }
    ctx.textAlign = 'center';
    ctx.fillText(scene.xLabel || '', left + w / 2, top + h + 38, w);
    ctx.save();
    ctx.translate(13, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(scene.yLabel || '', 0, 0, h);
    ctx.restore();
    const series = scene.series || [];
    ctx.save();
    ctx.beginPath(); ctx.rect(left,top,w,h); ctx.clip();
    const draw = (entry, i, ghost) => {
      const points = entry.points || [];
      ctx.strokeStyle = entry.color || colors[i % colors.length];
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = ghost ? .44 : 1;
      ctx.setLineDash(ghost ? [4,5] : entry.dashed ? [6,4] : []);
      ctx.lineWidth = ghost ? 1.8 : 2;
      ctx.beginPath();
      let started = false;
      for (const point of points) {
        if (!finite(point)) { started = false; continue; }
        const x = view.x(point[0]), y = view.y(point[1]);
        if (started && !entry.scatter) ctx.lineTo(x,y);
        else ctx.moveTo(x,y);
        started = true;
      }
      ctx.stroke();
      if (entry.scatter || points.length === 1) {
        for (const point of points) {
          if (!finite(point)) continue;
          ctx.beginPath();
          ctx.arc(view.x(point[0]), view.y(point[1]), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    if (reference?.kind === 'plot') reference.series.forEach((entry, i) => draw(entry, i, true));
    series.forEach((entry, i) => draw(entry, i, false));
    ctx.restore();
    const entries = series.filter(entry => entry.label).slice(0, 6);
    if (reference?.kind === 'plot') entries.unshift({ label: 'Frozen reference', color: '#a0aab3', dashed:true });
    const legendWidth = w / Math.max(1, Math.min(entries.length, w < 340 ? 2 : 4));
    const columns = Math.max(1, Math.min(entries.length, w < 340 ? 2 : 4));
    entries.slice(0, columns * 2).forEach((entry, i) => {
      const x = left + (i % columns) * legendWidth, y = 13 + Math.floor(i / columns) * 13;
      const index = series.indexOf(entry);
      ctx.setLineDash(entry.dashed ? [3,3] : []);
      line(ctx,x,y-3,x+11,y-3,entry.color || colors[Math.max(0,index) % colors.length]);
      ctx.setLineDash([]);
      ctx.textAlign = 'left';
      ctx.fillText(entry.label,x+15,y,Math.max(1,legendWidth-19));
    });
  }

  function imageDimensions(image) {
    return [image?.naturalWidth || image?.videoWidth, image?.naturalHeight || image?.videoHeight];
  }

  function fitImage(ctx, image, x, y, w, h) {
    const [iw, ih] = imageDimensions(image);
    if (!(iw > 0 && ih > 0 && w > 0 && h > 0)) return false;
    const scale = Math.min(w / iw, h / ih);
    ctx.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
    return true;
  }

  function displayText(ctx, value, x, y, width, height, color, font) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineHeight = (Number.parseInt(font, 10) || 13) + 3;
    let yy = y;
    for (const paragraph of String(value ?? '').split('\n')) {
      let row = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = row ? row + ' ' + word : word;
        if (row && ctx.measureText(next).width > width) {
          ctx.fillText(row, x, yy, width);
          yy += lineHeight;
          if (yy + lineHeight > y + height) return;
          row = word;
        } else {
          row = next;
        }
      }
      ctx.fillText(row, x, yy, width);
      yy += lineHeight;
      if (yy + lineHeight > y + height) return;
    }
  }

  function board(ctx, scene, view, getMedia) {
    ctx.save();
    ctx.beginPath(); ctx.rect(view.left, view.top, view.w, view.h); ctx.clip();
    for (const shape of scene.shapes || []) {
      const {type, x = 0, y = 0, w = 20, h = 20, fill, stroke} = shape;
      const px = view.x(x), py = view.y(y), pw = view.w * w / 100, ph = view.h * h / 100;
      ctx.lineWidth = 1.3;
      if (type === 'line') {
        line(ctx,px,py,view.x(shape.x2),view.y(shape.y2),stroke || colors[1]);
      } else if (type === 'text') {
        displayText(ctx,shape.label,px,py,pw,ph,fill || muted,shape.font || '13px Segoe UI');
      } else if (type === 'image') {
        const media = getMedia(shape.source, shape.time);
        const [iw, ih] = imageDimensions(media);
        if (shape.fit === 'fill' && iw > 0 && ih > 0) {
          ctx.drawImage(media,px,py,pw,ph);
        } else if (!fitImage(ctx,media,px,py,pw,ph)) {
          ctx.fillStyle = '#24374a'; ctx.fillRect(px,py,pw,ph);
          displayText(ctx,shape.label || 'Local image or frame',px+8,py+8,Math.max(10,pw-16),ph-16,muted,'13px Segoe UI');
        }
      } else if (type === 'circle' || type === 'polygon' || type === 'rect') {
        ctx.beginPath();
        if (type === 'circle') ctx.arc(px,py,Math.max(1,view.w * (shape.r || 2) / 100),0,Math.PI*2);
        if (type === 'rect') ctx.rect(px,py,pw,ph);
        if (type === 'polygon') {
          const points = (shape.points || []).filter(finite);
          points.forEach(([vx,vy], i) => i ? ctx.lineTo(view.x(vx),view.y(vy)) : ctx.moveTo(view.x(vx),view.y(vy)));
          ctx.closePath();
        }
        ctx.fillStyle = fill || '#23394b';
        if (fill !== 'transparent') ctx.fill();
        ctx.strokeStyle = stroke || '#6f8a98';
        if (stroke !== 'transparent') ctx.stroke();
        if (shape.label) displayText(ctx,shape.label,px+5,py+4,Math.max(12,pw-10),ph-7,shape.textColor || '#edf2e8','13px Segoe UI');
      }
    }
    ctx.restore();
  }

  function comparison(ctx, scene, view, getMedia) {
    const {left,top,w,h} = view;
    const position = Number.isFinite(scene.position) ? clamp(scene.position / 100,0,1) : .5;
    const split = scene.mode === 'split';
    const wipe = !split && scene.mode !== 'difference';
    const drawLayer = (context, source, x, y, width, height, index) => {
      context.fillStyle = index ? '#243244' : '#293c4b';
      context.fillRect(x,y,width,height);
      if (fitImage(context,getMedia(source, index ? scene.rightTime : scene.leftTime),x,y,width,height)) return;
      context.fillStyle = '#172535';
      context.fillRect(x+width*.08,y+height*.16,width*.84,height*.68);
      const offset = index ? .07 : 0;
      [0,1,2].forEach(i => {
        context.fillStyle = i === 1 ? colors[index] : '#577087';
        context.fillRect(x+width*(.16+offset), y+height*(.29+i*.16), width*(.61-i*.09), Math.min(height*.055,14));
      });
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(left,top,w,h); ctx.clip();
    if (split) {
      drawLayer(ctx,scene.left,left,top,w/2-3,h,0);
      drawLayer(ctx,scene.right,left+w/2+3,top,w/2-3,h,1);
    } else if (wipe) {
      drawLayer(ctx,scene.right,left,top,w,h,1);
      ctx.save(); ctx.beginPath(); ctx.rect(left,top,w*position,h); ctx.clip();
      drawLayer(ctx,scene.left,left,top,w,h,0);
      ctx.restore();
      ctx.lineWidth = 2;
      line(ctx,left+w*position,top,left+w*position,top+h,colors[0]);
    } else {
      // Composite the two complete, letterboxed images before computing the difference.
      const sample = document.createElement('canvas');
      sample.width = Math.max(1,Math.ceil(w));
      sample.height = Math.max(1,Math.ceil(h));
      const difference = sample.getContext('2d');
      drawLayer(ctx,scene.left,left,top,w,h,0);
      drawLayer(difference,scene.right,0,0,sample.width,sample.height,1);
      ctx.globalCompositeOperation = 'difference';
      ctx.drawImage(sample,left,top,w,h);
    }
    ctx.restore();
    ctx.fillStyle = muted;
    ctx.textBaseline = 'alphabetic';
    ctx.font = mono;
    ctx.textAlign = 'left';
    ctx.fillText(scene.leftLabel || 'Reference',left,14,w/2-4);
    ctx.textAlign = 'right';
    ctx.fillText(scene.rightLabel || 'Current',left+w,14,w/2-4);
  }

  function draw(ctx, scene, view, reference, markers, selected, getMedia) {
    const width = ctx.canvas.clientWidth || ctx.canvas.width;
    const height = ctx.canvas.clientHeight || ctx.canvas.height;
    ctx.fillStyle = background;
    ctx.fillRect(0,0,width,height);
    ctx.textBaseline = 'alphabetic';
    if (scene.kind === 'plot') plot(ctx,scene,view,reference);
    if (scene.kind === 'board') {
      if (reference?.kind === 'board') {
        ctx.save(); ctx.globalAlpha = .27;
        board(ctx,reference,view,getMedia);
        ctx.restore();
      }
      board(ctx,scene,view,getMedia);
      if (scene.xLabel || scene.yLabel) {
        ctx.font = mono;
        ctx.fillStyle = muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText([scene.xLabel,scene.yLabel].filter(Boolean).join(' · '),view.left,14,view.w);
      }
    }
    if (scene.kind === 'compare') comparison(ctx,scene,view,getMedia);
    for (const marker of markers) {
      const x = view.x(marker.x), y = view.y(marker.y);
      if (x < view.left || x > view.left+view.w || y < view.top || y > view.top+view.h) continue;
      const active = marker.key === selected;
      ctx.fillStyle = active ? colors[0] : colors[1];
      ctx.strokeStyle = background;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x,y,active ? 6 : 4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }

  function exportNote(ctx, bounds, marker, note) {
    const {x,y,width,height} = bounds;
    ctx.fillStyle = '#223749';
    ctx.fillRect(x,y,width,height);
    ctx.strokeStyle = '#8ba8b2';
    ctx.strokeRect(x,y,width,height);
    displayText(ctx,marker.label,x+7,y+6,width-14,30,colors[0],'11px Consolas');
    displayText(ctx,note,x+7,y+27,width-14,height-30,'#edf2e8','12px Segoe UI');
  }

  return { axes, draw, exportNote, clamp, notePosition };
})();
