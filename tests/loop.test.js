import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, updateFlight, flightHeading, terrainMeshHeight, WEBGL_TERRAIN_STEPS } from '../src/flight.js';
import { aircraftMatrix, flightCameraBasis, lookAt, transformPoint, wrapAngle } from '../src/math.js';
import { attractionHit } from '../src/attractions.js';
import { applyImpact } from '../src/impact.js';
import { MultiplayerClient } from '../src/multiplayer.js';
import { cameraDamping, cameraFov, chaseCameraOffset } from '../src/speed-effects.js';
import { keepCameraAboveSea, horizonLine } from '../src/ocean.js';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);

test('holding up from the normal start flies a full vertical loop',()=>{
  const plane=createFlight(),ground=(x,z)=>terrainMeshHeight(x,z,WEBGL_TERRAIN_STEPS);
  let rotation=0,maxHeight=plane.y,inverted=false;
  for(let i=0;i<800&&rotation<2*Math.PI;i++){
    const previous={...plane};
    updateFlight(plane,{x:0,y:1},.025,ground);
    rotation+=wrapAngle(plane.pitch-previous.pitch);
    maxHeight=Math.max(maxHeight,plane.y);
    if(Math.cos(plane.pitch)<-.95){
      inverted=true;
      assert(Math.abs(flightHeading(plane)-Math.PI)<.01,'the heading reflects reverse horizontal travel');
    }
    assert.equal(attractionHit(previous,plane,i*.025,.025),null);
    assert(!plane.crashed,'the normal starting altitude is enough for this loop');
  }
  assert(rotation>=2*Math.PI);assert(inverted);
  assert(maxHeight>plane.y+500,'the aircraft climbed and descended');
  assert(Math.abs(plane.pitch)<.03,'the nose returned to level');
  assert(Math.abs(flightHeading(plane))<.01);
});

test('both camera modes keep a continuous orthonormal view through a loop',()=>{
  for(const chase of [true,false]){
    let previous=null;
    for(let degree=0;degree<=360;degree++){
      const plane={...createFlight(),x:23,y:1800,z:7,yaw:.7,pitch:degree*Math.PI/180,roll:.5};
      const model=aircraftMatrix(plane);
      const eye=transformPoint(model,chase?[0,19,72]:[0,3,-11]);
      const target=transformPoint(model,chase?[0,2,-28]:[0,2,-150]);
      const basis=flightCameraBasis(eye,target,plane,chase);
      for(const v of [basis.right,basis.up,basis.backwards])assert(Math.abs(Math.hypot(...v)-1)<1e-6);
      assert(Math.abs(dot(basis.right,basis.up))<1e-6);
      assert(Math.abs(dot(basis.up,basis.backwards))<1e-6);
      assert(lookAt(eye,target,basis.up).every(Number.isFinite));
      if(previous)assert(dot(previous,basis.up)>.99,'the camera does not flip at vertical');
      previous=basis.up;
      if(degree===180)assert(basis.up[1]<-.85,'the view is inverted over the top');
    }
  }
});

test('the moving chase camera keeps the jet in frame throughout a loop',()=>{
  const plane=createFlight(),dt=.025;let camera=null,previousUp=null,rotation=0;
  for(let i=0;i<800&&rotation<2*Math.PI;i++){
    const oldPitch=plane.pitch;updateFlight(plane,{x:0,y:1},dt,()=>0);rotation+=wrapAngle(plane.pitch-oldPitch);
    const model=aircraftMatrix(plane),desired=keepCameraAboveSea(transformPoint(model,chaseCameraOffset(plane.speed)));
    const target=transformPoint(model,[0,2,-28]);
    if(!camera)camera=desired.slice();
    const smoothing=cameraDamping(dt,plane.speed,true);
    for(let j=0;j<3;j++)camera[j]+=(desired[j]-camera[j])*smoothing;
    keepCameraAboveSea(camera);
    const {right,up,backwards}=flightCameraBasis(camera,target,plane,true);
    if(previousUp)assert(dot(previousUp,up)>.99,'the camera orientation remains continuous');
    previousUp=up;
    const relative=[plane.x-camera[0],plane.y-camera[1],plane.z-camera[2]],depth=-dot(relative,backwards);
    const tangent=Math.tan(cameraFov(plane.speed,false)*Math.PI/360);
    assert(depth>0&&Math.abs(dot(relative,right)/depth)<tangent*16/9&&Math.abs(dot(relative,up)/depth)<tangent,'the jet remains visible');
    assert(Object.values(horizonLine(right,up,backwards,1600,900,900/(2*tangent))).every(Number.isFinite));
  }
  assert(rotation>=2*Math.PI);
});

test('a surviving inverted glancing impact preserves inverted flight',()=>{
  const plane={...createFlight(),y:2000,pitch:Math.PI,speed:160};
  const response=applyImpact(plane,{point:[plane.x,plane.y,plane.z],normal:[Math.sqrt(.96),0,-.2],part:'body'});
  assert(!response.fatal);assert(Math.cos(plane.pitch)<-.99);
  const model=aircraftMatrix(plane),speed=Math.hypot(...response.postVelocity);
  for(let i=0;i<3;i++)assert(Math.abs(-model[8+i]-response.postVelocity[i]/speed)<1e-6);
});

test('a remote aircraft interpolates smoothly across the inverted angle boundary',()=>{
  const client=new MultiplayerClient({getState:()=>createFlight()});
  const initial={...createFlight(),pitch:Math.PI-.02,firing:false,shotsFired:0};
  const peer={id:'pilot',name:'Pilot',state:initial};
  client.accept([peer]);client.accept([{...peer,state:{...initial,pitch:-Math.PI+.02}}]);client.advance(.1);
  assert(Math.cos(client.peers()[0].flight.pitch)<-.99,'the peer stays inverted instead of spinning through level');
});

test('an inverted plane cannot land wheels-down on level ground',()=>{
  const plane={...createFlight(),y:34.95,pitch:Math.PI,gearDown:true,gearPosition:1};
  updateFlight(plane,{x:0,y:0},.05,()=>27);
  assert(plane.crashed);assert(!plane.onGround);assert.equal(plane.crashReason,'landing');
});
