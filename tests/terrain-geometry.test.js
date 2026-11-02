import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainOutsideRectangle} from '../src/terrain-geometry.js';

test('runway cutout preserves terrain outside the rectangle and removes its interior',()=>{
  const vertex=(x,z)=>({position:[x,27,z],color:[x/10,.5,z/10]});
  const triangle=[vertex(0,0),vertex(0,10),vertex(10,0)];
  const pieces=terrainOutsideRectangle(triangle,{xMin:2,xMax:4,zMin:2,zMax:4});
  const area=p=>Math.abs(p.reduce((sum,v,i)=>sum+v.position[0]*p[(i+1)%p.length].position[2]-p[(i+1)%p.length].position[0]*v.position[2],0))/2;
  assert(Math.abs(pieces.reduce((sum,p)=>sum+area(p),0)-46)<1e-8);
  for(const p of pieces){
    const center=p.reduce((acc,v)=>[acc[0]+v.position[0]/p.length,acc[1]+v.position[2]/p.length],[0,0]);
    assert(!(center[0]>2&&center[0]<4&&center[1]>2&&center[1]<4));
    for(const v of p){assert(Math.abs(v.color[0]-v.position[0]/10)<1e-8);assert(Math.abs(v.color[2]-v.position[2]/10)<1e-8);}
  }
});
