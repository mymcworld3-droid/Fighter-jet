import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight} from '../src/flight.js';
import {impactResponse,applyImpact} from '../src/impact.js';
import {attractionHit,WHEEL} from '../src/attractions.js';
import {createCrashEffect,updateCrashEffect} from '../src/crash-effects.js';
import {createEffects,registerImpact,updateEffects} from '../src/effects.js';

test('ride collision reports a real contact location, normal and affected part',()=>{
  const a={...createFlight(),x:WHEEL.x,y:WHEEL.y+WHEEL.radius+4,z:WHEEL.z+90},b={...a,z:WHEEL.z-90};
  const hit=attractionHit(a,b,0,.025);
  assert(hit&&hit.part&&hit.fraction>=0&&hit.fraction<=1);
  assert(hit.point.every(Number.isFinite));assert(Math.abs(Math.hypot(...hit.normal)-1)<1e-8);
});

test('the same impact changes rotation and damage according to the contact point',()=>{
  const plane={...createFlight(),x:0,y:100,z:0,speed:200};
  const nose=impactResponse(plane,{point:[0,100,-20],normal:[0,0,1],part:'nose'});
  const wing=impactResponse(plane,{point:[-15,100,6],normal:[0,0,1],part:'left'});
  assert(nose.fatal&&!wing.fatal);assert(Math.hypot(...wing.angularVelocity)>1);assert(Math.hypot(...nose.angularVelocity)<1e-9);
  assert.notDeepEqual(nose.postVelocity,wing.postVelocity);
});

test('a glancing impact causes damage and deflection without immediate destruction',()=>{
  const plane={...createFlight(),x:0,y:100,z:0,speed:100};
  const response=applyImpact(plane,{point:[-14,100,7],normal:[Math.sqrt(.75),0,.5],part:'left'});
  assert(!response.fatal&&!plane.crashed);assert(plane.damage>0&&plane.damage<1);assert.equal(plane.damagePart,'left');
  assert(Math.abs(plane.yaw)>1e-4||Math.abs(plane.impactYawRate)>1e-4);
});

test('wreckage retains impact velocity, depends on hit position, and explodes later',()=>{
  const plane={...createFlight(),x:0,y:500,z:0,speed:200};
  const hit={point:[-15,500,6],normal:[0,0,1],part:'left'},response=impactResponse(plane,hit),crash=createCrashEffect(plane,response);
  const meanForward=-crash.pieces.reduce((sum,p)=>sum+p.vz,0)/crash.pieces.length;
  assert(meanForward>100);assert(crash.explodeAt>=1);
  const other=createCrashEffect(plane,impactResponse(plane,{...hit,point:[15,500,6],part:'right'}));
  assert.notDeepEqual(crash.pieces.map(p=>p.spin),other.pieces.map(p=>p.spin));
  for(let i=0;i<20;i++)updateCrashEffect(crash,.025,()=>0);
  assert(crash.age<crash.explodeAt);assert(crash.pieces[1].z<plane.z-30);
});

test('a surviving damaged aircraft emits smoke and a brief contact flash',()=>{
  const effects=createEffects(),plane={...createFlight(),damage:.4,damagePart:'left',speed:100};
  registerImpact(effects,{point:[0,100,0]});
  for(let i=0;i<8;i++)updateEffects(effects,plane,false,.025);
  assert(effects.damageSmoke.length>0);assert(effects.damageSmoke[0].x<plane.x);assert(effects.impacts.length>0);
  for(let i=0;i<10;i++)updateEffects(effects,plane,false,.025);
  assert.equal(effects.impacts.length,0);
});
