import { clamp } from './flight.js';
import { createEffects, updateEffects } from './effects.js';
import { createCrashEffect, updateCrashEffect } from './crash-effects.js';

const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomHex=bytes=>{const a=new Uint8Array(bytes);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');};
export function createRoomCode(){const a=new Uint8Array(6);crypto.getRandomValues(a);return Array.from(a,x=>LETTERS[x%LETTERS.length]).join('');}
export const validRoomCode=value=>/^[A-HJ-NP-Z2-9]{6}$/.test(value);
const now=()=>performance.now();
const turn=(a,b,k)=>{const delta=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return (a+delta*k+Math.PI*2)%(Math.PI*2);};

export class MultiplayerClient {
  constructor({getState,onStatus=()=>{},onSpawn=()=>{},fetcher=(...args)=>globalThis.fetch(...args)}){
    this.getState=getState;this.onStatus=onStatus;this.onSpawn=onSpawn;this.fetcher=fetcher;
    this.players=new Map();this.running=false;this.generation=0;this.timer=null;this.abort=null;
  }
  async connect(room,name,action){
    this.leave(false);room=room.toUpperCase().trim();
    if(!validRoomCode(room))throw new Error('invalid_room');
    this.room=room;this.name=Array.from(name.trim()).slice(0,14).join('')||'飛行員';
    this.id=randomHex(16);this.token=randomHex(32);this.running=true;const generation=++this.generation;
    this.onStatus({kind:'connecting',room});
    try{
      const data=await this.request(action);
      if(!this.running||generation!==this.generation)return;
      this.accept(data.peers);
      if(action==='join'&&data.peers.length)this.onSpawn(data.peers[0].state);
      this.onStatus({kind:'online',room,count:this.players.size+1});
      this.schedule(generation,200);
    }catch(error){if(generation===this.generation){this.running=false;this.onStatus({kind:'offline'});}throw error;}
  }
  async request(action){
    const controller=new AbortController();this.abort=controller;const timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await this.fetcher('/api/multiplayer',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({action,room:this.room,id:this.id,token:this.token,name:this.name,state:this.getState()})});
      let data;try{data=await response.json();}catch{throw new Error('server_unavailable');}
      if(!response.ok||!data.ok)throw new Error(data.error||'server_unavailable');
      if(!Array.isArray(data.peers))throw new Error('server_unavailable');
      return data;
    } finally {clearTimeout(timeout);if(this.abort===controller)this.abort=null;}
  }
  schedule(generation,delay){clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(generation),delay);}
  async tick(generation){
    if(!this.running||generation!==this.generation)return;
    try{
      const data=await this.request('sync');if(!this.running||generation!==this.generation)return;
      this.accept(data.peers);this.onStatus({kind:'online',room:this.room,count:this.players.size+1});this.schedule(generation,250);
    }catch(error){
      if(!this.running||generation!==this.generation)return;
      if(error.message==='invalid_session'){
        try{
          const data=await this.request('join');if(!this.running||generation!==this.generation)return;
          this.accept(data.peers);this.onStatus({kind:'online',room:this.room,count:this.players.size+1});this.schedule(generation,250);return;
        }catch(rejoinError){
          if(!this.running||generation!==this.generation)return;
          if(rejoinError.message==='room_not_found'){this.running=false;this.players.clear();this.onStatus({kind:'expired'});return;}
        }
      }
      this.onStatus({kind:'reconnecting',room:this.room});this.schedule(generation,1200);
    }
  }
  accept(peers){
    const seen=new Set(),timestamp=now();
    for(const p of peers){
      if(!p||typeof p.id!=='string'||!p.state)continue;seen.add(p.id);
      let player=this.players.get(p.id);
      if(!player){player={id:p.id,name:p.name,flight:{...p.state,gearPosition:p.state.gearDown?1:0},target:p.state,effects:createEffects(),crash:p.state.crashed?createCrashEffect(p.state,p.state.crashImpact):null,shots:p.state.shotsFired,queuedShot:false,received:timestamp};this.players.set(p.id,player);}
      else {
        if(p.state.shotsFired>player.shots&&!p.state.firing)player.queuedShot=true;
        player.shots=p.state.shotsFired;player.target=p.state;player.name=p.name;player.received=timestamp;
      }
    }
    for(const id of this.players.keys())if(!seen.has(id))this.players.delete(id);
  }
  advance(dt,groundHeight=()=>0){
    const timestamp=now(),stepTime=clamp(dt,0,.25);
    for(const [id,p] of this.players){
      const age=(timestamp-p.received)/1000;if(age>12){this.players.delete(id);continue;}
      const s=p.flight,t=p.target,prediction=t.crashed?0:clamp(age,0,.45),horizontal=Math.cos(t.pitch)*t.speed*prediction;
      if(t.crashed&&!s.crashed)p.crash=createCrashEffect(t,t.crashImpact);
      else if(!t.crashed&&s.crashed)p.crash=null;
      const target={x:t.x+Math.sin(t.yaw)*horizontal,y:t.onGround?t.y:t.y+Math.sin(t.pitch)*t.speed*prediction,z:t.z-Math.cos(t.yaw)*horizontal};
      const k=1-Math.exp(-7*stepTime);
      for(const key of ['x','y','z'])s[key]+=(target[key]-s[key])*k;
      s.yaw=turn(s.yaw,t.yaw,k);s.pitch+=(t.pitch-s.pitch)*k;s.roll+=(t.roll-s.roll)*k;
      s.speed=t.speed;s.throttle=t.throttle;s.crashed=t.crashed;s.gearDown=!!t.gearDown;s.onGround=!!t.onGround;s.damage=t.damage||0;s.damagePart=t.damagePart||null;s.damageParts=t.damageParts||null;
      s.gearPosition=clamp((s.gearPosition||0)+clamp((s.gearDown?1:0)-(s.gearPosition||0),-stepTime,stepTime),0,1);
      const firing=(age<1.5&&t.firing)||p.queuedShot;
      for(let left=stepTime;left>0;){const d=Math.min(left,.025);updateEffects(p.effects,s,firing,d);if(p.crash)updateCrashEffect(p.crash,d,groundHeight);left-=d;}
      if(stepTime>0)p.queuedShot=false;
    }
  }
  peers(){return [...this.players.values()];}
  leave(notify=true){
    const room=this.room,id=this.id,token=this.token;
    this.running=false;this.generation++;clearTimeout(this.timer);this.abort?.abort();this.abort=null;this.players.clear();
    this.room=null;this.id=null;this.token=null;
    if(notify&&room&&id&&token)this.fetcher('/api/multiplayer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'leave',room,id,token}),keepalive:true}).catch(()=>{});
    this.onStatus({kind:'offline'});
  }
}
