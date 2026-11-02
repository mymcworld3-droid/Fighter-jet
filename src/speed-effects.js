import { clamp } from './flight.js';

// Based on actual aircraft speed, not throttle position, so the effect builds
// up and settles in sync with acceleration and deceleration.
export function speedIntensity(speed) { return clamp((speed-150)/155,0,1); }
export function cameraFov(speed,portrait) { return (portrait?68:58)+13*speedIntensity(speed); }

export class SpeedLines {
  constructor(canvas) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    let seed=17241;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    this.lines=Array.from({length:36},()=>({angle:random()*Math.PI*2,progress:random(),rate:.7+random()*.8}));
  }
  render(dt,speed) {
    if(!this.ctx)return;
    const c=this.canvas, ratio=Math.min(window.devicePixelRatio||1,1.5);
    const w=Math.max(1,Math.floor(c.clientWidth*ratio)),h=Math.max(1,Math.floor(c.clientHeight*ratio));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    const ctx=this.ctx;ctx.clearRect(0,0,w,h);
    const intensity=speedIntensity(speed);if(intensity<=0)return;
    ctx.lineCap='round';
    for(const line of this.lines){
      line.progress=(line.progress+Math.min(dt,1)*(.28+intensity*1.15)*line.rate)%1;
      const radius=.24+line.progress*1.1, x=Math.cos(line.angle), y=Math.sin(line.angle);
      const alpha=clamp((radius-.30)/.5,0,1)*(.08+intensity*.27);
      const length=(.022+intensity*.055)*line.rate;
      ctx.strokeStyle=`rgba(211,255,249,${alpha})`;ctx.lineWidth=(.7+intensity)*ratio;
      ctx.beginPath();ctx.moveTo(w*.5+x*(radius-length)*w*.66,h*.44+y*(radius-length)*h*.75);
      ctx.lineTo(w*.5+x*radius*w*.66,h*.44+y*radius*h*.75);ctx.stroke();
    }
  }
}
