'use strict';

window.AtlasGPU = (() => {
  const renderSource=`
    struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
    @vertex fn cover(@builtin(vertex_index) i: u32) -> Vertex {
      let vertices = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
      let p = vertices[i];
      return Vertex(vec4f(p,0,1), vec2f((p.x+1)*.5,(1-p.y)*.5));
    }
    @group(0) @binding(0) var samplePaint: sampler;
    @group(0) @binding(1) var paint: texture_2d<f32>;
    @group(0) @binding(2) var<uniform> settings: vec4f;
    @fragment fn original(@location(0) uv: vec2f) -> @location(0) vec4f {
      let p = textureSample(paint,samplePaint,uv);
      return vec4f(mix(vec3f(.055,.098,.14),p.rgb,p.a),1);
    }
    @fragment fn mask(@location(0) uv: vec2f) -> @location(0) vec4f {
      let p = textureSample(paint,samplePaint,uv);
      let luma = dot(p.rgb,vec3f(.2126,.7152,.0722));
      let marked = p.a > .5 && luma < settings.x;
      return vec4f(select(vec3f(.14,.2,.23),vec3f(1,.69,.28),marked),1);
    }
  `;
  const computeSource=`
    @group(0) @binding(0) var paint: texture_2d<f32>;
    @group(0) @binding(1) var<uniform> settings: vec4f;
    @group(0) @binding(2) var<storage,read_write> darkCount: atomic<u32>;
    @compute @workgroup_size(8,8) fn measure(@builtin(global_invocation_id) id: vec3u) {
      let dimensions = textureDimensions(paint);
      var dark = 0u;
      for (var y = 0u; y < 4u; y++) {
        for (var x = 0u; x < 4u; x++) {
          let pos = id.xy * 4u + vec2u(x,y);
          if (all(pos < dimensions)) {
            let p = textureLoad(paint,vec2i(pos),0);
            let luma = dot(p.rgb,vec3f(.2126,.7152,.0722));
            if (p.a > .5 && luma < settings.x) { dark += 1u; }
          }
        }
      }
      if (dark > 0u) { atomicAdd(&darkCount,dark); }
    }
  `;

  function place(sw,sh,x,y,w,h) {
    const scale=Math.min(w/sw,h/sh);
    return {x:x+(w-sw*scale)/2,y:y+(h-sh*scale)/2,w:sw*scale,h:sh*scale,scale};
  }
  function boxes(sw,sh,w,h) {
    if(w>=660){
      return [place(sw,sh,16,18,(w-46)/2,h-36),place(sw,sh,w/2+7,18,(w-46)/2,h-36)];
    }
    return [place(sw,sh,14,14,w-28,h/2-27),place(sw,sh,14,h/2+10,w-28,h/2-27)];
  }

  async function start(ui) {
    try {
      await setup(ui);
    } catch(error) {
      ui.fail('WebGPU element capture failed '+error.message);
    }
  }
  async function setup(ui) {
    const {canvas,$}=ui;
    if (!navigator.gpu || typeof canvas.requestPaint!=='function' ||
      typeof canvas.updateElementGeometry!=='function') {
      ui.fail('WebGPU element capture is unavailable.'); return;
    }
    const adapter=await navigator.gpu.requestAdapter();
    if(ui.stopped)return;
    if(!adapter){ui.fail('No WebGPU adapter was available.');return;}
    const device=await adapter.requestDevice();
    if(ui.stopped){device.destroy();return;}
    if(typeof device.queue.drawElementImageToTexture!=='function'){
      device.destroy();
      ui.fail('This WebGPU implementation does not provide native element upload.');
      return;
    }
    const source=$('ink-source'), threshold=$('threshold'), metrics=$('ink-metrics');
    const context=canvas.getContext('webgpu');
    if(!context){device.destroy();ui.fail('The WebGPU canvas could not start.');return;}
    const format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'opaque'});
    const uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const counts=device.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    const read=device.createBuffer({size:4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
    let texture, bindings, measureBindings, tw=0, th=0, busy=false, queued=false, first=true, watch;
    ui.cleanup(()=>{
      clearTimeout(watch); texture?.destroy(); uniform.destroy(); counts.destroy(); read.destroy(); device.destroy();
    });
    device.lost.then(()=>{if(!ui.stopped) ui.fail('The WebGPU device stopped.');});
    ui.listen(device,'uncapturederror',event=>{event.preventDefault();ui.fail('WebGPU could not process the native capture.');});

    const vertex=device.createShaderModule({code:renderSource});
    const computeModule=device.createShaderModule({code:computeSource});
    const renderLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.FRAGMENT,sampler:{}},
      {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}},
      {binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}
    ]});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
    function renderPipeline(entryPoint) {
      return device.createRenderPipeline({
        layout:pipelineLayout,vertex:{module:vertex,entryPoint:'cover'},
        fragment:{module:vertex,entryPoint,targets:[{format}]},primitive:{topology:'triangle-list'}
      });
    }
    const original=renderPipeline('original'), mask=renderPipeline('mask');
    const calculation=device.createComputePipeline({layout:'auto',compute:{module:computeModule,entryPoint:'measure'}});

    function setupTexture(w,h) {
      if(w===tw&&h===th) return;
      texture?.destroy();
      tw=w; th=h;
      texture=device.createTexture({size:[tw,th],format:'rgba8unorm',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      const view=texture.createView();
      bindings=device.createBindGroup({layout:renderLayout,entries:[
        {binding:0,resource:sampler},{binding:1,resource:view},{binding:2,resource:{buffer:uniform}}
      ]});
      measureBindings=device.createBindGroup({layout:calculation.getBindGroupLayout(0),entries:[
        {binding:0,resource:view},{binding:1,resource:{buffer:uniform}},{binding:2,resource:{buffer:counts}}
      ]});
    }

    async function paint() {
      if(busy){queued=true;return;}
      busy=true;
      try {
        const w=canvas.clientWidth,h=canvas.clientHeight;
        if(!w||!h) return;
        const dpr=Math.min(2,devicePixelRatio||1);
        const width=Math.round(w*dpr),height=Math.round(h*dpr);
        if(canvas.width!==width) canvas.width=width;
        if(canvas.height!==height) canvas.height=height;
        const sw=source.offsetWidth,sh=source.offsetHeight;
        const size=canvas.getElementImageDefaultSize?.(source);
        setupTexture(Math.ceil(size?.width??sw*dpr),Math.ceil(size?.height??sh*dpr));
        const normalized=Number(threshold.value)/100;
        device.queue.writeBuffer(uniform,0,new Float32Array([normalized,0,0,0]));
        device.queue.drawElementImageToTexture({source},{texture,size:{width:tw,height:th}});

        const command=device.createCommandEncoder();
        command.clearBuffer(counts);
        const calc=command.beginComputePass();
        calc.setPipeline(calculation);
        calc.setBindGroup(0,measureBindings);
        calc.dispatchWorkgroups(Math.ceil(tw/32),Math.ceil(th/32));
        calc.end();

        const target=context.getCurrentTexture().createView();
        const pass=command.beginRenderPass({colorAttachments:[{
          view:target,clearValue:{r:.055,g:.098,b:.14,a:1},loadOp:'clear',storeOp:'store'
        }]});
        const [left,right]=boxes(sw,sh,w,h);
        const rx=width/w,ry=height/h;
        for(const [i,box] of [left,right].entries()){
          pass.setPipeline(i===0?original:mask);
          pass.setBindGroup(0,bindings);
          pass.setViewport(box.x*rx,box.y*ry,box.w*rx,box.h*ry,0,1);
          pass.draw(3);
        }
        pass.end();
        command.copyBufferToBuffer(counts,0,read,0,4);
        device.queue.submit([command.finish()]);
        canvas.updateElementGeometry(source,{canvasTransform:new DOMMatrix().translate(left.x,left.y).scale(left.scale)});

        await read.mapAsync(GPUMapMode.READ);
        if(ui.stopped) return;
        const dark=new Uint32Array(read.getMappedRange())[0];
        read.unmap();
        metrics.textContent=dark.toLocaleString()+' dark pixels · '+(100*dark/(tw*th)).toFixed(2)+'% at '+normalized.toFixed(2)+' cutoff';
        if(first){
          first=false;
          clearTimeout(watch);
          ui.status('Live WebGPU · Original first, computed mask second');
        }
      } catch(error){
        if(!ui.stopped)ui.fail('WebGPU could not complete the paint and compute pass.');
      } finally {
        busy=false;
        if(queued&&!ui.stopped){
          queued=false;
          canvas.requestPaint();
        }
      }
    }

    ui.listen($('ink-weight'),'change',event=>{$('ink-text').style.fontWeight=event.target.value;});
    ui.listen(threshold,'input',()=>canvas.requestPaint());
    ui.listen(canvas,'paint',paint);
    ui.observe(()=>canvas.requestPaint());
    watch=setTimeout(()=>ui.fail('The WebGPU adapter did not produce a readable result.'),7000);
    canvas.requestPaint();
  }

  return {start};
})();
