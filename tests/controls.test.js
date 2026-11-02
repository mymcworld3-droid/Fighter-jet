import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPointerControl, leverValue } from '../src/controls.js';

class FakeControl {
  constructor(){this.listeners={};this.captured=new Set();}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);}
  send(name,id,y=0){const e={pointerId:id,pointerType:'touch',button:0,clientY:y,preventDefault(){}};for(const fn of this.listeners[name]??[])fn(e);}
}
test('joystick, throttle and fire retain independent simultaneous pointers',()=>{
  const stick=new FakeControl(),lever=new FakeControl(),fire=new FakeControl(),events=[];
  const bind=(el,name)=>bindPointerControl(el,{start:e=>events.push(`${name}:start:${e.pointerId}`),move:e=>events.push(`${name}:move:${e.pointerId}`),end:()=>events.push(`${name}:end`)});
  const a=bind(stick,'stick'),b=bind(lever,'lever'),c=bind(fire,'fire');
  stick.send('pointerdown',11);lever.send('pointerdown',22);fire.send('pointerdown',33);
  stick.send('pointermove',11);lever.send('pointermove',22);fire.send('pointerup',33);
  assert(a.active() && b.active() && !c.active());
  lever.send('pointercancel',22);assert(a.active() && !b.active());stick.send('pointerup',11);
  assert.deepEqual(events,['stick:start:11','lever:start:22','fire:start:33','stick:move:11','lever:move:22','fire:end','lever:end','stick:end']);
});
test('throttle lever clamps to 25–100% with full power at the top',()=>{
  const rect={top:100,bottom:300};
  assert.equal(leverValue(113,rect),100);assert.equal(leverValue(287,rect),25);
  assert.equal(leverValue(0,rect),100);assert.equal(leverValue(500,rect),25);
  assert.equal(leverValue(200,rect),63);
});
