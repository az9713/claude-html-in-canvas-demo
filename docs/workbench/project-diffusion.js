'use strict';
(() => {
  const pretty = value => Number(value.toPrecision(5)).toString();
  const wave = values => Math.PI * values.mode * (values.boundary === 'Periodic' ? 2 : 1);
  const halfLife = values => Math.log(2) / (values.diffusivity * (wave(values) / values.length) ** 2);
  const project = {
    number:1,
    id:'diffusion-lab',
    title:'Interactive diffusion lab',
    summary:'Compare the analytical decay of a concentration mode with a finite-difference calculation.',
    guide:'Choose a boundary and mode. Enter your predicted remaining amplitude, then reveal the calculation. Freeze one run before changing the mesh or time.',
    fields:[
      {key:'boundary',label:'Boundary condition',type:'select',options:['Fixed concentration','Zero flux','Periodic'],value:'Fixed concentration'},
      {key:'length',label:'Slab length',type:'number',min:5,max:500,step:1,value:80,unit:'µm'},
      {key:'diffusivity',label:'Diffusivity',type:'number',min:.01,max:100,step:.01,value:3,unit:'µm²/s'},
      {key:'mode',label:'Spatial mode',type:'range',min:1,max:8,step:1,value:2},
      {key:'cells',label:'Mesh intervals',type:'range',min:20,max:160,step:1,value:24},
      {key:'courant',label:'Maximum D Δt/Δx²',type:'range',min:.05,max:.5,step:.01,value:.42},
      {key:'time',label:'Elapsed time',type:'range',min:0,max:300,step:1,value:55,unit:'s',playback:true,duration:12},
      {key:'prediction',label:'Predicted remaining amplitude',type:'number',min:0,max:100,step:.1,value:30,unit:'%'},
      {key:'reveal',label:'Reveal calculated result',type:'checkbox',value:true},
      {key:'view',label:'Plot',type:'select',options:['Concentration','Absolute error'],value:'Concentration'}
    ],
    actions:[
      {label:'Double the mesh',run:values => ({cells:Math.min(160,values.cells*2)})},
      {label:'Go to half-life (up to 300 s)',run:values => ({time:Math.min(300,Math.round(halfLife(values)))})}
    ],
    run(values) {
      const {boundary,length,diffusivity,mode,cells,courant,time,prediction,reveal,view} = values;
      const k = wave(values);
      const shape = boundary === 'Fixed concentration' ? Math.sin : Math.cos;
      const initialValue = x => .5 + .38 * shape(k*x/length);
      const exact = Math.exp(-diffusivity*(k/length)**2*time);
      const dx = length/cells;
      const steps = time === 0 ? 0 : Math.ceil(diffusivity*time/(courant*dx*dx));
      const dt = steps ? time/steps : 0;
      const r = diffusivity*dt/(dx*dx);
      const numerical = (1-4*r*Math.sin(k/(2*cells))**2)**steps;
      const exactSeries = Array.from({length:241},(_,i) => {
        const x = length*i/240;
        return [x,.5+.38*exact*shape(k*x/length)];
      });
      const initial = Array.from({length:241},(_,i) => [length*i/240,initialValue(length*i/240)]);
      const grid = Array.from({length:cells+1},(_,i) => {
        const x = dx*i, phase = shape(k*i/cells);
        return [x,.5+.38*numerical*phase,Math.abs(.38*(numerical-exact)*phase)];
      });
      const peakError = Math.max(...grid.map(point => point[2]));
      const errorView = reveal && view === 'Absolute error';
      const series = errorView ? [{label:'Absolute nodal error',points:grid.map(([x,_,error]) => [x,error])}]
        : [{label:'Initial profile',points:initial,dashed:true}];
      if (reveal && !errorView) {
        series.push({label:'Analytical profile',points:exactSeries},{label:'Finite-difference nodes',points:grid.map(([x,y]) => [x,y]),scatter:true});
      }
      const extreme = grid.reduce((best,current) => current[2] > best[2] ? current : best,grid[0]);
      const marker = !reveal ? {x:length*.5,y:initialValue(length*.5),label:'Prediction'}
        : {x:extreme[0],y:errorView ? extreme[2] : extreme[1],label:'Largest nodal difference'};
      const modeName = shape === Math.sin ? 'sine' : 'cosine';
      return {
        summary:reveal ? 'The analytical and finite-difference runs use the same initial profile and boundary condition.'
          : 'The initial profile is visible. Predict the remaining amplitude, then reveal the result.',
        metrics:reveal ? [
          ['Analytical amplitude',pretty(100*exact)+'%'],
          ['Numerical modal coefficient',pretty(100*numerical)+'%'],
          ['Prediction error',pretty(Math.abs(prediction-100*exact))+' percentage points'],
          ['Peak nodal error',pretty(peakError)],
          ['Time steps',steps],
          ['Mode half-life',pretty(halfLife(values))+' s']
        ] : [['Your prediction',prediction+'%'],['Elapsed time',time+' s']],
        details:reveal ? [
          'The analytical amplitude is exp(−Dk²t), with the '+modeName+' eigenmode selected by the boundary condition.',
          'Forward Euler with centered spatial differences multiplies this mesh mode by 1 − 4r sin²(k Δx/2) at each step. The plotted nodes use that factor over all '+steps+' steps.',
          'Δx = '+pretty(dx)+' µm, Δt = '+pretty(dt)+' s, r = '+pretty(r)+'.' +
            (numerical < 0 ? ' The negative coefficient indicates a discrete phase inversion.' : '')
        ] : [],
        scene:{
          kind:'plot',xLabel:'Position (µm)',yLabel:errorView ? 'Absolute concentration error' : 'Concentration (fraction)',
          xRange:[0,length],yRange:errorView ? [0,Math.max(1e-12,peakError*1.15)] : [0,1],series,
          markers:[{...marker,key:'diffusion-observation'}]
        }
      };
    }
  };
  window.workbenchProjects.push(project);
})();
