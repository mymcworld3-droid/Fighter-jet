import test from 'node:test';
import assert from 'node:assert/strict';
import {WHEEL,coasterTrack,attractionHit,segmentDistanceSquared} from '../src/attractions.js';
import {createFlight} from '../src/flight.js';
import {createCrashEffect,updateCrashEffect} from '../src/crash-effects.js';
import {MultiplayerClient} from '../src/multiplayer.js';

const sweep=(x,y,z)=>[{...createFlight(),x,y,z:z+90},{...createFlight(),x,y,z:z-90}];

test('swept aircraft collides with the wheel rim and coaster track at high speed',()=>{
  let [a,b]=sweep(WHEEL.x,WHEEL.y+WHEEL.radius+4,WHEEL.z);
  assert.equal(attractionHit(a,b,0,.025)?.kind,'wheel');
  const rail=coasterTrack(0);[a,b]=sweep(rail[0],rail[1]+9,rail[2]);
  assert.equal(attractionHit(a,b,0,.025)?.kind,'coaster');
  [a,b]=sweep(0,340,0);assert.equal(attractionHit(a,b,0,.025),null);
});

test('wheel spoke collision follows its rotation and keeps open gaps flyable',()=>{
  const [a,b]=sweep(WHEEL.x+100,WHEEL.y,WHEEL.z);
  assert.equal(attractionHit(a,b,0,.025)?.kind,'wheel');
  assert.equal(attractionHit(a,b,(Math.PI/12)/.12,.025),null);
});

test('segment distance handles parallel, crossing, and point contacts',()=>{
  assert.equal(segmentDistanceSquared([0,0,0],[10,0,0],[5,-2,0],[5,2,0]),0);
  assert.equal(segmentDistanceSquared([0,0,0],[10,0,0],[0,3,0],[10,3,0]),9);
  assert.equal(segmentDistanceSquared([0,0,0],[0,0,0],[3,4,0],[3,4,0]),25);
});

test('crash separates aircraft parts, creates smoke and sparks, and settles above ground',()=>{
  const crash=createCrashEffect({...createFlight(),y:100,speed:180}),before=crash.pieces.map(p=>[p.x,p.y,p.z]);
  for(let i=0;i<50;i++)updateCrashEffect(crash,.02,()=>0);
  assert.equal(crash.pieces.length,5);assert(crash.smoke.length>0);assert(crash.sparks.length<20);
  assert(crash.pieces.some((p,i)=>Math.hypot(p.x-before[i][0],p.y-before[i][1],p.z-before[i][2])>10));
  for(let i=0;i<300;i++)updateCrashEffect(crash,.02,()=>0);
  assert.equal(crash.smoke.length,0);assert.equal(crash.sparks.length,0);
  assert(crash.pieces.every(p=>p.y>=2&&[p.x,p.y,p.z,p.yaw,p.pitch,p.roll].every(Number.isFinite)));
});

test('multiplayer peers show a crash and clear it when the pilot restarts',()=>{
  const client=new MultiplayerClient({getState:()=>createFlight()}),state={...createFlight(),firing:false,shotsFired:0},peer={id:'pilot',name:'Pilot',state};
  client.accept([peer]);client.accept([{...peer,state:{...state,crashed:true}}]);client.advance(.1,()=>0);
  assert(client.peers()[0].crash);assert(client.peers()[0].flight.crashed);
  client.accept([peer]);client.advance(.1,()=>0);assert.equal(client.peers()[0].crash,null);
});
