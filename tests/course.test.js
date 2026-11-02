import test from 'node:test';
import assert from 'node:assert/strict';
import {FLIGHT_GATES,crossedGate,updateCourse} from '../src/course.js';
import {createFlight,updateFlight,terrainHeight,terrainMeshHeight,PARK,TERRAIN_SIZE,CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS} from '../src/flight.js';

test('a swept crossing counts at speed, in either direction, but not outside the ring',()=>{
  const gate=FLIGHT_GATES[0],before={x:0,y:340,z:100},after={x:0,y:340,z:-800};
  assert(crossedGate(before,after,gate));assert(crossedGate(after,before,gate));
  assert(!crossedGate({...before,x:gate.radius+1},{...after,x:gate.radius+1},gate));
  assert(!crossedGate(before,{...before,z:0},gate));
});

test('each ring counts once even when crossed repeatedly, and multiple rings can be swept',()=>{
  const passed=new Set(),before={x:0,y:340,z:0},after={x:0,y:340,z:-4000};
  assert.equal(updateCourse(passed,before,after),FLIGHT_GATES.length);
  assert.equal(updateCourse(passed,after,before),0);
  passed.clear();assert.equal(updateCourse(passed,before,after),FLIGHT_GATES.length);
});

test('new terrain is solid and the park base agrees with the height model',()=>{
  assert.equal(terrainHeight(PARK.x,PARK.z),PARK.ground);
  for(const [x,z] of [[-5900,-5900],[5800,-5500],[-5900,5500],[500,6800]])assert(terrainHeight(x,z)>0);
  const flight=createFlight();flight.x=5800;flight.z=-5500;flight.y=terrainHeight(flight.x,flight.z)+6;
  updateFlight(flight,{x:0,y:0},.001);assert(flight.crashed);
});

test('collision height follows both triangles of each rendered terrain mesh',()=>{
  for(const steps of [CANVAS_TERRAIN_STEPS,WEBGL_TERRAIN_STEPS]){
    const size=TERRAIN_SIZE/steps,half=TERRAIN_SIZE/2,ix=Math.floor((5800+half)/size),iz=Math.floor((-5500+half)/size);
    const x=-half+ix*size,z=-half+iz*size;
    const a=terrainHeight(x,z),b=terrainHeight(x,z+size),c=terrainHeight(x+size,z+size),d=terrainHeight(x+size,z);
    assert(Math.abs(terrainMeshHeight(x+.2*size,z+.8*size,steps)-(a*.2+b*.6+c*.2))<1e-8);
    assert(Math.abs(terrainMeshHeight(x+.8*size,z+.2*size,steps)-(a*.2+c*.2+d*.6))<1e-8);
    assert.equal(terrainMeshHeight(10000,0,steps),0);
  }
});

test('a level flight can encounter the full initial course without hitting terrain',()=>{
  for(const ground of [terrainHeight,(x,z)=>terrainMeshHeight(x,z,CANVAS_TERRAIN_STEPS),(x,z)=>terrainMeshHeight(x,z,WEBGL_TERRAIN_STEPS)]){
    const s=createFlight(),passed=new Set();
    for(let i=0;i<2000 && passed.size<FLIGHT_GATES.length;i++){
      const before={...s};updateFlight(s,{x:0,y:0},.02,ground);assert(!s.crashed);updateCourse(passed,before,s);
    }
    assert.equal(passed.size,FLIGHT_GATES.length);
  }
});
