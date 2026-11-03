export const MAX_PLAYERS=8;
export const PRESENCE_TTL=12000;
const ROOM=/^[A-HJ-NP-Z2-9]{6}$/;
const PLAYER_ID=/^[a-f0-9]{32}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const numberIn=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const parts=new Set(['nose','body','left','right','tail']);
const vectorIn=(v,limit)=>Array.isArray(v)&&v.length===3&&v.every(n=>numberIn(n,-limit,limit));

function validate(payload) {
  if(!payload||typeof payload!=='object')return null;
  const room=String(payload.room||'').trim().toUpperCase();
  const id=String(payload.id||''),token=String(payload.token||'');
  if(!ROOM.test(room)||!PLAYER_ID.test(id)||!TOKEN.test(token))return null;
  if(payload.action==='leave')return {action:'leave',room,id,token};
  if(!['create','join','sync'].includes(payload.action)||typeof payload.name!=='string')return null;
  const name=Array.from(payload.name.trim().replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,14).join('');
  const s=payload.state;
  if(!name||!s||typeof s!=='object')return null;
  if(!numberIn(s.x,-10000000,10000000)||!numberIn(s.y,0,8100)||!numberIn(s.z,-10000000,10000000)||
     !numberIn(s.yaw,-7,7)||!numberIn(s.pitch,-Math.PI,Math.PI)||!numberIn(s.roll,-2,2)||
     !numberIn(s.speed,0,500)||!numberIn(s.throttle,0,1)||!Number.isSafeInteger(s.shotsFired)||s.shotsFired<0||s.shotsFired>10000000||
     typeof s.firing!=='boolean'||typeof s.crashed!=='boolean'||(s.gearDown!==undefined&&typeof s.gearDown!=='boolean')||(s.onGround!==undefined&&typeof s.onGround!=='boolean'))return null;
  if((s.damage!==undefined&&!numberIn(s.damage,0,1))||(s.damagePart!=null&&!parts.has(s.damagePart)))return null;
  let damageParts=null;
  if(s.damageParts!=null){
    if(typeof s.damageParts!=='object'||Array.isArray(s.damageParts))return null;
    damageParts={};
    for(const part of parts){
      const value=s.damageParts[part]??0;
      if(!numberIn(value,0,1))return null;
      damageParts[part]=value;
    }
  }
  let crashImpact=null;
  if(s.crashImpact!=null){
    const p=s.crashImpact;
    if(!s.crashed||!p||typeof p!=='object'||!parts.has(p.part)||!vectorIn(p.point,10000100)||!vectorIn(p.normal,1.01)||!vectorIn(p.velocity,2000)||!vectorIn(p.postVelocity,2000)||!vectorIn(p.angularVelocity,10)||!vectorIn(p.impulse,2000))return null;
    crashImpact={part:p.part,point:p.point,normal:p.normal,velocity:p.velocity,postVelocity:p.postVelocity,angularVelocity:p.angularVelocity,impulse:p.impulse};
  }
  return {action:payload.action,room,id,token,name,state:{x:s.x,y:s.y,z:s.z,yaw:s.yaw,pitch:s.pitch,roll:s.roll,speed:s.speed,throttle:s.throttle,shotsFired:s.shotsFired,firing:s.firing,crashed:s.crashed,gearDown:!!s.gearDown,onGround:!!s.onGround,damage:s.damage||0,damagePart:s.damagePart||null,damageParts,crashImpact}};
}

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
let nextPrune=0;
export async function handleRoomRequest(request,store,now=Date.now()) {
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  let payload;
  try{const text=await request.text();if(text.length>4096)return json({error:'too_large'},413);payload=validate(JSON.parse(text));}catch{return json({error:'invalid_request'},400);}
  if(!payload)return json({error:'invalid_request'},400);
  try{
    if(payload.action==='leave'){await store.leave(payload.room,payload.id,payload.token);return json({ok:true});}
    if(now>=nextPrune){nextPrune=now+60000;await store.prune(now-60000);}
    const failure=await store.upsert(payload,now,now-PRESENCE_TTL);
    if(failure)return json({error:failure},409);
    const peers=await store.peers(payload.room,payload.id,now-PRESENCE_TTL);
    return json({ok:true,room:payload.room,serverNow:now,peers});
  }catch(error){console.error('Multiplayer request failed',error);return json({error:'server_unavailable'},503);}
}

// Ephemeral store for the standalone Node server. A single server process is
// required; Sites uses the shared D1 adapter instead.
export class MemoryRoomStore {
  constructor(){this.players=new Map();}
  async upsert(p,now,cutoff){
    const key=`${p.room}:${p.id}`,existing=this.players.get(key);
    if(existing&&existing.token!==p.token)return 'invalid_session';
    const count=[...this.players.values()].filter(x=>x.room===p.room&&x.id!==p.id&&x.updatedAt>=cutoff).length;
    if(p.action==='create'&&(count>0||existing))return 'room_exists';
    if(p.action==='join'&&count===0)return 'room_not_found';
    if(p.action==='sync'&&!existing)return 'invalid_session';
    if(count>=MAX_PLAYERS)return 'room_full';
    this.players.set(key,{...p,updatedAt:now});return null;
  }
  async peers(room,id,cutoff){return [...this.players.values()].filter(x=>x.room===room&&x.id!==id&&x.updatedAt>=cutoff).map(({id,name,state,updatedAt})=>({id,name,state,updatedAt}));}
  async leave(room,id,token){const key=`${room}:${id}`,p=this.players.get(key);if(p?.token===token)this.players.delete(key);}
  async prune(cutoff){for(const [key,p] of this.players)if(p.updatedAt<cutoff)this.players.delete(key);}
}

// The capacity check and upsert are one SQLite statement to avoid concurrent
// joins exceeding the room limit. Tokens are never included in peer responses.
export class D1RoomStore {
  constructor(db){this.db=db;}
  async upsert(p,now,cutoff){
    const condition=p.action==='create'
      ? 'NOT EXISTS(SELECT 1 FROM fighter_pilots WHERE room=? AND updated_at>=?)'
      : p.action==='join'
        ? `(SELECT COUNT(*) FROM fighter_pilots WHERE room=? AND updated_at>=?) BETWEEN 1 AND ${MAX_PLAYERS-1}`
        : 'EXISTS(SELECT 1 FROM fighter_pilots WHERE room=? AND player_id=? AND token=?)';
    const conditionArgs=p.action==='sync'?[p.room,p.id,p.token]:[p.room,cutoff];
    const result=await this.db.prepare(`INSERT INTO fighter_pilots (room,player_id,token,name,state,updated_at)
      SELECT ?,?,?,?,?,? WHERE ${condition}
      ON CONFLICT(room,player_id) DO UPDATE SET name=excluded.name,state=excluded.state,updated_at=excluded.updated_at
      WHERE fighter_pilots.token=excluded.token`).bind(p.room,p.id,p.token,p.name,JSON.stringify(p.state),now,...conditionArgs).run();
    if((result.meta?.changes||0)>0)return null;
    const count=await this.db.prepare('SELECT COUNT(*) AS count FROM fighter_pilots WHERE room=? AND updated_at>=?').bind(p.room,cutoff).first();
    if(p.action==='create'&&count.count>0)return 'room_exists';
    if(p.action==='join'&&count.count===0)return 'room_not_found';
    if(count.count>=MAX_PLAYERS)return 'room_full';
    return 'invalid_session';
  }
  async peers(room,id,cutoff){
    const result=await this.db.prepare('SELECT player_id,name,state,updated_at FROM fighter_pilots WHERE room=? AND player_id<>? AND updated_at>=? LIMIT ?').bind(room,id,cutoff,MAX_PLAYERS-1).all();
    return result.results.map(p=>({id:p.player_id,name:p.name,state:JSON.parse(p.state),updatedAt:p.updated_at}));
  }
  async leave(room,id,token){await this.db.prepare('DELETE FROM fighter_pilots WHERE room=? AND player_id=? AND token=?').bind(room,id,token).run();}
  async prune(cutoff){await this.db.prepare('DELETE FROM fighter_pilots WHERE updated_at<?').bind(cutoff).run();}
}
