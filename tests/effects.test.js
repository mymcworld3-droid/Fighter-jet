import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight } from '../src/flight.js';
import { createEffects, updateEffects } from '../src/effects.js';

test('gun fires in the aircraft heading and retains its trajectory when the plane turns',()=>{
  const plane=createFlight(),effects=createEffects();plane.yaw=Math.PI/2;
  updateEffects(effects,plane,true,.025);
  assert.equal(effects.bullets.length,1);const bullet=effects.bullets[0];
  assert(bullet.vx>900 && Math.abs(bullet.vz)<1e-6);
  const oldVx=bullet.vx;plane.yaw=0;updateEffects(effects,plane,false,.025);
  assert.equal(bullet.vx,oldVx);assert(bullet.x>plane.x);
});
test('holding fire repeats shots; released shots and exhaust expire',()=>{
  const plane=createFlight(),effects=createEffects();
  for(let i=0;i<40;i++)updateEffects(effects,plane,true,.025);
  assert(effects.bullets.length>=8 && effects.bullets.length<=11);assert(effects.exhaust.length>0);
  plane.crashed=true;
  for(let i=0;i<80;i++)updateEffects(effects,plane,false,.025);
  assert.equal(effects.bullets.length,0);assert.equal(effects.exhaust.length,0);
});
