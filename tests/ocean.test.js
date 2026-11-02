import test from 'node:test';
import assert from 'node:assert/strict';
import { SEA_LEVEL, LAND_CLEARANCE, keepCameraAboveSea, clipTerrainAboveSea, oceanScreenGeometry } from '../src/ocean.js';

const vertex=(x,y,z,color=[.2,.5,.4])=>({position:[x,y,z],color});
test('submerged land is removed and coast intersections stay above the water',()=>{
  assert.equal(clipTerrainAboveSea([vertex(0,-2,0),vertex(1,-4,0),vertex(0,-3,1)]).length,0);
  const polygon=clipTerrainAboveSea([vertex(0,-1,0,[0,0,0]),vertex(4,3,0,[1,1,1]),vertex(0,3,4,[1,1,1])]);
  assert.equal(polygon.length,4);
  assert(polygon.every(v=>v.position[1]>=SEA_LEVEL+LAND_CLEARANCE-1e-10));
  const shoreline=polygon.filter(v=>Math.abs(v.position[1]-SEA_LEVEL-LAND_CLEARANCE)<1e-9);
  assert.equal(shoreline.length,2);assert(shoreline.every(v=>v.color[0]>0&&v.color[0]<1));
});
test('shoreline clipping does not produce duplicate vertices on the waterline',()=>{
  const p=clipTerrainAboveSea([vertex(0,LAND_CLEARANCE,0),vertex(1,-1,0),vertex(0,2,1)]);
  assert.equal(p.length,3);
  assert.equal(new Set(p.map(v=>v.position.join(','))).size,3);
});
test('ocean covers the correct side of a level and steeply banked horizon',()=>{
  const input={width:1000,height:600,focal:500,eyeY:100,backwards:[0,0,1]};
  const level=oceanScreenGeometry({...input,right:[1,0,0],up:[0,1,0]});
  assert(level.points.length>=3);assert(level.points.every(([,y])=>y>=300-1e-8));
  const banked=oceanScreenGeometry({...input,right:[0,1,0],up:[-1,0,0]});
  assert(banked.points.length>=3);assert(banked.points.every(([x])=>x<=500+1e-8));
});
test('ocean clipping handles looking directly down or up and keeps camera above water',()=>{
  const base={width:800,height:600,focal:500,eyeY:30,right:[1,0,0],up:[0,0,1]};
  assert.equal(oceanScreenGeometry({...base,backwards:[0,1,0]}).points.length,4);
  assert.equal(oceanScreenGeometry({...base,backwards:[0,-1,0]}).points.length,0);
  assert.deepEqual(keepCameraAboveSea([4,-10,9]),[4,3,9]);
});
