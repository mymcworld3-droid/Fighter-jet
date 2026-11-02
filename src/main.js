import { clamp, createFlight, terrainHeight, updateFlight } from './flight.js';
import { bindPointerControl, leverValue } from './controls.js';
import { createEffects, updateEffects } from './effects.js';
import { FlightRenderer, SoftwareFlightRenderer } from './renderer.js';
import { SpeedLines, SpeedWarp } from './speed-effects.js';
import { MultiplayerClient, createRoomCode, validRoomCode } from './multiplayer.js';

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
  const labels=new Map(),dots=new Map(),roomModal=$('multiplayer-modal');
  function spawnNear(other){
    const yaw=other.yaw;
    flight.x=clamp(other.x-Math.sin(yaw)*180+Math.cos(yaw)*70,-9999900,9999900);
    flight.z=clamp(other.z+Math.cos(yaw)*180+Math.sin(yaw)*70,-9999900,9999900);
    flight.y=Math.min(8000,Math.max(other.y+20,terrainHeight(flight.x,flight.z)+60));
    flight.yaw=yaw;flight.pitch=other.pitch;flight.roll=0;flight.speed=other.speed;flight.crashed=false;renderer.camera=null;
  }
  const roomStatus=status=>{
    const online=status.kind==='online'||status.kind==='reconnecting';
    $('room-setup').hidden=online;$('room-active').hidden=!online;surface.classList.toggle('has-room',online);
    $('wingman-radar').hidden=!online;$('multiplayer-button').classList.toggle('online',status.kind==='online');
    $('multiplayer-label').textContent=online?'房間 '+status.room:'多人連線';
    if(online){
      $('room-code-display').textContent=status.room;
      $('room-count').textContent=status.kind==='online'?`已連線 · ${status.count} / 8 人`:'連線中斷，正在重新連線…';
      const link=new URL(location.href);link.searchParams.set('room',status.room);link.hash='';$('room-link').value=link.href;
    }
    if(status.kind==='expired'){$('room-message').textContent='房間已失效，請重新建立或加入。';message('房間已失效，請重新建立或加入');}
  };
  const multiplayer=new MultiplayerClient({
    getState:()=>({x:flight.x,y:flight.y,z:flight.z,yaw:flight.yaw,pitch:flight.pitch,roll:flight.roll,speed:flight.speed,throttle:flight.throttle,firing:fireControl.active()||keys.has(' '),shotsFired:effects.shotsFired,crashed:flight.crashed}),
    onStatus:roomStatus,onSpawn:spawnNear
  });
  const errorMessages={invalid_room:'請輸入正確的 6 位房間代碼。',room_not_found:'找不到房間，請確認代碼或請房主重新建立。',room_full:'房間已滿，目前最多 8 人。',room_exists:'房間代碼已使用，請再試一次。',invalid_session:'連線已失效，請重新加入房間。',server_unavailable:'無法連接多人伺服器，請稍後再試。'};
  const setRoomBusy=busy=>{$('create-room').disabled=busy;$('join-room').disabled=busy;};
  async function connectRoom(action){
    const name=$('pilot-name').value.trim()||'飛行員';let room=action==='create'?createRoomCode():$('room-code-input').value.toUpperCase().trim();
    if(!validRoomCode(room)){$('room-message').textContent=errorMessages.invalid_room;return;}
    setRoomBusy(true);$('room-message').textContent='正在連線…';
    try {
      for(let attempt=0;;attempt++){
        try{await multiplayer.connect(room,name,action);break;}
        catch(error){if(action==='create'&&error.message==='room_exists'&&attempt<3){room=createRoomCode();continue;}throw error;}
      }
      $('room-message').textContent=action==='create'?'把房間代碼或邀請連結傳給朋友。':'已加入房間，現在可以與其他飛行員一起飛行。';
      try{localStorage.setItem('skyward-pilot-name',name);}catch{}
    }catch(error){$('room-message').textContent=errorMessages[error.message]||errorMessages.server_unavailable;}
    finally{setRoomBusy(false);}
  }
  $('multiplayer-button').addEventListener('click',()=>{roomModal.hidden=false;$('room-message').textContent='';});
  $('room-close').addEventListener('click',()=>{roomModal.hidden=true;});
  roomModal.addEventListener('click',e=>{if(e.target===roomModal)roomModal.hidden=true;});
  $('create-room').addEventListener('click',()=>connectRoom('create'));
  $('join-room').addEventListener('click',()=>connectRoom('join'));
  $('room-code-input').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,6);});
  $('leave-room').addEventListener('click',()=>{multiplayer.leave();$('room-message').textContent='已離開房間。';});
  $('copy-room').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('room-link').value);$('room-message').textContent='邀請連結已複製。';}catch{$('room-link').select();$('room-message').textContent='請複製上方的邀請連結。';}});
  try{$('pilot-name').value=localStorage.getItem('skyward-pilot-name')||'';}catch{}
  const invite=new URL(location.href).searchParams.get('room')?.toUpperCase();
  if(invite&&validRoomCode(invite)){$('room-code-input').value=invite;roomModal.hidden=false;$('room-message').textContent='輸入名稱後按「加入」。';}
  window.addEventListener('pagehide',()=>multiplayer.leave());
  function updateWingmen(peers){
    const ids=new Set();
    for(const peer of peers){
      ids.add(peer.id);let label=labels.get(peer.id),dot=dots.get(peer.id);
      if(!label){label=document.createElement('div');label.className='remote-label';$('remote-labels').appendChild(label);labels.set(peer.id,label);}
      if(!dot){dot=document.createElement('i');dot.className='radar-dot';$('radar-dots').appendChild(dot);dots.set(peer.id,dot);}
      const other=peer.flight,dx=other.x-flight.x,dz=other.z-flight.z,distance=Math.hypot(dx,other.y-flight.y,dz);
      const point=renderer.projectPoint([other.x,other.y+10,other.z]);
      label.hidden=!point;if(point){label.style.left=`${point.x}px`;label.style.top=`${point.y}px`;label.textContent=`${peer.name} · ${Math.round(distance)} m`;}
      const right=dx*Math.cos(flight.yaw)+dz*Math.sin(flight.yaw),forward=dx*Math.sin(flight.yaw)-dz*Math.cos(flight.yaw),scale=Math.max(2000,Math.hypot(right,forward));
      dot.style.left=`${50+right/scale*42}%`;dot.style.top=`${50-forward/scale*42}%`;
    }
    for(const [id,el] of labels)if(!ids.has(id)){el.remove();labels.delete(id);}
    for(const [id,el] of dots)if(!ids.has(id)){el.remove();dots.delete(id);}
  }
  function switchCamera(){const mode=renderer.toggleCamera();message(mode==='chase'?'追蹤視角':'機首視角');}
  function reset(){
    keys.clear();stickControl.cancel();leverControl.cancel();fireControl.cancel();releaseStick();
    flight=createFlight();effects=createEffects();pendingShot=false;setThrottle(65);updateFireButton();renderer.camera=null;
    if(multiplayer.peers().length)spawnNear(multiplayer.peers()[0].flight);
    $('end-screen').hidden=true;$('flight-status').textContent='飛行中';lastTime=0;message('已重新起飛，祝你飛行愉快');
  }
  $('camera-button').addEventListener('click',switchCamera);
  $('reset-button').addEventListener('click',reset);
  $('restart-button').addEventListener('click',reset);
  const flightKeys=new Set(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d']);
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();const interactive=e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if(!roomModal.hidden){if(key==='escape')roomModal.hidden=true;return;}
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
    multiplayer.advance(dt);const peers=multiplayer.peers();
    renderer.render(flight,dt,now/1000,effects,peers);updateWingmen(peers);
    speedWarp.render(now/1000,flight.crashed?0:flight.speed);speedLines.render(dt,flight.crashed?0:flight.speed);
    updateReadouts();requestAnimationFrame(frame);
  }
  message('左手駕駛，右手調整推力或按住射擊',5500);
  requestAnimationFrame(frame);
}
