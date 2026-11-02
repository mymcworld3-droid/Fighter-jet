import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, terrainHeight, updateFlight } from '../src/flight.js';
import { attractionHit } from '../src/attractions.js';
import { impactResponse } from '../src/impact.js';
import { TUNNELS, TUNNEL_SEGMENTS, TUNNEL_SIDES, tunnelCenter } from '../src/tunnels.js';

const state=(p,direction)=>({
  ...createFlight(),x:p[0],y:p[1],z:p[2],speed:240,
  yaw:Math.atan2(direction[0],-direction[2]),pitch:Math.atan2(direction[1],Math.hypot(direction[0],direction[2]))
});

test('three winding tunnels share their rendered rings, route and clear sky',()=>{
  assert.equal(TUNNELS.length,3);
  for(const tunnel of TUNNELS){
    assert.equal(tunnel.centers.length,TUNNEL_SEGMENTS+1);
    assert(tunnel.rings.every(ring=>ring.length===TUNNEL_SIDES));
    assert.deepEqual(tunnel.centers[0],tunnelCenter(tunnel,0));
    assert(Math.abs(tunnelCenter(tunnel,.25)[0]-tunnel.x)>250);
    assert(tunnel.centers.every(p=>p[1]-tunnel.radius>Math.max(0,terrainHeight(p[0],p[2]))+80));
  }
});

test('planes can enter either open end and fly along each tunnel centre',()=>{
  for(const tunnel of TUNNELS){
    for(const segment of tunnel.segments){
      const a=state(segment.a,segment.axis),b=state(segment.b,segment.axis);
      assert.equal(attractionHit(a,b),null,`${tunnel.name} centreline`);
    }
    for(const [index,sign] of [[0,1],[TUNNEL_SEGMENTS-1,-1]]){
      const seg=tunnel.segments[index],entrance=sign===1?seg.a:seg.b,dir=seg.axis.map(v=>v*sign);
      const point=d=>entrance.map((v,i)=>v+dir[i]*d);
      assert.equal(attractionHit(state(point(-100),dir),state(point(100),dir)),null,`${tunnel.name} entrance`);
    }
  }
});

test('a high-speed sweep into a tunnel wall produces a physical impact',()=>{
  const tunnel=TUNNELS[0],segment=tunnel.segments[12],middle=segment.a.map((v,i)=>(v+segment.b[i])/2),dir=[1,0,0];
  const start=state(middle,dir),end={...start,x:start.x+240};
  const hit=attractionHit(start,end);
  assert(hit);assert.equal(hit.kind,'tunnel');assert(hit.fraction>0&&hit.fraction<1);assert(hit.normal[0]<-.5);
  assert(impactResponse(start,hit).normalSpeed>100);
});

test('a plane entering from outside hits the wall rather than passing through it',()=>{
  const segment=TUNNELS[1].segments[15],middle=segment.a.map((v,i)=>(v+segment.b[i])/2),dir=[1,0,0];
  const a=state([middle[0]-300,middle[1],middle[2]],dir),b={...a,x:middle[0]+300};
  const hit=attractionHit(a,b);
  assert(hit);assert.equal(hit.kind,'tunnel');assert(hit.fraction>0&&hit.fraction<.5);assert(hit.normal[0]<-.5);
});

test('each winding tunnel can be flown with the normal steering limits',()=>{
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  for(const tunnel of TUNNELS){
    const plane=state(tunnel.centers[0],tunnel.segments[0].axis);
    plane.speed=200;plane.throttle=.5;
    let hit=null,progress=0;
    for(let elapsed=0;elapsed<40;elapsed+=.025){
      progress=(tunnel.z-plane.z)/tunnel.length;
      if(progress>=1)break;
      const target=tunnelCenter(tunnel,Math.min(1,progress+.09));
      const dx=target[0]-plane.x,dy=target[1]-plane.y,dz=target[2]-plane.z;
      const yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
      const yawError=Math.atan2(Math.sin(yaw-plane.yaw),Math.cos(yaw-plane.yaw));
      const previous={...plane};
      updateFlight(plane,{x:clamp(yawError*2,-1,1),y:clamp((pitch-plane.pitch)*4,-1,1)},.025,()=>1);
      hit=attractionHit(previous,plane,elapsed,.025);
      if(hit)break;
    }
    assert.equal(hit,null,`${tunnel.name} must be navigable`);
    assert(progress>=1,`${tunnel.name} must reach the other end`);
  }
});
