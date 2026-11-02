import { aircraftMatrix, transformPoint } from './math.js';

export function createEffects() {
  return { bullets: [], exhaust: [], shotCooldown: 0, exhaustClock: 0, sequence: 0, shotsFired: 0, flash: 0 };
}

// Bullets and exhaust stay in world coordinates after leaving the moving jet.
export function updateEffects(effects, flight, firing, dt) {
  if (dt <= 0) return effects;
  const model=aircraftMatrix(flight);
  const tip=transformPoint(model,[0,0,-1]);
  const forward=[tip[0]-flight.x,tip[1]-flight.y,tip[2]-flight.z];
  effects.flash=Math.max(0,effects.flash-dt);

  if (firing && !flight.crashed) {
    effects.shotCooldown-=dt;
    while (effects.shotCooldown<=0) {
      effects.shotsFired++;
      // The cannon exits just beyond the nose, so the projectile never starts inside the aircraft.
      const p=transformPoint(model,[0,0,-25.5]);
      const speed=flight.speed+850;
      effects.bullets.push({x:p[0],y:p[1],z:p[2],vx:forward[0]*speed,vy:forward[1]*speed,vz:forward[2]*speed,age:0,life:1.4});
      effects.shotCooldown+=0.11;
      effects.flash=0.065;
    }
  } else effects.shotCooldown=0;

  if (!flight.crashed) {
    effects.exhaustClock+=dt;
    while (effects.exhaustClock>=0.065) {
      effects.exhaustClock-=0.065;
      const n=effects.sequence++, p=transformPoint(model,[0,0,20]);
      const drift=flight.speed-(125+flight.throttle*110);
      effects.exhaust.push({x:p[0],y:p[1],z:p[2],vx:forward[0]*drift+Math.sin(n*1.7)*3,vy:forward[1]*drift+Math.cos(n*2.3)*2,vz:forward[2]*drift+Math.sin(n*.8)*3,age:0,life:1.35});
    }
  }
  for (const item of [...effects.bullets,...effects.exhaust]) {
    item.x+=item.vx*dt;item.y+=item.vy*dt;item.z+=item.vz*dt;item.age+=dt;
  }
  effects.bullets=effects.bullets.filter(item=>item.age<item.life);
  effects.exhaust=effects.exhaust.filter(item=>item.age<item.life);
  return effects;
}
