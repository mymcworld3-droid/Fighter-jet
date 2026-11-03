import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, updateFlight } from '../src/flight.js';
import { attractionHit } from '../src/attractions.js';
import { impactResponse } from '../src/impact.js';
import { FLYTHROUGH } from '../src/flythrough.js';

const state=(p,direction)=>({
  ...createFlight(),x:p[0],y:p[1],z:p[2],speed:250,
  yaw:Math.atan2(direction[0],-direction[2]),pitch:Math.atan2(direction[1],Math.hypot(direction[0],direction[2]))
});
const move=(p,direction,distance)=>p.map((value,i)=>value+direction[i]*distance);

test('each bridge opening, frame, ring and pyramid can be entered in both directions',()=>{
  assert.equal(FLYTHROUGH.length,4);
  for(const facility of FLYTHROUGH)for(const entrance of facility.openings)for(const sign of [1,-1]){
    const direction=entrance.axis.map(value=>value*sign);
    const from=state(move(entrance.center,direction,-entrance.distance),direction);
    const to=state(move(entrance.center,direction,entrance.distance),direction);
    assert.equal(attractionHit(from,to),null,`${facility.name} has a clear opening`);
  }
});

test('the visible beams of each facility register a swept high-speed impact',()=>{
  for(const facility of FLYTHROUGH){
    const bar=facility.beams[0],middle=bar.a.map((value,i)=>(value+bar.b[i])/2),direction=[0,0,-1];
    const from=state(move(middle,direction,-150),direction),to=state(move(middle,direction,150),direction);
    const hit=attractionHit(from,to);
    assert.equal(hit?.kind,facility.id,`${facility.name} has solid beams`);
    assert(hit.fraction>=0&&hit.fraction<1);
    assert(hit.normal.every(Number.isFinite));
    assert(impactResponse(from,hit).normalSpeed>0,`${facility.name} gives the existing damage system an impact`);
  }
});

test('curved frame and ring corridors can be flown through using ordinary controls',()=>{
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  for(const facility of FLYTHROUGH.filter(item=>item.id==='skyframes'||item.id==='spiral')){
    const points=facility.openings.map(item=>item.center),first=facility.openings[0];
    const plane=state(first.center,first.axis);plane.speed=200;plane.throttle=.5;
    const length=points[0][2]-points.at(-1)[2];let hit=null,progress=0;
    for(let elapsed=0;elapsed<40;elapsed+=.025){
      progress=(points[0][2]-plane.z)/length;
      if(progress>=1)break;
      const ahead=clamp((progress+.09)*(points.length-1),0,points.length-1);
      const i=Math.min(Math.floor(ahead),points.length-2),fraction=ahead-i;
      const target=points[i].map((v,j)=>v+(points[i+1][j]-v)*fraction);
      const dx=target[0]-plane.x,dy=target[1]-plane.y,dz=target[2]-plane.z;
      const yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
      const yawError=Math.atan2(Math.sin(yaw-plane.yaw),Math.cos(yaw-plane.yaw));
      const previous={...plane};
      updateFlight(plane,{x:clamp(yawError*2,-1,1),y:clamp((pitch-plane.pitch)*4,-1,1)},.025,()=>1);
      hit=attractionHit(previous,plane,elapsed,.025);
      if(hit)break;
    }
    assert.equal(hit,null,`${facility.name} is navigable`);
    assert(progress>=1,`${facility.name} reaches the far end`);
  }
});
