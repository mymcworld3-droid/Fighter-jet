// Gates are deliberately aligned with the initial northbound flight path.
export const FLIGHT_GATES=[
  {id:0,x:0,y:340,z:-350,radius:115},
  {id:1,x:0,y:340,z:-1450,radius:115},
  {id:2,x:0,y:340,z:-2550,radius:115},
  {id:3,x:0,y:340,z:-3650,radius:115}
];

// Segment-plane intersection makes high-speed crossings frame-rate independent.
export function crossedGate(from,to,gate){
  const a=from.z-gate.z,b=to.z-gate.z;
  if((a>0&&b>0)||(a<0&&b<0)||a===b)return false;
  const t=a/(a-b);
  if(t<0||t>1)return false;
  const x=from.x+(to.x-from.x)*t-gate.x;
  const y=from.y+(to.y-from.y)*t-gate.y;
  return x*x+y*y<=gate.radius*gate.radius;
}

export function updateCourse(passed,from,to){
  let count=0;
  for(const gate of FLIGHT_GATES){
    if(!passed.has(gate.id)&&crossedGate(from,to,gate)){passed.add(gate.id);count++;}
  }
  return count;
}
