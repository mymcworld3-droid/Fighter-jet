import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFov, speedIntensity, chaseCameraOffset, cameraDamping, SpeedWarp } from '../src/speed-effects.js';
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
test('chase camera moves farther behind the jet as actual speed increases',()=>{
  const slow=chaseCameraOffset(155),medium=chaseCameraOffset(220),fast=chaseCameraOffset(305);
  assert(slow[2]<medium[2] && medium[2]<fast[2]);
  assert(Math.hypot(...slow)<Math.hypot(...medium) && Math.hypot(...medium)<Math.hypot(...fast));
  assert(cameraDamping(1/60,305)<cameraDamping(1/60,155));
});
test('camera easing is consistent across common frame rates',()=>{
  const converge=rate=>{let position=0;for(let i=0;i<rate;i++)position+=(100-position)*cameraDamping(1/rate,250);return position;};
  assert(Math.abs(converge(30)-converge(60))<1e-10);
  assert(Math.abs(converge(2)-converge(60))<1e-10);
});
test('speed warp copies only the scene at speed and clears when stopped',()=>{
  const originalWindow=globalThis.window;globalThis.window={devicePixelRatio:1};
  try {
    const calls=[],ctx={clearRect(){calls.push('clear')},save(){},restore(){},drawImage(source,...args){calls.push({source,args})},createRadialGradient(){return{addColorStop(){}}},createLinearGradient(){calls.push('horizon-mask');return{addColorStop(){}}},fillRect(){}};
    const canvas={width:0,height:0,clientWidth:640,clientHeight:360,getContext(){return ctx;}},scene={width:640,height:360};
    const warp=new SpeedWarp(canvas,scene);
    warp.render(1,120);assert.equal(calls.filter(x=>typeof x==='object').length,0);
    warp.render(2,305,{a:0,b:-1,c:.5});const images=calls.filter(x=>typeof x==='object');assert.equal(images.length,3);assert(images.every(x=>x.source===scene));assert(calls.includes('horizon-mask'));
    const clears=calls.filter(x=>x==='clear').length;warp.render(3,0);assert.equal(calls.filter(x=>x==='clear').length,clears+1);
  } finally {if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
});
