import { clamp, createFlight, updateFlight } from './flight.js';
import { bindPointerControl, leverValue } from './controls.js';
import { createEffects, updateEffects } from './effects.js';
import { FlightRenderer, SoftwareFlightRenderer } from './renderer.js';
import { SpeedLines, SpeedWarp } from './speed-effects.js';

const $ = id => document.getElementById(id);
const canvas=$('world'), joystick=$('joystick'), knob=$('stick-knob'), throttle=$('throttle'), fireButton=$('fire-button');
const surface=document.querySelector('.simulator');
for(const event of ['gesturestart','gesturechange','dblclick'])surface.addEventListener(event,e=>e.preventDefault(),{passive:false});
surface.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
let renderer;
try { renderer=new FlightRenderer(canvas); }
catch (error) {
  try { renderer=new SoftwareFlightRenderer(canvas); console.info('Using software 3D rendering.'); }
  catch (fallbackError) { console.error('Unable to start 3D renderer:',error,fallbackError); $('error-screen').hidden=false; }
}

if(renderer){
  let flight=createFlight(),effects=createEffects(),stick={x:0,y:0},lastTime=0,messageTimer,pendingShot=false;
  const speedLines=new SpeedLines($('speed-lines'));
  const speedWarp=new SpeedWarp($('speed-warp'),canvas);
  const keys=new Set();
  const message=(text,duration=3000)=>{
    const el=$('message');el.textContent=text;el.classList.remove('is-hidden');clearTimeout(messageTimer);
    messageTimer=setTimeout(()=>el.classList.add('is-hidden'),duration);
  };
  const drawStick=()=>{
    const radius=(joystick.clientWidth-knob.clientWidth)*.5-6;
    knob.style.transform=`translate(calc(-50% + ${stick.x*radius}px), calc(-50% + ${-stick.y*radius}px))`;
  };
  const setStickFromPointer=e=>{
    const rect=joystick.getBoundingClientRect(),radius=(rect.width-knob.clientWidth)*.5-6;
    let x=(e.clientX-(rect.left+rect.width/2))/radius, y=-(e.clientY-(rect.top+rect.height/2))/radius;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    stick={x,y};drawStick();
  };
  const releaseStick=()=>{stick={x:0,y:0};drawStick();};
  const stickControl=bindPointerControl(joystick,{canStart:()=>!flight.crashed,start:setStickFromPointer,move:setStickFromPointer,end:releaseStick});
  const setThrottle=value=>{
    const amount=Math.round(clamp(value,25,100));flight.throttle=amount/100;
    $('throttle-value').innerHTML=`${amount}<small>%</small>`;
    throttle.style.setProperty('--lever-value',`${(amount-25)/75*100}%`);
    throttle.setAttribute('aria-valuenow',String(amount));throttle.setAttribute('aria-valuetext',`${amount}%`);
  };
  const setLever=e=>setThrottle(leverValue(e.clientY,throttle.getBoundingClientRect()));
  const leverControl=bindPointerControl(throttle,{canStart:()=>!flight.crashed,start:setLever,move:setLever});
  const updateFireButton=()=>{
    const active=fireControl.active()||keys.has(' ');
    fireButton.classList.toggle('is-firing',active);fireButton.setAttribute('aria-pressed',String(active));
  };
  const fireControl=bindPointerControl(fireButton,{canStart:()=>!flight.crashed,start:()=>{pendingShot=true;updateFireButton();},end:updateFireButton});
  throttle.addEventListener('keydown',e=>{
    const adjustment={ArrowUp:5,ArrowRight:5,ArrowDown:-5,ArrowLeft:-5,PageUp:10,PageDown:-10}[e.key];
    if(adjustment!==undefined){e.preventDefault();e.stopPropagation();setThrottle(flight.throttle*100+adjustment);}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();e.stopPropagation();setThrottle(e.key==='Home'?25:100);}
  });
  setThrottle(65);
  function switchCamera(){const mode=renderer.toggleCamera();message(mode==='chase'?'追蹤視角':'機首視角');}
  function reset(){
    keys.clear();stickControl.cancel();leverControl.cancel();fireControl.cancel();releaseStick();
    flight=createFlight();effects=createEffects();pendingShot=false;setThrottle(65);updateFireButton();renderer.camera=null;
    $('end-screen').hidden=true;$('flight-status').textContent='飛行中';lastTime=0;message('已重新起飛，祝你飛行愉快');
  }
  $('camera-button').addEventListener('click',switchCamera);
  $('reset-button').addEventListener('click',reset);
  $('restart-button').addEventListener('click',reset);
  const flightKeys=new Set(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d']);
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();const interactive=e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if(interactive)return;
    if(key===' '){e.preventDefault();if(!flight.crashed){if(!keys.has(key))pendingShot=true;keys.add(key);}updateFireButton();}
    else if(flightKeys.has(key)){e.preventDefault();keys.add(key);}
    else if(key==='v'&&!e.repeat)switchCamera();
    else if(key==='r'&&!e.repeat)reset();
  });
  window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')updateFireButton();});
  const releaseControls=()=>{keys.clear();pendingShot=false;stickControl.cancel();leverControl.cancel();fireControl.cancel();releaseStick();updateFireButton();};
  window.addEventListener('blur',releaseControls);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseControls();lastTime=0;});
  window.addEventListener('resize',drawStick);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error-screen').hidden=false;});
  const keyAxis=(positive,negative)=>(positive.some(k=>keys.has(k))?1:0)-(negative.some(k=>keys.has(k))?1:0);
  function updateReadouts(){
    const speed=Math.round(flight.speed*3.6),altitude=Math.max(0,Math.round(flight.y));
    const heading=(Math.round(flight.yaw*180/Math.PI)+360)%360;
    $('speed').textContent=speed;$('altitude').textContent=altitude;$('heading').textContent=`${String(heading).padStart(3,'0')}°`;
    $('direction').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];
    $('shots-fired').textContent=effects.shotsFired;
    $('speed-meter').style.width=`${clamp(speed/1100*100,0,100)}%`;$('altitude-meter').style.width=`${clamp(altitude/2500*100,0,100)}%`;
  }
  function frame(now){
    const dt=lastTime?Math.min((now-lastTime)/1000,1):0;lastTime=now;
    const input={x:clamp(stick.x+keyAxis(['d','arrowright'],['a','arrowleft']),-1,1),y:clamp(stick.y+keyAxis(['w','arrowup'],['s','arrowdown']),-1,1)};
    const wasFlying=!flight.crashed;
    // Substeps preserve elapsed-time motion on slower devices and avoid skipping collisions.
    for(let remaining=dt;remaining>0;){const step=Math.min(remaining,.025);updateFlight(flight,input,step);updateEffects(effects,flight,fireControl.active()||keys.has(' ')||pendingShot,step);pendingShot=false;remaining-=step;}
    if(wasFlying&&flight.crashed){releaseControls();$('flight-status').textContent='飛行結束';$('end-screen').hidden=false;}
    renderer.render(flight,dt,now/1000,effects);
    speedWarp.render(now/1000,flight.crashed?0:flight.speed);speedLines.render(dt,flight.crashed?0:flight.speed);
    updateReadouts();requestAnimationFrame(frame);
  }
  message('左手駕駛，右手調整推力或按住射擊',5500);
  requestAnimationFrame(frame);
}
