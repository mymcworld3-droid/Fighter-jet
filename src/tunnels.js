import { cross, normalize, sub } from './math.js';

// Both ends are open. The same sampled centreline defines the visible shell,
// map path and solid collision walls, so they do not drift apart.
export const TUNNEL_SEGMENTS=32, TUNNEL_SIDES=12;
const profiles=[
  {id:'cloud',name:'雲際彎道',x:-850,y:650,z:-1400,length:2700,waveX:260,waveY:100,rise:120,radius:150,color:[.27,.75,.80]},
  {id:'sunset',name:'夕霞隧道',x:3000,y:850,z:-1300,length:2800,waveX:-310,waveY:135,rise:80,radius:160,color:[.90,.54,.36]},
  {id:'island',name:'群島蜿道',x:-3600,y:1050,z:1100,length:3100,waveX:330,waveY:-140,rise:160,radius:160,color:[.60,.55,.87]}
];

export function tunnelCenter(tunnel,t){
  const turn=2*Math.PI*t;
  return [tunnel.x+tunnel.waveX*Math.sin(turn),tunnel.y+tunnel.rise*t+tunnel.waveY*Math.sin(turn),tunnel.z-tunnel.length*t];
}
function sampleTunnel(tunnel){
  const centers=Array.from({length:TUNNEL_SEGMENTS+1},(_,i)=>tunnelCenter(tunnel,i/TUNNEL_SEGMENTS));
  const rings=centers.map((center,i)=>{
    const tangent=normalize(sub(centers[Math.min(i+1,TUNNEL_SEGMENTS)],centers[Math.max(i-1,0)]));
    const right=normalize(cross(tangent,[0,1,0])),up=normalize(cross(right,tangent));
    return Array.from({length:TUNNEL_SIDES},(_,j)=>{
      const angle=j*2*Math.PI/TUNNEL_SIDES;
      return center.map((n,k)=>n+tunnel.radius*(right[k]*Math.cos(angle)+up[k]*Math.sin(angle)));
    });
  });
  const bounds=[0,1,2].map(i=>[Math.min(...centers.map(p=>p[i]))-tunnel.radius-36,Math.max(...centers.map(p=>p[i]))+tunnel.radius+36]);
  const segments=centers.slice(0,-1).map((a,i)=>{
    const b=centers[i+1],d=sub(b,a),length=Math.hypot(...d);
    return {a,b,length,axis:d.map(v=>v/length)};
  });
  return {...tunnel,centers,rings,bounds,segments};
}
export const TUNNELS=profiles.map(sampleTunnel);

const overlaps=(a,b,bounds)=>bounds.every(([lo,hi],i)=>Math.max(a[i],b[i])>=lo&&Math.min(a[i],b[i])<=hi);
export const tunnelMayIntersect=(from,to)=>TUNNELS.some(t=>overlaps(from,to,t.bounds));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Find the first crossing of a cylindrical segment's wall by a swept aircraft
// point. The axis interval leaves the entrance and exit unobstructed.
function wallCrossing(path,segment,radius){
  const offset=sub(path.from,segment.a),travel=sub(path.to,path.from),along=dot(offset,segment.axis),alongTravel=dot(travel,segment.axis);
  const radial=offset.map((v,i)=>v-along*segment.axis[i]),change=travel.map((v,i)=>v-alongTravel*segment.axis[i]);
  const r0=Math.hypot(...radial),inner=radius*Math.cos(Math.PI/TUNNEL_SIDES)-path.radius,outer=radius+path.radius;
  const A=dot(change,change),B=2*dot(radial,change);
  let t,inside;
  if(r0>inner&&r0<outer){t=0;inside=B>=0;}
  else{
    inside=r0<=inner;
    if(A<1e-12)return null;
    const target=inside?inner:outer,disc=B*B-4*A*(dot(radial,radial)-target*target);
    if(disc<0)return null;
    const root=Math.sqrt(disc),candidates=[(-B-root)/(2*A),(-B+root)/(2*A)];
    t=candidates.find(v=>v>=0&&v<=1&&(inside?B+2*A*v>0:B+2*A*v<0));
    if(t===undefined)return null;
  }
  const s=along+alongTravel*t;
  if(s<0||s>segment.length)return null;
  const r=radial.map((v,i)=>v+change[i]*t),length=Math.hypot(...r);
  if(length<1e-8)return null;
  const normal=r.map(v=>v/length*(inside?-1:1));
  const center=path.from.map((v,i)=>v+travel[i]*t);
  return {fraction:t,normal,point:center.map((v,i)=>v-normal[i]*path.radius)};
}

export function tunnelHit(from,to,paths){
  let best=null;
  for(const tunnel of TUNNELS){
    if(!overlaps(from,to,tunnel.bounds))continue;
    for(const segment of tunnel.segments){
      const padding=tunnel.radius+36;
      const bounds=[0,1,2].map(i=>[Math.min(segment.a[i],segment.b[i])-padding,Math.max(segment.a[i],segment.b[i])+padding]);
      if(!overlaps(from,to,bounds))continue;
      for(const path of paths){
        const hit=wallCrossing(path,segment,tunnel.radius);
        if(hit&&(!best||hit.fraction<best.fraction))best={...hit,kind:'tunnel',part:path.part,obstacleVelocity:[0,0,0],tunnel:tunnel.id};
      }
    }
  }
  return best;
}
