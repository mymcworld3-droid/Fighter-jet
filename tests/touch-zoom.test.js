import test from 'node:test';
import assert from 'node:assert/strict';
import {installZoomGuard} from '../src/touch-zoom.js';

class Surface {
  constructor(){this.handlers=new Map();}
  addEventListener(type,handler){this.handlers.set(type,handler);}
  dispatch(type,properties={}){
    const event={cancelable:true,defaultPrevented:false,touches:[],changedTouches:[],timeStamp:0,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;},...properties};
    this.handlers.get(type)(event);return event;
  }
}
const point=(x,y)=>({clientX:x,clientY:y});

test('pinch gestures are blocked without cancelling simultaneous touch starts or releases',()=>{
  const surface=new Surface(),document=new Surface();installZoomGuard(surface,document);
  assert(!surface.dispatch('touchstart',{touches:[point(1,1),point(50,50)]}).defaultPrevented);
  assert(surface.dispatch('touchmove',{touches:[point(1,1),point(55,55)]}).defaultPrevented);
  assert(!surface.dispatch('touchend',{touches:[point(1,1)],changedTouches:[point(55,55)]}).defaultPrevented);
  assert(!surface.dispatch('touchend',{touches:[],changedTouches:[point(1,1)]}).defaultPrevented);
  for(const type of ['gesturestart','gesturechange','gestureend'])assert(document.dispatch(type).defaultPrevented);
  assert(!surface.dispatch('touchmove',{touches:[point(1,1)]}).defaultPrevented);
});

test('double taps on the flight surface are blocked while native buttons keep their clicks',()=>{
  const surface=new Surface(),document=new Surface();installZoomGuard(surface,document);
  assert(!surface.dispatch('touchend',{timeStamp:100,changedTouches:[point(10,10)]}).defaultPrevented);
  assert(surface.dispatch('touchend',{timeStamp:250,changedTouches:[point(12,11)]}).defaultPrevented);
  const button={closest:()=>({})};
  assert(!surface.dispatch('touchend',{timeStamp:400,target:button,changedTouches:[point(20,20)]}).defaultPrevented);
  assert(!surface.dispatch('touchend',{timeStamp:500,target:button,changedTouches:[point(20,20)]}).defaultPrevented);
  assert(surface.dispatch('dblclick').defaultPrevented);
});
