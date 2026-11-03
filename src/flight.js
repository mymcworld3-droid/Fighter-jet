// Small, deterministic flight model shared by the renderer and the tests.
import { aircraftMatrix } from './math.js';
import { createDamageParts } from './damage.js';
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ISLANDS = [
  [0, -500, 2500, 2600, 360],
  [4300, -4400, 2500, 1900, 700],
  [-4500, -3300, 2300, 2200, 520],
  [-2700, 4300, 2100, 1700, 330],
  [5100, 4000, 1900, 2100, 460],
  [-5900, -5900, 2000, 1950, 430],
  [5800, -5500, 2050, 1900, 1080],
  [-5900, 5500, 1850, 1900, 900],
  [500, 6800, 1700, 1250, 270]
];
export const PARK = {x:1250,z:-2150,ground:75};
export const TERRAIN_SIZE=18000, WEBGL_TERRAIN_STEPS=150, CANVAS_TERRAIN_STEPS=44;
export const LANDING_GEAR_CLEARANCE=8;
export const LANDING_ROLL_LIMIT=.35, LANDING_PITCH_MIN=-.28, LANDING_PITCH_MAX=.30;
// World units are metres and speed is metres per second throughout the game.
// Keep the low-throttle speed usable for the winding tunnels.
export const MIN_FLIGHT_SPEED=155, MAX_FLIGHT_SPEED=460;

export function terrainHeight(x, z) {
  let height = -32;
  for (const [cx, cz, rx, rz, peak] of ISLANDS) {
    const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    const shape = Math.exp(-d * 2.0);
    const relief = 0.77 + 0.13 * Math.sin(x * 0.0021 + z * 0.0008) * Math.cos(z * 0.0016) + 0.1 * Math.sin(x * 0.004 + z * 0.0027);
    height += peak * shape * relief;
  }
  // Carve a winding canyon and a shallow volcanic crater without discontinuities.
  const canyonX=(x+5900)/1750, canyonZ=(z+5900-250*Math.sin((x+5900)*.0014))/350;
  height-=185*Math.exp(-(canyonX**4)-(canyonZ**2));
  const crater=((x+5900)/620)**2+((z-5500)/620)**2;
  height-=390*Math.exp(-crater*1.8);
  // A level airfield blends smoothly into the surrounding island.
  const airportDistance = Math.max(Math.abs(x) / 620, Math.abs(z + 450) / 1500);
  height = 27 * (1 - smooth(0.64, 1.14, airportDistance)) + height * smooth(0.64, 1.14, airportDistance);
  // The amusement park has a level base shared by the visual mesh and collision model.
  const parkDistance=Math.max(Math.abs(x-PARK.x)/540,Math.abs(z-PARK.z)/520);
  const parkBlend=smooth(.72,1.2,parkDistance);
  height=PARK.ground*(1-parkBlend)+height*parkBlend;
  return height;
}

// Match the rendered terrain triangles, including the lower-detail Canvas mesh.
// This prevents invisible mountain collisions between mesh vertices.
function terrainMeshValues(x,z,steps){
  const half=TERRAIN_SIZE/2;
  if(x< -half||x>half||z< -half||z>half)return [0,0,0];
  // The runway replaces the terrain underneath and is level at y=30.
  if(x>=-63&&x<=63&&z>=-1450&&z<=180)return [30,0,0];
  const size=TERRAIN_SIZE/steps,ix=Math.min(steps-1,Math.floor((x+half)/size)),iz=Math.min(steps-1,Math.floor((z+half)/size));
  const left=-half+ix*size,near=-half+iz*size,u=(x-left)/size,v=(z-near)/size;
  const a=terrainHeight(left,near),b=terrainHeight(left,near+size),c=terrainHeight(left+size,near+size),d=terrainHeight(left+size,near);
  const ground=u<v?a*(1-v)+b*(v-u)+c*u:a*(1-u)+c*v+d*(u-v);
  const dx=u<v?(c-b)/size:(d-a)/size,dz=u<v?(b-a)/size:(c-d)/size;
  return [ground,dx,dz];
}
export function terrainMeshHeight(x,z,steps){return terrainMeshValues(x,z,steps)[0];}
export function terrainMeshNormal(x,z,steps){
  const [,dx,dz]=terrainMeshValues(x,z,steps),length=Math.hypot(dx,1,dz);
  return [-dx/length,1/length,-dz/length];
}
// Fallback for custom height functions used by alternate worlds and tests.
export function surfaceNormal(groundHeight,x,z){
  const distance=1,dx=(groundHeight(x+distance,z)-groundHeight(x-distance,z))/(2*distance),dz=(groundHeight(x,z+distance)-groundHeight(x,z-distance))/(2*distance),length=Math.hypot(dx,1,dz);
  return [-dx/length,1/length,-dz/length];
}
export function groundAttitude(yaw,normal){
  const [nx,ny,nz]=normal,s=Math.sin(yaw),c=Math.cos(yaw);
  const pitch=Math.atan2(-(nx*s-nz*c),ny);
  const roll=Math.atan2(-(nx*c+nz*s)*Math.cos(pitch),ny);
  return {pitch,roll};
}
export function relativeGroundAngles(state,normal){
  const m=aircraftMatrix(state),dot=(x,y,z)=>x*normal[0]+y*normal[1]+z*normal[2];
  return {pitch:Math.asin(clamp(dot(-m[8],-m[9],-m[10]),-1,1)),roll:Math.atan2(dot(m[0],m[1],m[2]),dot(m[4],m[5],m[6]))};
}
// Vertical separation needed for the wheels to rest on a tilted plane.
export function groundClearance(normal){return LANDING_GEAR_CLEARANCE/clamp(normal[1],.45,1);}

export function createFlight() {
  return { x: 0, y: 340, z: 1050, yaw: 0, pitch: 0, roll: 0, pitchRate: 0, impactRollRate:0, impactYawRate:0, damage:0, damagePart:null, damageParts:createDamageParts(), speed: 200, throttle: 0.65, gearDown:false, gearPosition:0, onGround:false, groundTime:0, groundClearance:LANDING_GEAR_CLEARANCE, crashed:false, crashReason:null };
}

export function setLandingGear(state,down){
  if(state.crashed||(state.onGround&&!down))return false;
  state.gearDown=!!down;
  return true;
}

/** input.x: right positive; input.y: up positive. All rates are time based. */
export function updateFlight(state, input, elapsed, groundHeight=terrainHeight,groundNormal=null) {
  if (state.crashed) return state;
  const dt = clamp(elapsed, 0, 0.05);
  const x = clamp(Number(input.x) || 0, -1, 1);
  const y = clamp(Number(input.y) || 0, -1, 1);
  const throttle = clamp(Number(state.throttle) || 0, 0.25, 1);
  const targetGear=state.gearDown?1:0;
  state.gearPosition=clamp((state.gearPosition||0)+clamp(targetGear-(state.gearPosition||0),-dt,dt),0,1);

  if(state.onGround){
    // On land the wheels roll, slow at idle, and steer without banking.
    state.groundTime=(state.groundTime||0)+dt;
    const power=(throttle-.25)/.75;
    state.speed=Math.max(0,state.speed+(16*power-4-.0005*state.speed*state.speed)*dt);
    state.yaw=(state.yaw+x*.24*clamp(state.speed/30,0,1)*dt+Math.PI*2)%(Math.PI*2);
    state.x+=Math.sin(state.yaw)*state.speed*dt;
    state.z-=Math.cos(state.yaw)*state.speed*dt;
    const ground=groundHeight(state.x,state.z);
    if(ground<=.25){state.onGround=false;state.crashed=true;state.crashReason='water';return state;}
    const normal=groundNormal?groundNormal(state.x,state.z):surfaceNormal(groundHeight,state.x,state.z);
    const attitude=groundAttitude(state.yaw,normal);
    state.roll+=(attitude.roll-state.roll)*(1-Math.exp(-5*dt));
    state.pitch+=(clamp(attitude.pitch+Math.max(0,y)*.18,-.68,.68)-state.pitch)*(1-Math.exp(-3.5*dt));
    state.pitchRate=0;
    const currentClearance=Number.isFinite(state.groundClearance)?state.groundClearance:groundClearance(normal);
    state.groundClearance=currentClearance+(groundClearance(normal)-currentClearance)*(1-Math.exp(-6*dt));
    state.y=ground+state.groundClearance;
    if(state.groundTime>.8&&state.speed>=65&&y>.35&&state.pitch-attitude.pitch>.05){
      state.onGround=false;state.y+=.1;
    }
    return state;
  }

  state.pitchRate += (y * 0.45 - state.pitchRate) * (1 - Math.exp(-4.5 * dt));
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.68, 0.68);
  // Full stick permits an approximately 85° bank while keeping pitch and yaw controllable.
  state.roll += (state.impactRollRate||0)*dt;
  state.roll += (-x * 1.48 - state.roll) * (1 - Math.exp(-3.5 * dt));
  state.yaw = (state.yaw + (x * 0.43+(state.impactYawRate||0)) * dt + Math.PI * 2) % (Math.PI * 2);
  state.impactRollRate=(state.impactRollRate||0)*Math.exp(-2.2*dt);
  state.impactYawRate=(state.impactYawRate||0)*Math.exp(-2.2*dt);
  const power=(throttle-.25)/.75;
  const targetSpeed=MIN_FLIGHT_SPEED+(MAX_FLIGHT_SPEED-MIN_FLIGHT_SPEED)*power-70*state.gearPosition;
  state.speed += (targetSpeed-state.speed)*(1-Math.exp(-.42*dt));
  const horizontal = Math.cos(state.pitch) * state.speed * dt;
  state.x += Math.sin(state.yaw) * horizontal;
  state.z -= Math.cos(state.yaw) * horizontal;
  state.y += Math.sin(state.pitch) * state.speed * dt;
  state.y = Math.min(state.y, 8000);
  const ground=groundHeight(state.x,state.z);
  // Defer the normal calculation until the aircraft is close to the surface.
  if(state.y>Math.max(0,ground)+LANDING_GEAR_CLEARANCE/.45)return state;
  const normal=ground>.25?(groundNormal?groundNormal(state.x,state.z):surfaceNormal(groundHeight,state.x,state.z)):[0,1,0];
  const clearance=groundClearance(normal);
  if(state.y<=Math.max(0,ground)+clearance){
    const angles=relativeGroundAngles(state,normal);
    // Landing is deliberately forgiving: attitude is measured against the
    // local surface, with no speed-dependent impact threshold.
    const safe=ground>.25&&state.gearDown&&state.gearPosition>=.95&&
      Math.abs(angles.roll)<=LANDING_ROLL_LIMIT&&angles.pitch>=LANDING_PITCH_MIN&&angles.pitch<=LANDING_PITCH_MAX;
    if(safe){state.y=ground+clearance;state.groundClearance=clearance;state.onGround=true;state.groundTime=0;state.pitchRate=0;}
    else {state.crashed=true;state.crashReason=ground<=.25?'water':!state.gearDown||state.gearPosition<.95?'gear':'landing';}
  }
  return state;
}
