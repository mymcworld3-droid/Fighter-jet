import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFov, speedIntensity } from '../src/speed-effects.js';
import { createFlight, updateFlight } from '../src/flight.js';

test('camera and motion effects follow actual speed and remain bounded',()=>{
  assert.equal(speedIntensity(0),0);assert.equal(speedIntensity(500),1);
  assert(speedIntensity(250)>speedIntensity(200));
  assert(cameraFov(300,false)>cameraFov(180,false));
  assert(cameraFov(300,true)>cameraFov(300,false));
});
test('maximum thrust produces a higher sustained flight speed',()=>{
  const plane=createFlight();plane.throttle=1;
  for(let i=0;i<1800;i++)updateFlight(plane,{x:0,y:0},1/60);
  assert(plane.speed>300 && plane.speed<306);
});
