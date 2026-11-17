'use strict';
let canvas, ctx, draws=0;
const preserve={preserveElementGeometry:true};

function caption(text,x,y,w) {
  ctx.font='12px Consolas, monospace';
  ctx.fillStyle='#c7dbdf'; ctx.textBaseline='top'; ctx.fillText(text,x,y,w);
}

onmessage=async ({data})=>{
  try {
    if(data.canvas) {
      canvas=data.canvas;
      ctx=canvas.getContext('2d',{alpha:false});
      if(typeof ctx?.drawElementImage!=='function') throw new Error('Worker-native HTML drawing is unavailable.');
      return;
    }
    if(data.save) {
      const blob=await canvas.convertToBlob({type:'image/png'});
      postMessage({blob}); return;
    }
    const {element,dims,css,copies}=data;
    const {width,height,w,h}=dims;
    if(width<1||height<1){element.close?.();return;}
    if(canvas.width!==width) canvas.width=width;
    if(canvas.height!==height) canvas.height=height;
    ctx.setTransform(width/w,0,0,height/h,0,0);
    ctx.fillStyle='#12212b'; ctx.fillRect(0,0,w,h);
    const [sw,sh]=css;
    const scale=Math.min(1.18,(w-32)/sw);
    const x=(w-sw*scale)/2,y=34;
    caption('Type in the original dispatch label',x,y-18,w-32);
    ctx.drawElementImage(element,x,y,sw*scale,sh*scale,preserve);
    canvas.updateElementGeometry(element,{canvasTransform:new DOMMatrix().translate(x,y).scale(scale)});
    const sy=y+sh*scale+49, proofHeight=h-sy-14;
    const columns=w<650?Math.min(2,copies):copies, rows=Math.ceil(copies/columns), gap=10;
    const cell=(w-30-(columns-1)*gap)/columns;
    const row=(proofHeight-(rows-1)*gap)/rows;
    ctx.fillStyle='#253b43';ctx.fillRect(10,sy-7,w-20,proofHeight+12);
    caption('Worker-composed proof sheet',16,sy-25,w-32);
    for(let i=0;i<copies;i++){
      const px=15+(i%columns)*(cell+gap),py=sy+Math.floor(i/columns)*(row+gap);
      const s=Math.min((cell-7)/sw,(row-16)/sh);
      const dx=px+(cell-s*sw)/2,dy=py+7;
      ctx.drawElementImage(element,dx,dy,sw*s,sh*s,preserve);
    }
    queueMicrotask(()=>element.close?.());
    postMessage({rendered:++draws});
  } catch(error) {
    data.element?.close?.();
    postMessage({error:error.message||'Worker rendering failed.'});
  }
};
