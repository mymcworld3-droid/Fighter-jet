import { aircraftMatrix, transformPoint, cross } from './math.js';

export const WRECK_PARTS=[
  {id:'nose',anchor:[0,0,-15],impulse:[0,16,-30],spin:[.45,-.8,.5]},
  {id:'body',anchor:[0,0,1],impulse:[0,9,4],spin:[.15,.35,.2]},
  {id:'left',anchor:[-9,0,8],impulse:[-40,23,2],spin:[-.8,.5,1.6]},
  {id:'right',anchor:[9,0,8],impulse:[40,18,6],spin:[.9,-.4,-1.6]},
  {id:'tail',anchor:[0,2,15],impulse:[0,26,28],spin:[.65,1.1,.9]}
];
const vector=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];

export function createCrashEffect(flight,impact=null){
  const model=aircraftMatrix(flight),forward=vector(model,[0,0,-1]);
  const momentum=impact?.postVelocity||forward.map(v=>v*flight.speed),angular=impact?.angularVelocity||[0,0,0];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],right=[model[0],model[1],model[2]],up=[model[4],model[5],model[6]],back=[model[8],model[9],model[10]];
  const sharedSpin=[-dot(angular,up),dot(angular,right),dot(angular,back)];
  const pieces=WRECK_PARTS.map(spec=>{
    const p=transformPoint(model,spec.anchor),offset=vector(model,spec.anchor),rotation=cross(angular,offset),v=vector(model,spec.impulse);
    const contact=impact?.point||[flight.x,flight.y,flight.z],distance=Math.hypot(p[0]-contact[0],p[1]-contact[1],p[2]-contact[2]);
    const separation=.15+.18*Math.exp(-distance*distance/600);
    return {id:spec.id,x:p[0],y:p[1],z:p[2],vx:momentum[0]+rotation[0]+v[0]*separation,vy:momentum[1]+rotation[1]+v[1]*separation,vz:momentum[2]+rotation[2]+v[2]*separation,yaw:flight.yaw,pitch:flight.pitch,roll:flight.roll,spin:spec.spin.map((n,i)=>n*.25+sharedSpin[i])};
  });
  let seed=38129;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const sparks=Array.from({length:20},()=>{
    const azimuth=random()*Math.PI*2,speed=20+random()*65;
    return {x:flight.x,y:flight.y,z:flight.z,vx:Math.cos(azimuth)*speed+momentum[0],vy:12+random()*65+momentum[1],vz:Math.sin(azimuth)*speed+momentum[2],life:.5+random()*.9,age:0};
  });
  return {age:0,origin:[flight.x,flight.y,flight.z],view:{yaw:flight.yaw,pitch:flight.pitch,roll:flight.roll},explodeAt:1.35,pieces,sparks,smoke:[],smokeClock:0};
}

export function updateCrashEffect(crash,elapsed,groundHeight){
  const dt=Math.max(0,Math.min(elapsed,.05));if(!dt)return;
  crash.age+=dt;
  for(const p of crash.pieces){
    p.vy-=32*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    p.yaw+=p.spin[0]*dt;p.pitch+=p.spin[1]*dt;p.roll+=p.spin[2]*dt;
    const ground=Math.max(0,groundHeight(p.x,p.z))+2;
    if(p.y<ground){p.y=ground;if(p.vy<0)p.vy=-p.vy*.17;p.vx*=.88;p.vz*=.88;p.spin=p.spin.map(v=>v*.90);}
  }
  for(const p of crash.sparks){p.age+=dt;p.vy-=42*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}
  crash.sparks=crash.sparks.filter(p=>p.age<p.life);
  if(crash.age<2.6){
    crash.smokeClock+=dt;
    while(crash.smokeClock>=.10){
      crash.smokeClock-=.10;
      for(const p of [crash.pieces[1],crash.pieces[4]])crash.smoke.push({x:p.x,y:p.y+2,z:p.z,vx:p.vx*.8,vy:p.vy*.8+9,vz:p.vz*.8,age:0,life:1.6});
    }
  }
  for(const p of crash.smoke){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy+=3*dt;}
  crash.smoke=crash.smoke.filter(p=>p.age<p.life);
}
