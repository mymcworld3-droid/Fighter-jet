import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,setLandingGear,updateFlight,terrainMeshHeight,CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS} from '../src/flight.js';

const ground=()=>27;
const approach=(overrides={})=>({...createFlight(),x:0,z:-500,y:35.2,speed:100,throttle:.25,pitch:-.06,gearDown:true,gearPosition:1,...overrides});

test('lowering the gear takes time and a steady approach touches down',()=>{
  const plane={...createFlight(),y:1000};assert(setLandingGear(plane,true));
  for(let i=0;i<50;i++)updateFlight(plane,{x:0,y:0},.02,ground);
  assert(Math.abs(plane.gearPosition-1)<1e-9);
  const landing=approach();updateFlight(landing,{x:0,y:0},.05,ground);
  assert(landing.onGround);assert(!landing.crashed);assert.equal(landing.y,35);
  assert.equal(setLandingGear(landing,false),false);assert(landing.gearDown);
});

test('touchdown rejects raised or moving gear, excessive attitude, speed and sinking',()=>{
  for(const opts of [{gearDown:false,gearPosition:0},{gearPosition:.4},{roll:.8},{speed:190},{pitch:-.26,speed:145}]){
    const plane=approach(opts);plane.y=35.05;updateFlight(plane,{x:0,y:0},.05,ground);assert(plane.crashed,JSON.stringify(opts));assert(!plane.onGround);
  }
  const water=approach({y:8.1});updateFlight(water,{x:0,y:0},.05,()=>0);assert(water.crashed);assert.equal(water.crashReason,'water');
});

test('a landed plane rolls to a stop and can accelerate and take off again',()=>{
  const plane=approach();updateFlight(plane,{x:0,y:0},.05,ground);assert(plane.onGround);
  for(let i=0;i<2000;i++)updateFlight(plane,{x:0,y:0},.02,ground);
  assert(plane.onGround);assert.equal(plane.speed,0);assert.equal(plane.y,35);
  plane.throttle=1;
  for(let i=0;i<1000&&plane.onGround;i++)updateFlight(plane,{x:0,y:1},.02,ground);
  assert(!plane.onGround&&!plane.crashed);assert(plane.speed>=65);
  for(let i=0;i<50;i++)updateFlight(plane,{x:0,y:0},.02,ground);
  assert(!plane.crashed);assert(plane.y>35);
});

test('the collision surface includes the raised runway',()=>{
  for(const steps of [CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS]){
    const renderedGround=(x,z)=>terrainMeshHeight(x,z,steps),plane=approach({y:38.2});
    assert.equal(renderedGround(0,-500),30);updateFlight(plane,{x:0,y:0},.05,renderedGround);
    assert(plane.onGround);assert.equal(plane.y,38);
  }
});
