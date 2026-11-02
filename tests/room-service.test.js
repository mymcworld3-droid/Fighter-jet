import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createFlight } from '../src/flight.js';
import { D1RoomStore, MemoryRoomStore, handleRoomRequest, PRESENCE_TTL } from '../server/room-service.js';
import { createGameServer } from '../server.js';
import { MultiplayerClient } from '../src/multiplayer.js';

const payload=(n,room='ABC234')=>({action:'sync',room,id:n.toString(16).padStart(32,'0'),token:n.toString(16).padStart(64,'0'),name:`飛行員${n}`,state:{...createFlight(),firing:false,shotsFired:0}});
const request=p=>new Request('http://localhost/api/multiplayer',{method:'POST',body:JSON.stringify(p)});
const call=async(store,p,now=100000)=>{const r=await handleRoomRequest(request(p),store,now);return {status:r.status,body:await r.json()};};

function sqliteStore(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE fighter_pilots (room TEXT NOT NULL, player_id TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(room,player_id))');
  return new D1RoomStore({prepare(sql){return{bind(...params){const stmt=db.prepare(sql);return{async run(){return{meta:{changes:Number(stmt.run(...params).changes)}}},async all(){return{results:stmt.all(...params)}},async first(){return stmt.get(...params)}};}};}});
}
for(const [name,make] of [['memory',()=>new MemoryRoomStore()],['D1 SQL',sqliteStore]]){
  test(`${name}: players see only peers in their room and can leave`,async()=>{
    const store=make(),a=payload(1),b=payload(2),other=payload(3,'DEF234');
    assert.equal((await call(store,{...b,action:'join'})).body.error,'room_not_found');
    assert.equal((await call(store,{...a,action:'create'})).body.peers.length,0);
    const joined=await call(store,{...b,action:'join'});assert.equal(joined.body.peers[0].name,a.name);
    assert.equal((await call(store,{...other,action:'create'})).body.peers.length,0);
    const result=await call(store,a);assert.equal(result.body.peers[0].id,b.id);
    assert(!JSON.stringify(result.body).includes(b.token));
    await call(store,{action:'leave',room:b.room,id:b.id,token:b.token});
    assert.equal((await call(store,a)).body.peers.length,0);
  });
  test(`${name}: limits rooms, rejects forged sessions, and expires stale players`,async()=>{
    const store=make();for(let i=1;i<=8;i++)assert.equal((await call(store,{...payload(i),action:i===1?'create':'join'})).status,200);
    assert.equal((await call(store,{...payload(9),action:'join'})).status,409);
    assert.equal((await call(store,{...payload(1),token:payload(9).token})).status,409);
    const renewed=await call(store,{...payload(9),action:'create'},100000+PRESENCE_TTL+1);
    assert.equal(renewed.status,200);assert.equal(renewed.body.peers.length,0);
  });
}
test('standalone server exchanges positions between two independent HTTP clients',async(t)=>{
  const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const address=server.address(),url=`http://127.0.0.1:${address.port}/api/multiplayer`,send=p=>fetch(url,{method:'POST',body:JSON.stringify(p)}).then(r=>r.json());
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/`)).status,200);
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/src/multiplayer.js`)).status,200);
  const a=payload(10),b=payload(11);await send({...a,action:'create'});const joined=await send({...b,action:'join'});assert.equal(joined.peers[0].id,a.id);
  b.state.x=512;await send(b);const update=await send(a);assert.equal(update.peers[0].state.x,512);
});
test('two multiplayer clients join, synchronize and remove a departing aircraft',async(t)=>{
  const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const url=`http://127.0.0.1:${server.address().port}`,fetcher=(path,options)=>fetch(url+path,options);
  const state=()=>({...createFlight(),firing:false,shotsFired:0});let spawned=null;
  const a=new MultiplayerClient({getState:state,fetcher}),b=new MultiplayerClient({getState:state,fetcher,onSpawn:s=>{spawned=s;}});
  t.after(()=>{a.leave(false);b.leave(false);});
  await a.connect('ABC234','Alpha','create');await b.connect('ABC234','Bravo','join');
  assert(spawned);assert.equal(b.peers()[0].name,'Alpha');
  a.accept((await a.request('sync')).peers);assert.equal(a.peers()[0].name,'Bravo');
  const departing={action:'leave',room:b.room,id:b.id,token:b.token};
  await fetch(url+'/api/multiplayer',{method:'POST',body:JSON.stringify(departing)});
  a.accept((await a.request('sync')).peers);assert.equal(a.peers().length,0);
});
test('default browser fetch is invoked with the global receiver',async()=>{
  const original=globalThis.fetch;let called=false;
  globalThis.fetch=function(){assert.equal(this,globalThis);called=true;return Promise.resolve(new Response(JSON.stringify({ok:true,peers:[]})));};
  const client=new MultiplayerClient({getState:()=>({...createFlight(),firing:false,shotsFired:0})});
  try{await client.connect('ABC234','Pilot','create');assert(called);}finally{client.leave(false);globalThis.fetch=original;}
});
