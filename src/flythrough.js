import { cross, normalize, sub } from './math.js';

// The same beams are used for drawing and swept aircraft collision checks.
// Each installation has generous open passages and a coarse bounding box.
const metal=[.64,.73,.70],coral=[.88,.45,.30],teal=[.29,.79,.75],gold=[.95,.70,.34],violet=[.65,.54,.84];
const add=(beams,kind,a,b,width,color)=>beams.push({kind,a,b,width,radius:width*.55,color});
const opening=(center,axis,distance=80)=>({center,axis,distance});
function group(id,name,altitude,marker,beams,openings){
  const bounds=[0,1,2].map(i=>[
    Math.min(...beams.map(b=>Math.min(b.a[i],b.b[i])-b.radius)),
    Math.max(...beams.map(b=>Math.max(b.a[i],b.b[i])+b.radius))
  ]);
  return {id,name,altitude,marker,beams,openings,bounds};
}

function bridge(){
  const id='skybridge',x=-3500,z=1800,span=300,deck=285,depth=55,beams=[];
  const piers=Array.from({length:4},(_,i)=>x+(i-1.5)*span);
  for(const px of piers){
    for(const dz of [-depth,depth])add(beams,id,[px,0,z+dz],[px,deck,z+dz],22,metal);
    add(beams,id,[px,deck,z-depth],[px,deck,z+depth],14,metal);
  }
  for(const dz of [-depth,depth]){
    add(beams,id,[piers[0],deck,z+dz],[piers[3],deck,z+dz],18,coral);
    for(let k=0;k<3;k++){
      const arch=t=>[piers[k]+span*t,deck+95*Math.sin(Math.PI*t),z+dz];
      for(let j=0;j<8;j++)add(beams,id,arch(j/8),arch((j+1)/8),11,coral);
      for(const t of [.25,.5,.75])add(beams,id,[piers[k]+span*t,deck,z+dz],arch(t),5,metal);
    }
  }
  const openings=piers.slice(0,-1).map((v,i)=>opening([(v+piers[i+1])/2,145,z],[0,0,-1],150));
  return group(id,'海上三孔橋','約 100–250 公尺', [x,z],beams,openings);
}

function frameCorridor(){
  const id='skyframes',beams=[],centers=[],corners=[];
  for(let i=0;i<9;i++){
    const u=i/8,c=[2800+150*Math.sin(2*Math.PI*u),620+65*Math.sin(2*Math.PI*u)+80*u,1500-1900*u];
    const ring=[[-180,-145],[180,-145],[180,145],[-180,145]].map(([dx,dy])=>[c[0]+dx,c[1]+dy,c[2]]);
    centers.push(c);corners.push(ring);
    for(let j=0;j<4;j++)add(beams,id,ring[j],ring[(j+1)%4],14,i%2?teal:metal);
    if(i>0)for(let j=0;j<4;j++)add(beams,id,corners[i-1][j],ring[j],8,j%2?teal:metal);
  }
  return group(id,'空中方框廊','約 600–700 公尺',[2800,550],beams,centers.map(c=>opening(c,[0,0,-1],65)));
}

function spiralCorridor(){
  const id='spiral',beams=[],centers=[],bases=[],radius=185,count=7,sides=12;
  const center=u=>[5100+180*Math.sin(2*Math.PI*u),1100+130*u+90*Math.sin(2*Math.PI*u),1500-2200*u];
  for(let i=0;i<count;i++)centers.push(center(i/(count-1)));
  for(let i=0;i<count;i++){
    const tangent=normalize(sub(centers[Math.min(i+1,count-1)],centers[Math.max(i-1,0)]));
    const right=normalize(cross(tangent,[0,1,0])),up=normalize(cross(right,tangent));
    const p=t=>centers[i].map((v,j)=>v+radius*(right[j]*Math.cos(t)+up[j]*Math.sin(t)));
    bases.push(p);
    for(let j=0;j<sides;j++)add(beams,id,p(j*2*Math.PI/sides),p((j+1)*2*Math.PI/sides),14,j%3===0?teal:gold);
  }
  for(let i=0;i<count-1;i++)for(let j=0;j<3;j++){
    const angle=j*2*Math.PI/3+i*Math.PI/3;
    add(beams,id,bases[i](angle),bases[i+1](angle+Math.PI/3),9,j===1?teal:gold);
  }
  const openings=centers.map((c,i)=>opening(c,normalize(sub(centers[Math.min(i+1,count-1)],centers[Math.max(i-1,0)])),60));
  return group(id,'螺旋環廊','約 1,100–1,250 公尺',[5100,400],beams,openings);
}

function pyramid(){
  const id='skypyramid',beams=[],x=-5200,z=-2600,base=720,top=1280,half=340;
  const corners=(y,size)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>[x+sx*size,y,z+sz*size]);
  const lower=corners(base,half),upper=corners(base+(top-base)*.4,half*.6),apex=[x,top,z];
  for(let i=0;i<4;i++){
    add(beams,id,lower[i],lower[(i+1)%4],15,violet);
    add(beams,id,upper[i],upper[(i+1)%4],10,gold);
    add(beams,id,lower[i],apex,16,metal);
  }
  return group(id,'天空金字塔','約 800–1,000 公尺',[x,z],beams,[opening([x,850,z],[0,0,-1],480)]);
}

export const FLYTHROUGH=[bridge(),frameCorridor(),spiralCorridor(),pyramid()];
export function nearbyFlythrough(from,to,padding=36){
  return FLYTHROUGH.filter(group=>group.bounds.every(([lo,hi],i)=>Math.max(from[i],to[i])+padding>=lo&&Math.min(from[i],to[i])-padding<=hi));
}
