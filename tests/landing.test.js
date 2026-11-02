import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,setLandingGear,updateFlight,terrainMeshHeight,terrainMeshNormal,surfaceNormal,groundAttitude,relativeGroundAngles,groundClearance,CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS,TERRAIN_SIZE} from '../src/flight.js';

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

test('terrain-aligned aircraft can land on uphill and sideways slopes',()=>{
  const uphill=(x,z)=>100-.6*z;
  const noseUp=approach({x:0,z:0,y:100+groundClearance(surfaceNormal(uphill,0,0))+.05,speed:80,pitch:Math.atan(.6)-.02,roll:0});
  updateFlight(noseUp,{x:0,y:0},.05,uphill);
  assert(noseUp.pitch>.30);assert(noseUp.onGround&&!noseUp.crashed);

  const sideways=(x,z)=>100+.55*x;
  const banked=approach({x:0,z:0,y:100+groundClearance(surfaceNormal(sideways,0,0))+.05,pitch:-.06,roll:Math.atan(.55)});
  updateFlight(banked,{x:0,y:0},.05,sideways);
  assert(banked.roll>.35);assert(banked.onGround&&!banked.crashed);
});

test('level aircraft cannot land against a steep surface at an unsafe relative angle',()=>{
  const uphill=(x,z)=>100-.6*z;
  const plane=approach({x:0,z:0,y:100+groundClearance(surfaceNormal(uphill,0,0))+.05,speed:40,pitch:0,roll:0});
  updateFlight(plane,{x:0,y:0},.05,uphill);
  assert(plane.crashed);assert.equal(plane.crashReason,'landing');
});

test('grounded orientation follows the local slope and allows takeoff relative to it',()=>{
  const slope=(x,z)=>100+.3*x-.4*z,normal=surfaceNormal(slope,0,0);
  const plane=approach({x:0,z:0,y:108,speed:0,pitch:0,roll:0,yaw:1.1,onGround:true,groundTime:0});
  for(let i=0;i<250;i++)updateFlight(plane,{x:0,y:0},.02,slope);
  const relative=relativeGroundAngles(plane,normal);
  assert(Math.abs(relative.pitch)<1e-5&&Math.abs(relative.roll)<1e-5);
  assert(Math.abs(plane.y-(slope(plane.x,plane.z)+groundClearance(normal)))<1e-5);
  const target=groundAttitude(plane.yaw,normal);assert(Math.abs(plane.pitch-target.pitch)<1e-5);
  plane.throttle=1;
  for(let i=0;i<1000&&plane.onGround;i++)updateFlight(plane,{x:0,y:1},.02,slope);
  assert(!plane.onGround&&!plane.crashed);assert(plane.pitch-target.pitch>.05);
});

test('rendered triangle normals match their height gradients and the runway is level',()=>{
  for(const steps of [CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS]){
    const size=TERRAIN_SIZE/steps,half=TERRAIN_SIZE/2,ix=Math.floor((5800+half)/size),iz=Math.floor((-5500+half)/size);
    const left=-half+ix*size,near=-half+iz*size;
    for(const [u,v] of [[.2,.8],[.8,.2]]){
      const x=left+u*size,z=near+v*size,normal=terrainMeshNormal(x,z,steps),sampled=surfaceNormal((xx,zz)=>terrainMeshHeight(xx,zz,steps),x,z);
      for(let i=0;i<3;i++)assert(Math.abs(normal[i]-sampled[i])<1e-8);
    }
    assert.deepEqual(terrainMeshNormal(0,-500,steps),[-0,1,-0]);
  }
});
