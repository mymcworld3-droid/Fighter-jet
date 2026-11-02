// Small, deterministic flight model shared by the renderer and the tests.
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
export function terrainMeshHeight(x,z,steps){
  const half=TERRAIN_SIZE/2;
  if(x< -half||x>half||z< -half||z>half)return 0;
  const size=TERRAIN_SIZE/steps,ix=Math.min(steps-1,Math.floor((x+half)/size)),iz=Math.min(steps-1,Math.floor((z+half)/size));
  const left=-half+ix*size,near=-half+iz*size,u=(x-left)/size,v=(z-near)/size;
  const a=terrainHeight(left,near),b=terrainHeight(left,near+size),c=terrainHeight(left+size,near+size),d=terrainHeight(left+size,near);
  return u<v?a*(1-v)+b*(v-u)+c*u:a*(1-u)+c*v+d*(u-v);
}

export function createFlight() {
  return { x: 0, y: 340, z: 1050, yaw: 0, pitch: 0, roll: 0, pitchRate: 0, speed: 200, throttle: 0.65, crashed: false };
}

/** input.x: right positive; input.y: up positive. All rates are time based. */
export function updateFlight(state, input, elapsed, groundHeight=terrainHeight) {
  if (state.crashed) return state;
  const dt = clamp(elapsed, 0, 0.05);
  const x = clamp(Number(input.x) || 0, -1, 1);
  const y = clamp(Number(input.y) || 0, -1, 1);
  const throttle = clamp(Number(state.throttle) || 0, 0.25, 1);

  state.pitchRate += (y * 0.45 - state.pitchRate) * (1 - Math.exp(-4.5 * dt));
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.68, 0.68);
  // Full stick permits an approximately 85° bank while keeping pitch and yaw controllable.
  state.roll += (-x * 1.48 - state.roll) * (1 - Math.exp(-3.5 * dt));
  state.yaw = (state.yaw + x * 0.43 * dt + Math.PI * 2) % (Math.PI * 2);
  const targetSpeed = 105 + throttle * 200;
  state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-0.25 * dt));
  const horizontal = Math.cos(state.pitch) * state.speed * dt;
  state.x += Math.sin(state.yaw) * horizontal;
  state.z -= Math.cos(state.yaw) * horizontal;
  state.y += Math.sin(state.pitch) * state.speed * dt;
  state.y = Math.min(state.y, 8000);
  if (state.y <= Math.max(0, groundHeight(state.x, state.z)) + 8) state.crashed = true;
  return state;
}
