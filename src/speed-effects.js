import { clamp } from './flight.js';

// Based on actual aircraft speed, not throttle position, so the effect builds
// up and settles in sync with acceleration and deceleration.
export function speedIntensity(speed) { return clamp((speed-150)/155,0,1); }
export function cameraFov(speed,portrait) { return (portrait?68:58)+13*speedIntensity(speed); }
// The chase camera sits farther behind the aircraft as speed rises.
export function chaseCameraOffset(speed) {
  const intensity=speedIntensity(speed);
  return [0,19+5*intensity,72+62*intensity];
}
export function cameraDamping(dt,speed,chase=true) {
  const response=chase?7-2*speedIntensity(speed):7;
  return 1-Math.exp(-clamp(dt,0,1)*response);
}

// Blend a few slightly enlarged copies of the actual scene only at the edges.
// Keeping this canvas separate means the instruments and touch controls stay crisp.
export class SpeedWarp {
  constructor(canvas,source) {
    this.canvas=canvas;this.source=source;this.ctx=canvas.getContext('2d');
    this.lastDraw=-1;this.active=false;this.failed=false;
  }
  render(time,speed,horizon=null) {
    if(!this.ctx||this.failed)return;
    const c=this.canvas,ctx=this.ctx,intensity=speedIntensity(speed);
    if(intensity<=0){if(this.active)ctx.clearRect(0,0,c.width,c.height);this.active=false;return;}
    if(time-this.lastDraw<1/30)return;
    this.lastDraw=time;this.active=true;
    // The soft overlay is deliberately lower resolution for mobile performance.
    const ratio=Math.min(window.devicePixelRatio||1,.75);
    const w=Math.max(1,Math.floor(c.clientWidth*ratio)),h=Math.max(1,Math.floor(c.clientHeight*ratio));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    ctx.clearRect(0,0,w,h);
    const cx=w*.5,cy=h*.44;
    try {
      ctx.save();
      for(const [stretch,alpha] of [[.04,.28],[.085,.14],[.14,.07]]) {
        const scale=1+stretch*intensity;
        ctx.globalAlpha=alpha*intensity;
        ctx.drawImage(this.source,cx-cx*scale,cy-cy*scale,w*scale,h*scale);
      }
      ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=1;
      const gradient=ctx.createRadialGradient(cx,cy,Math.min(w,h)*.16,cx,cy,Math.hypot(w,h)*.60);
      gradient.addColorStop(0,'rgba(0,0,0,.10)');
      gradient.addColorStop(.32,'rgba(0,0,0,.25)');
      gradient.addColorStop(1,'rgba(0,0,0,.95)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      // Suppress zoom copies around the horizon so the waterline never doubles.
      if(horizon&&[horizon.a,horizon.b,horizon.c].every(Number.isFinite)){
        const a=horizon.a/w,b=horizon.b/h,norm2=a*a+b*b;
        if(norm2>1e-16){
          const value=a*cx+b*cy+horizon.c,norm=Math.sqrt(norm2),x=cx-value*a/norm2,y=cy-value*b/norm2,band=Math.max(25,Math.min(w,h)*.11);
          const mask=ctx.createLinearGradient(x-a/norm*band,y-b/norm*band,x+a/norm*band,y+b/norm*band);
          mask.addColorStop(0,'rgba(0,0,0,0)');mask.addColorStop(.25,'rgba(0,0,0,.75)');mask.addColorStop(.5,'rgba(0,0,0,1)');mask.addColorStop(.75,'rgba(0,0,0,.75)');mask.addColorStop(1,'rgba(0,0,0,0)');
          ctx.globalCompositeOperation='destination-out';ctx.fillStyle=mask;ctx.fillRect(0,0,w,h);
        }
      }
      ctx.restore();
    } catch(error) {
      ctx.restore();ctx.clearRect(0,0,w,h);this.failed=true;
      console.warn('Speed blur unavailable on this device.',error);
    }
  }
}

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
      const alpha=clamp((radius-.30)/.5,0,1)*(.08+intensity*.32);
      const length=(.025+intensity*.09)*line.rate;
      ctx.strokeStyle=`rgba(211,255,249,${alpha})`;ctx.lineWidth=(.7+intensity)*ratio;
      ctx.beginPath();ctx.moveTo(w*.5+x*(radius-length)*w*.66,h*.44+y*(radius-length)*h*.75);
      ctx.lineTo(w*.5+x*radius*w*.66,h*.44+y*radius*h*.75);ctx.stroke();
    }
  }
}
