import { clamp, createFlight, updateFlight } from './flight.js';
import { FlightRenderer, SoftwareFlightRenderer } from './renderer.js';

const $ = id => document.getElementById(id);
const canvas=$('world'), joystick=$('joystick'), knob=$('stick-knob'), throttle=$('throttle');
let renderer;
try { renderer=new FlightRenderer(canvas); }
catch (error) {
  try { renderer=new SoftwareFlightRenderer(canvas); console.info('Using software 3D rendering.'); }
  catch (fallbackError) { console.error('Unable to start 3D renderer:',error,fallbackError); $('error-screen').hidden=false; }
}

if(renderer){
  let flight=createFlight(),pointerId=null,stick={x:0,y:0},lastTime=0,messageTimer;
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
  const releaseStick=()=>{pointerId=null;stick={x:0,y:0};drawStick();};
  joystick.addEventListener('pointerdown',e=>{
    if(pointerId!==null || flight.crashed)return;
    e.preventDefault();pointerId=e.pointerId;joystick.setPointerCapture(e.pointerId);setStickFromPointer(e);
  });
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===pointerId){e.preventDefault();setStickFromPointer(e);}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{if(e.pointerId===pointerId)releaseStick();});
  const updateThrottle=()=>{
    flight.throttle=Number(throttle.value)/100;$('throttle-value').innerHTML=`${throttle.value}<small>%</small>`;
    throttle.style.setProperty('--throttle',`${(Number(throttle.value)-25)/75*100}%`);
  };
  throttle.addEventListener('input',updateThrottle);updateThrottle();
  function switchCamera(){const mode=renderer.toggleCamera();message(mode==='chase'?'追蹤視角':'機首視角');}
  function reset(){
    flight=createFlight();throttle.value='65';updateThrottle();keys.clear();releaseStick();renderer.camera=null;
    $('end-screen').hidden=true;$('flight-status').textContent='飛行中';lastTime=0;message('已重新起飛，祝你飛行愉快');
  }
  $('camera-button').addEventListener('click',switchCamera);
  $('reset-button').addEventListener('click',reset);
  $('restart-button').addEventListener('click',reset);
  const flightKeys=new Set(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d']);
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();const interactive=e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if(interactive)return;
    if(flightKeys.has(key)){e.preventDefault();keys.add(key);}
    else if(key==='v'&&!e.repeat)switchCamera();
    else if(key==='r'&&!e.repeat)reset();
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();releaseStick();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();releaseStick();}lastTime=0;});
  window.addEventListener('resize',drawStick);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error-screen').hidden=false;});
  const keyAxis=(positive,negative)=>(positive.some(k=>keys.has(k))?1:0)-(negative.some(k=>keys.has(k))?1:0);
  function updateReadouts(){
    const speed=Math.round(flight.speed*3.6),altitude=Math.max(0,Math.round(flight.y));
    const heading=(Math.round(flight.yaw*180/Math.PI)+360)%360;
    $('speed').textContent=speed;$('altitude').textContent=altitude;$('heading').textContent=`${String(heading).padStart(3,'0')}°`;
    $('direction').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];
    $('speed-meter').style.width=`${clamp(speed/850*100,0,100)}%`;$('altitude-meter').style.width=`${clamp(altitude/2500*100,0,100)}%`;
  }
  function frame(now){
    const dt=lastTime?Math.min((now-lastTime)/1000,.25):0;lastTime=now;
    const input={x:clamp(stick.x+keyAxis(['d','arrowright'],['a','arrowleft']),-1,1),y:clamp(stick.y+keyAxis(['w','arrowup'],['s','arrowdown']),-1,1)};
    const wasFlying=!flight.crashed;
    // Substeps preserve elapsed-time motion on slower devices and avoid skipping collisions.
    for(let remaining=dt;remaining>0;){const step=Math.min(remaining,.025);updateFlight(flight,input,step);remaining-=step;}
    if(wasFlying&&flight.crashed){keys.clear();releaseStick();$('flight-status').textContent='飛行結束';$('end-screen').hidden=false;}
    renderer.render(flight,dt,now/1000);updateReadouts();requestAnimationFrame(frame);
  }
  message('向上推搖桿抬高機頭，左右推動即可轉彎',5500);
  requestAnimationFrame(frame);
}
