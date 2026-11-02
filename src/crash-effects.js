import { aircraftMatrix, transformPoint } from './math.js';

export const WRECK_PARTS=[
  {id:'nose',anchor:[0,0,-15],impulse:[0,16,-30],spin:[.45,-.8,.5]},
  {id:'body',anchor:[0,0,1],impulse:[0,9,4],spin:[.15,.35,.2]},
  {id:'left',anchor:[-9,0,8],impulse:[-40,23,2],spin:[-.8,.5,1.6]},
  {id:'right',anchor:[9,0,8],impulse:[40,18,6],spin:[.9,-.4,-1.6]},
  {id:'tail',anchor:[0,2,15],impulse:[0,26,28],spin:[.65,1.1,.9]}
];
const vector=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];

export function createCrashEffect(flight){
  const model=aircraftMatrix(flight),forward=vector(model,[0,0,-1]),momentum=Math.min(75,flight.speed*.25);
  const pieces=WRECK_PARTS.map(spec=>{
    const p=transformPoint(model,spec.anchor),v=vector(model,spec.impulse);
    return {id:spec.id,x:p[0],y:p[1],z:p[2],vx:v[0]+forward[0]*momentum,vy:v[1]+forward[1]*momentum,vz:v[2]+forward[2]*momentum,yaw:flight.yaw,pitch:flight.pitch,roll:flight.roll,spin:spec.spin.slice()};
  });
  let seed=38129;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const sparks=Array.from({length:20},()=>{
    const azimuth=random()*Math.PI*2,speed=20+random()*65;
    return {x:flight.x,y:flight.y,z:flight.z,vx:Math.cos(azimuth)*speed+forward[0]*momentum,vy:12+random()*65,vz:Math.sin(azimuth)*speed+forward[2]*momentum,life:.5+random()*.9,age:0};
  });
  return {age:0,origin:[flight.x,flight.y,flight.z],pieces,sparks,smoke:[],smokeClock:0};
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
      for(const p of [crash.pieces[1],crash.pieces[4]])crash.smoke.push({x:p.x,y:p.y+2,z:p.z,vx:p.vx*.12,vy:9,vz:p.vz*.12,age:0,life:1.6});
    }
  }
  for(const p of crash.smoke){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy+=3*dt;}
  crash.smoke=crash.smoke.filter(p=>p.age<p.life);
}
