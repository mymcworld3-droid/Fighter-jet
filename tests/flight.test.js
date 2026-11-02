import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, updateFlight, terrainHeight } from '../src/flight.js';
import { aircraftMatrix, transformPoint } from '../src/math.js';

function fly(input, seconds=1) { const s=createFlight(); for(let i=0;i<seconds*60;i++) updateFlight(s,input,1/60); return s; }
test('stick up raises the nose and gains altitude; down lowers both', () => {
  const up=fly({x:0,y:1}), down=fly({x:0,y:-1});
  assert(up.pitch>0 && up.y>340); assert(down.pitch<0 && down.y<340);
});
test('left and right turn in the requested direction and bank into the turn', () => {
  const left=fly({x:-1,y:0}), right=fly({x:1,y:0});
  assert(left.x<0 && left.roll>0); assert(right.x>0 && right.roll<0);
  assert(transformPoint(aircraftMatrix(left),[10,0,0])[1]>left.y);
  assert(transformPoint(aircraftMatrix(right),[10,0,0])[1]<right.y);
});
test('model nose follows simulated heading and pitch', () => {
  const s={...createFlight(),yaw:0.5,pitch:0.3,roll:0}; const nose=transformPoint(aircraftMatrix(s),[0,0,-10]);
  assert(nose[0]>s.x && nose[1]>s.y && nose[2]<s.z);
});
test('centering stick levels the bank without undoing heading', () => {
  const s=fly({x:1,y:0}); const heading=s.yaw;
  for(let i=0;i<120;i++) updateFlight(s,{x:0,y:0},1/60);
  assert(Math.abs(s.roll)<0.002); assert(Math.abs(s.yaw-heading)<1e-8);
});
test('throttle changes speed and collisions stop flight', () => {
  const slow=createFlight(), fast=createFlight(); slow.throttle=.25; fast.throttle=1;
  for(let i=0;i<600;i++){updateFlight(slow,{x:0,y:0},1/60);updateFlight(fast,{x:0,y:0},1/60);}
  assert(fast.speed>slow.speed);
  const s=createFlight(); s.y=Math.max(0,terrainHeight(s.x,s.z))+8; updateFlight(s,{x:0,y:0},1/60);
  assert(s.crashed); const before={...s}; updateFlight(s,{x:1,y:1},1/60); assert.deepEqual(s,before);
});
