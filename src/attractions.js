import { PARK, clamp } from './flight.js';
import { aircraftMatrix, transformPoint } from './math.js';

// The visual models and their collision shapes share these dimensions.
export const WHEEL={x:PARK.x-180,y:PARK.ground+230,z:PARK.z-90,radius:165};
export const COASTER_SEGMENTS=32;
export const wheelAngle=time=>time*.12;
export const coasterTrack=t=>[PARK.x+240+230*Math.cos(t),PARK.ground+88+54*Math.sin(2*t),PARK.z+50+250*Math.sin(t)];

const capsule=(a,b,radius,kind)=>({a,b,radius,kind});
const fixed=[];
for(const dx of [-110,110])for(const dz of [-18,18])fixed.push(capsule([WHEEL.x+dx,PARK.ground+2,WHEEL.z+dz],[WHEEL.x,WHEEL.y,WHEEL.z+dz],7,'wheel'));
for(let i=0;i<COASTER_SEGMENTS;i++){
  const a=coasterTrack(i*Math.PI*2/COASTER_SEGMENTS),b=coasterTrack((i+1)*Math.PI*2/COASTER_SEGMENTS);
  for(const offset of [-9,9])fixed.push(capsule([a[0],a[1]+offset,a[2]],[b[0],b[1]+offset,b[2]],4,'coaster'));
  if(i%4===0)fixed.push(capsule([a[0],PARK.ground+2,a[2]],a,5,'coaster'));
}
const aircraftPoints=[
  [[0,0,-22],4],[[0,0,-14],4.5],[[0,0,-5],4.5],[[0,0,4],4.5],[[0,0,13],4.5],[[0,0,19],4],
  [[-8,0,6],4],[[8,0,6],4],[[-15,0,10],4],[[15,0,10],4],[[0,4,14],3.5]
];

function wheelColliders(time){
  const segments=[],angle=wheelAngle(time),center=[WHEEL.x,WHEEL.y,WHEEL.z],point=(r,t)=>[WHEEL.x+Math.cos(t)*r,WHEEL.y+Math.sin(t)*r,WHEEL.z];
  for(let i=0;i<28;i++)segments.push(capsule(point(WHEEL.radius+4,angle+i*Math.PI*2/28),point(WHEEL.radius+4,angle+(i+1)*Math.PI*2/28),8,'wheel'));
  for(let i=0;i<12;i++){
    const t=angle+i*Math.PI/6,x=Math.cos(t)*WHEEL.radius,y=Math.sin(t)*WHEEL.radius;
    segments.push(capsule(center,[WHEEL.x+x,WHEEL.y+y,WHEEL.z],3,'wheel'));
    const cabin=[WHEEL.x+x+10*Math.sin(angle),WHEEL.y+y-10*Math.cos(angle),WHEEL.z];
    segments.push(capsule(cabin,cabin,21,'wheel'));
  }
  return segments;
}

// Squared closest distance between two finite segments, including point cases.
export function segmentDistanceSquared(p1,q1,p2,q2){
  const d1=p1.map((v,i)=>q1[i]-v),d2=p2.map((v,i)=>q2[i]-v),r=p1.map((v,i)=>v-p2[i]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);let s=0,t=0;
  if(a<1e-12&&e<1e-12)return dot(r,r);
  if(a<1e-12)t=clamp(f/e,0,1);
  else {
    const c=dot(d1,r);
    if(e<1e-12)s=clamp(-c/a,0,1);
    else {
      const b=dot(d1,d2),denominator=a*e-b*b;
      if(denominator>1e-12)s=clamp((b*f-c*e)/denominator,0,1);
      t=(b*s+f)/e;
      if(t<0){t=0;s=clamp(-c/a,0,1);}else if(t>1){t=1;s=clamp((b-c)/a,0,1);}
    }
  }
  const delta=r.map((v,i)=>v+d1[i]*s-d2[i]*t);return dot(delta,delta);
}
function overlapsSweep(from,to,a,b,padding){
  return [0,1,2].every(i=>Math.max(from[i],to[i])+padding>=Math.min(a[i],b[i])&&Math.min(from[i],to[i])-padding<=Math.max(a[i],b[i]));
}
export function attractionHit(previous,current,time=0,dt=.025){
  const from=[previous.x,previous.y,previous.z],to=[current.x,current.y,current.z];
  if(!overlapsSweep(from,to,[PARK.x-400,PARK.ground,PARK.z-400],[PARK.x+510,WHEEL.y+180,PARK.z+350],36))return null;
  const oldModel=aircraftMatrix(previous),newModel=aircraftMatrix(current);
  const paths=aircraftPoints.map(([position,radius])=>({from:transformPoint(oldModel,position),to:transformPoint(newModel,position),radius}));
  const nearWheel=overlapsSweep(from,to,[WHEEL.x-190,PARK.ground,WHEEL.z-30],[WHEEL.x+190,WHEEL.y+190,WHEEL.z+30],36);
  const colliders=nearWheel?fixed.concat(wheelColliders(time-dt/2)):fixed;
  for(const c of colliders){
    if(!overlapsSweep(from,to,c.a,c.b,32+c.radius))continue;
    for(const p of paths){
      const reach=p.radius+c.radius+(c.kind==='wheel'?Math.abs(dt)*12:0);
      if(overlapsSweep(p.from,p.to,c.a,c.b,reach)&&segmentDistanceSquared(p.from,p.to,c.a,c.b)<=reach*reach)return {kind:c.kind};
    }
  }
  return null;
}
