export const DAMAGE_PARTS=['nose','body','left','right','tail'];

export function createDamageParts(){
  return {nose:0,body:0,left:0,right:0,tail:0};
}

// Pale aircraft material becomes progressively red with actual part damage.
export function damageColor(value){
  const amount=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  const healthy=[189,224,218],destroyed=[255,53,45];
  return `rgb(${healthy.map((channel,i)=>Math.round(channel+(destroyed[i]-channel)*amount)).join(', ')})`;
}

// Return a new object so flight snapshots used for swept collision checks are
// not changed retroactively when a later impact is applied.
export function addPartDamage(current,part,amount){
  const name=DAMAGE_PARTS.includes(part)?part:'body';
  const parts={...createDamageParts(),...current};
  parts[name]=Math.min(1,Math.max(0,(parts[name]||0)+Math.max(0,amount||0)));
  return parts;
}

// Ground and water crashes are already catastrophic in the flight model.
export function markCrashDamage(flight,part='body'){
  const name=DAMAGE_PARTS.includes(part)?part:'body';
  flight.damage=1;flight.damagePart=name;
  flight.damageParts=addPartDamage(flight.damageParts,name,1);
}
