// Keep the flight controls independent while blocking browser zoom gestures.
export function installZoomGuard(surface,documentTarget){
  let lastTap=null,multiTouch=false;
  const cancel=e=>{if(e.cancelable)e.preventDefault();};
  for(const type of ['gesturestart','gesturechange','gestureend'])documentTarget.addEventListener(type,cancel,{passive:false});
  surface.addEventListener('dblclick',cancel,{passive:false});
  surface.addEventListener('touchstart',e=>{if(e.touches.length>1){multiTouch=true;lastTap=null;}},{passive:true});
  surface.addEventListener('touchmove',e=>{if(e.touches.length>1){multiTouch=true;lastTap=null;cancel(e);}},{passive:false});
  surface.addEventListener('touchcancel',()=>{multiTouch=false;lastTap=null;},{passive:true});
  surface.addEventListener('touchend',e=>{
    if(multiTouch||e.touches.length){if(!e.touches.length)multiTouch=false;lastTap=null;return;}
    const point=e.changedTouches[0];
    if(!point){lastTap=null;return;}
    // Native buttons and form elements retain their normal click behavior;
    // CSS touch-action handles their double taps.
    if(e.target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]')){lastTap=null;return;}
    const now=e.timeStamp;
    if(lastTap&&now-lastTap.time<350&&Math.hypot(point.clientX-lastTap.x,point.clientY-lastTap.y)<40)cancel(e);
    lastTap={time:now,x:point.clientX,y:point.clientY};
  },{passive:false});
}
