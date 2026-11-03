import { aircraftMatrix, cross, wrapAngle } from './math.js';
import { clamp } from './flight.js';
import { addPartDamage } from './damage.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const factors={nose:1.15,body:1,left:.85,right:.85,tail:.95};

// A simplified impulse model: the contact offset controls both the change in
// linear momentum and the rotation imparted to the aircraft.
export function impactResponse(flight,hit){
  const m=aircraftMatrix(flight),velocity=[-m[8]*flight.speed,-m[9]*flight.speed,-m[10]*flight.speed];
  const normal=hit.normal,obstacle=hit.obstacleVelocity||[0,0,0],relative=velocity.map((v,i)=>v-obstacle[i]);
  const normalSpeed=Math.max(0,-dot(relative,normal));
  let offset=hit.point.map((v,i)=>v-[flight.x,flight.y,flight.z][i]);
  const distance=Math.hypot(...offset);if(distance>32)offset=offset.map(v=>v*32/distance);
  const lever=cross(offset,normal),inertia=240;
  // A ride yields under the impact: some momentum transfers to it while the
  // remainder continues with the aircraft and its fragments.
  const impulseMagnitude=.70*normalSpeed/(1+dot(lever,lever)/inertia);
  const impulse=normal.map(v=>v*impulseMagnitude),postVelocity=velocity.map((v,i)=>v+impulse[i]);
  let angularVelocity=cross(offset,impulse).map(v=>v/inertia);
  const angularSpeed=Math.hypot(...angularVelocity);if(angularSpeed>3)angularVelocity=angularVelocity.map(v=>v*3/angularSpeed);
  const damageAdded=clamp((normalSpeed-10)/165,0,1.3)*(factors[hit.part]||1);
  const damage=clamp((flight.damage||0)+damageAdded,0,1);
  return {point:hit.point.slice(),normal:normal.slice(),part:hit.part||'body',normalSpeed,damageAdded,damage,fatal:damage>=1,velocity,postVelocity,angularVelocity,impulse};
}

export function applyImpact(flight,hit){
  const response=impactResponse(flight,hit),m=aircraftMatrix(flight),speed=Math.hypot(...response.postVelocity);
  flight.damage=response.damage;
  if(response.damageAdded>0){
    flight.damagePart=response.part;
    flight.damageParts=addPartDamage(flight.damageParts,response.part,response.damageAdded);
  }
  if(speed>1){
    flight.speed=speed;
    const inverted=Math.cos(flight.pitch)<0;
    const pitch=Math.asin(clamp(response.postVelocity[1]/speed,-1,1));
    const heading=Math.atan2(response.postVelocity[0],-response.postVelocity[2]);
    flight.yaw=(heading+(inverted?Math.PI:0)+Math.PI*2)%(Math.PI*2);
    flight.pitch=wrapAngle(inverted?(pitch>=0?Math.PI-pitch:-Math.PI-pitch):pitch);
  }else flight.speed=0;
  const right=[m[0],m[1],m[2]],up=[m[4],m[5],m[6]],back=[m[8],m[9],m[10]];
  flight.pitchRate=clamp((flight.pitchRate||0)+dot(response.angularVelocity,right),-2,2);
  flight.impactYawRate=clamp((flight.impactYawRate||0)-dot(response.angularVelocity,up),-2,2);
  flight.impactRollRate=clamp((flight.impactRollRate||0)+dot(response.angularVelocity,back),-2,2);
  return response;
}
