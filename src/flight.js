// Small, deterministic flight model shared by the renderer and the tests.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ISLANDS = [
  [0, -500, 2500, 2600, 360],
  [4300, -4400, 2500, 1900, 700],
  [-4500, -3300, 2300, 2200, 520],
  [-2700, 4300, 2100, 1700, 330],
  [5100, 4000, 1900, 2100, 460]
];

export function terrainHeight(x, z) {
  let height = -32;
  for (const [cx, cz, rx, rz, peak] of ISLANDS) {
    const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    const shape = Math.exp(-d * 2.0);
    const relief = 0.77 + 0.13 * Math.sin(x * 0.0021 + z * 0.0008) * Math.cos(z * 0.0016) + 0.1 * Math.sin(x * 0.004 + z * 0.0027);
    height += peak * shape * relief;
  }
  // A level airfield blends smoothly into the surrounding island.
  const airportDistance = Math.max(Math.abs(x) / 620, Math.abs(z + 450) / 1500);
  height = 27 * (1 - smooth(0.64, 1.14, airportDistance)) + height * smooth(0.64, 1.14, airportDistance);
  return height;
}

export function createFlight() {
  return { x: 0, y: 340, z: 1050, yaw: 0, pitch: 0, roll: 0, pitchRate: 0, speed: 200, throttle: 0.65, crashed: false };
}

/** input.x: right positive; input.y: up positive. All rates are time based. */
export function updateFlight(state, input, elapsed) {
  if (state.crashed) return state;
  const dt = clamp(elapsed, 0, 0.05);
  const x = clamp(Number(input.x) || 0, -1, 1);
  const y = clamp(Number(input.y) || 0, -1, 1);
  const throttle = clamp(Number(state.throttle) || 0, 0.25, 1);

  state.pitchRate += (y * 0.45 - state.pitchRate) * (1 - Math.exp(-4.5 * dt));
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.68, 0.68);
  state.roll += (-x * 0.78 - state.roll) * (1 - Math.exp(-3.5 * dt));
  state.yaw = (state.yaw + x * 0.43 * dt + Math.PI * 2) % (Math.PI * 2);
  const targetSpeed = 105 + throttle * 200;
  state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-0.25 * dt));
  const horizontal = Math.cos(state.pitch) * state.speed * dt;
  state.x += Math.sin(state.yaw) * horizontal;
  state.z -= Math.cos(state.yaw) * horizontal;
  state.y += Math.sin(state.pitch) * state.speed * dt;
  state.y = Math.min(state.y, 8000);
  if (state.y <= Math.max(0, terrainHeight(state.x, state.z)) + 8) state.crashed = true;
  return state;
}
