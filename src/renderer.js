import { terrainHeight, terrainMeshHeight, terrainMeshNormal, clamp, PARK, TERRAIN_SIZE, WEBGL_TERRAIN_STEPS, CANVAS_TERRAIN_STEPS } from './flight.js';
import { identity, perspective, lookAt, multiply, aircraftMatrix, transformPoint, normalize, cross, sub } from './math.js';
import { cameraFov, chaseCameraOffset, cameraDamping } from './speed-effects.js';
import { SEA_LEVEL, keepCameraAboveSea, clipTerrainAboveSea, horizonLine, oceanScreenGeometry } from './ocean.js';
import { FLIGHT_GATES } from './course.js';
import { terrainOutsideRectangle } from './terrain-geometry.js';
import { WHEEL, COASTER_SEGMENTS, coasterTrack, wheelAngle } from './attractions.js';
import { WRECK_PARTS } from './crash-effects.js';

const VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aAlpha;
uniform mat4 uModel;
uniform mat4 uViewProjection;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vPosition = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uViewProjection * world;
}`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying float vAlpha;
uniform vec3 uCamera;
void main() {
  vec3 light = normalize(vec3(-0.35, 0.85, 0.4));
  float shade = 0.70 + 0.30 * abs(dot(normalize(vNormal), light));
  vec3 color = vColor * shade;
  float fog = smoothstep(3800.0, 17500.0, distance(vPosition, uCamera));
  color = mix(color, vec3(0.69, 0.79, 0.79), fog * 0.92);
  gl_FragColor = vec4(color, vAlpha);
}`;

function shader(gl, type, source) {
  const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader failed');
  return s;
}
function program(gl) {
  const p=gl.createProgram(); gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VERTEX)); gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FRAGMENT)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'WebGL linking failed');
  return p;
}

class Geometry {
  constructor(){this.positions=[];this.normals=[];this.colors=[];this.alphas=[];}
  tri(a,b,c,color,colors,alpha=1) {
    const n=normalize(cross(sub(b,a),sub(c,a)));
    for(let i=0;i<3;i++){this.positions.push(...[a,b,c][i]);this.normals.push(...n);this.colors.push(...(colors?.[i] || color));this.alphas.push(Array.isArray(alpha)?alpha[i]:alpha);}
  }
  quad(a,b,c,d,color,alpha=1){this.tri(a,b,c,color,null,alpha);this.tri(a,c,d,color,null,alpha);}
  box(x,y,z,w,h,d,color){
    const x0=x-w/2,x1=x+w/2,y0=y,y1=y+h,z0=z-d/2,z1=z+d/2;
    this.quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],color);
    this.quad([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],color);
    this.quad([x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],color);
    this.quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],color);
    this.quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],color);
  }
}
function upload(gl,g,usage=gl.STATIC_DRAW){
  const buffer=(data)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),usage);return b;};
  return {position:buffer(g.positions),normal:buffer(g.normals),color:buffer(g.colors),alpha:buffer(g.alphas),count:g.positions.length/3};
}
function replaceGeometry(gl,mesh,g){
  for(const [buffer,data] of [[mesh.position,g.positions],[mesh.normal,g.normals],[mesh.color,g.colors],[mesh.alpha,g.alphas]]){
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
  }
  mesh.count=g.positions.length/3;
}
const colorForHeight=(h,x,z)=>{
  const v=0.94+0.06*Math.sin(x*.003+z*.002);
  let color=h<5?[.58,.65,.52]:h<35?[.45,.59,.43]:h<180?[.28,.46,.35]:h<360?[.35,.47,.40]:[.49,.55,.51];
  const mix=(target,weight)=>{color=color.map((c,i)=>c+(target[i]-c)*clamp(weight,0,1));};
  const region=(cx,cz,rx,rz)=>clamp((1.25-Math.hypot((x-cx)/rx,(z-cz)/rz))*3,0,1);
  mix(h>210?[.62,.43,.29]:[.72,.61,.42],region(-5900,-5900,1950,1900));
  mix(h>550?[.86,.89,.86]:h>250?[.51,.56,.55]:[.38,.52,.46],region(5800,-5500,2000,1900));
  mix(h>260?[.35,.34,.32]:[.43,.47,.39],region(-5900,5500,1850,1900));
  mix([.62,.29,.19],region(-5900,5500,380,380)*clamp((450-h)/180,0,1));
  return color.map(c=>c*v);
};
function makeTerrain(steps=WEBGL_TERRAIN_STEPS){
  const g=new Geometry(), size=TERRAIN_SIZE, start=-size/2, step=size/steps;
  for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){
    const x=start+ix*step,z=start+iz*step;
    const a=[x,terrainHeight(x,z),z], b=[x,terrainHeight(x,z+step),z+step], c=[x+step,terrainHeight(x+step,z+step),z+step], d=[x+step,terrainHeight(x+step,z),z];
    const ca=colorForHeight(a[1],a[0],a[2]),cb=colorForHeight(b[1],b[0],b[2]),cc=colorForHeight(c[1],c[0],c[2]),cd=colorForHeight(d[1],d[0],d[2]);
    for(const vertices of [[{position:a,color:ca},{position:b,color:cb},{position:c,color:cc}],[{position:a,color:ca},{position:c,color:cc},{position:d,color:cd}]]){
      const touchesRunway=x<=63&&x+step>=-63&&z<=180&&z+step>=-1450;
      const pieces=touchesRunway?terrainOutsideRectangle(vertices,{xMin:-63,xMax:63,zMin:-1450,zMax:180}):[vertices];
      for(const piece of pieces){
        const land=clipTerrainAboveSea(piece);
        for(let j=1;j<land.length-1;j++)g.tri(land[0].position,land[j].position,land[j+1].position,null,[land[0].color,land[j].color,land[j+1].color]);
      }
    }
  }
  return g;
}
function flatRect(g,x1,z1,x2,z2,y,color){g.quad([x1,y,z1],[x1,y,z2],[x2,y,z2],[x2,y,z1],color);}
function makeAirport(){
  const g=new Geometry();
  flatRect(g,-63,-1450,63,180,30,[.25,.29,.30]);
  flatRect(g,-59,-1430,-56,160,31,[.82,.84,.76]); flatRect(g,56,-1430,59,160,31,[.82,.84,.76]);
  for(let z=-1370;z<100;z+=120)flatRect(g,-2.3,z,2.3,z+60,31,[.88,.89,.79]);
  for(const z of [-1280,-40])for(let x=-38;x<=38;x+=19)flatRect(g,x-4,z,x+4,z+32,31,[.89,.9,.82]);
  const buildings=[[270,-300,75,36,110],[390,-480,100,44,140],[-290,-800,90,30,125],[330,-880,44,85,44],[-350,-450,80,25,85]];
  for(const [x,z,w,h,d] of buildings){let y=terrainHeight(x,z);g.box(x,y,z,w,h,d,[.53,.57,.53]);g.box(x,y+h,z,w+3,3,d+3,[.34,.39,.39]);}
  g.box(330,terrainHeight(330,-880)+85,-880,60,22,60,[.25,.34,.36]);
  return g;
}
function makeSea(){const g=new Geometry();flatRect(g,-160000,-160000,160000,160000,SEA_LEVEL,[.20,.43,.49]);return g;}
function sphere(g,cx,cy,cz,rx,ry,rz,color,rows=5,cols=8){
  const p=(a,b)=>[cx+rx*Math.sin(a)*Math.cos(b),cy+ry*Math.cos(a),cz+rz*Math.sin(a)*Math.sin(b)];
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const a=i*Math.PI/rows,b=(i+1)*Math.PI/rows,c=j*2*Math.PI/cols,d=(j+1)*2*Math.PI/cols;
    g.quad(p(a,c),p(b,c),p(b,d),p(a,d),color);
  }
}
// Narrow 3D bars keep the structures readable from every camera angle.
function beam(g,a,b,width,color){
  const d=normalize(sub(b,a)),helper=Math.abs(d[1])<.9?[0,1,0]:[1,0,0];
  const u=normalize(cross(d,helper)).map(v=>v*width/2),v=normalize(cross(d,u)).map(n=>n*width/2);
  const p=(base,i,j)=>base.map((n,k)=>n+u[k]*i+v[k]*j);
  const sides=[[1,1],[-1,1],[-1,-1],[1,-1]];
  for(let i=0;i<4;i++){const [a1,a2]=sides[i],[b1,b2]=sides[(i+1)%4];g.quad(p(a,a1,a2),p(a,b1,b2),p(b,b1,b2),p(b,a1,a2),color);}
}
function ring(g,cx,cy,cz,radius,thickness,color,segments=28){
  const pt=(r,t,z)=>[cx+Math.cos(t)*r,cy+Math.sin(t)*r,cz+z];
  for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments,outer=radius+thickness,shade=i%4===0?[.95,.82,.49]:color;
    for(const z of [-5,5])g.quad(pt(radius,a,z),pt(outer,a,z),pt(outer,b,z),pt(radius,b,z),shade);
    g.quad(pt(outer,a,-5),pt(outer,a,5),pt(outer,b,5),pt(outer,b,-5),shade);
    g.quad(pt(radius,b,-5),pt(radius,b,5),pt(radius,a,5),pt(radius,a,-5),shade);
  }
}
function makeFerrisWheel(){
  const g=new Geometry();ring(g,0,0,0,WHEEL.radius,8,[.84,.91,.85],28);
  for(let i=0;i<12;i++){
    const t=i*Math.PI/6,x=Math.cos(t)*WHEEL.radius,y=Math.sin(t)*WHEEL.radius;
    beam(g,[0,0,0],[x,y,0],4,[.72,.82,.79]);
    g.box(x,y-22,0,25,24,24,i%2?[.91,.51,.36]:[.35,.74,.72]);
  }
  return g;
}
function ferrisMatrix(time){
  const m=identity(),a=wheelAngle(time),c=Math.cos(a),s=Math.sin(a);
  m[0]=c;m[1]=s;m[4]=-s;m[5]=c;m[12]=WHEEL.x;m[13]=WHEEL.y;m[14]=WHEEL.z;return m;
}
function makeAttractions(){
  const g=new Geometry(),y=PARK.ground,x=PARK.x,z=PARK.z;
  flatRect(g,x-500,z-470,x+500,z+470,y+1,[.47,.53,.49]);
  flatRect(g,x-470,z-440,x+470,z+440,y+2,[.54,.58,.51]);
  for(const dx of [-110,110])for(const dz of [-18,18])beam(g,[WHEEL.x+dx,y+2,WHEEL.z+dz],[WHEEL.x,WHEEL.y,WHEEL.z+dz],9,[.59,.68,.66]);
  // Twin rails and supports for an undulating miniature roller coaster.
  const track=coasterTrack,segments=COASTER_SEGMENTS;
  for(let i=0;i<segments;i++){
    const a=track(i*Math.PI*2/segments),b=track((i+1)*Math.PI*2/segments);
    for(const offset of [-9,9])beam(g,[a[0],a[1]+offset,a[2]],[b[0],b[1]+offset,b[2]],5,[.83,.40,.25]);
    if(i%4===0)beam(g,[a[0],y+2,a[2]],a,7,[.63,.68,.61]);
  }
  for(const gate of FLIGHT_GATES)ring(g,gate.x,gate.y,gate.z,gate.radius,16,[.28,.87,.78],32);
  for(const [bx,by,bz,color] of [[-850,750,-2300,[.93,.59,.37]],[2100,1050,-4200,[.48,.78,.76]],[-2900,1050,-4700,[.85,.69,.42]]]){
    sphere(g,bx,by,bz,85,105,85,color,5,8);
    g.box(bx,by-155,bz,37,30,37,[.55,.40,.28]);
    for(const dx of [-15,15])beam(g,[bx+dx,by-125,bz],[bx+dx*2,by-80,bz],3,[.83,.82,.69]);
  }
  return g;
}
function makeClouds(count=30,rows=5,cols=8){
  const g=new Geometry(); let seed=3827; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){
    const x=(random()-.5)*18000,z=(random()-.5)*18000,y=1200+random()*800, scale=130+random()*210;
    for(let j=0;j<5;j++)sphere(g,x+(j-2)*scale*.6,y+(random()-.5)*scale*.23,z+(random()-.5)*scale*.45,scale*.75,scale*.23,scale*.42,[.88,.92,.90],rows,cols);
  }
  return g;
}
function makeJet(){
  const g=new Geometry(),metal=[.60,.66,.65],light=[.72,.76,.73],dark=[.34,.40,.41],wing=[.51,.58,.57];
  // Faceted fuselage: points are arranged around each cross section.
  const sections=[[-25,.08,.08],[-18,1.2,.65],[-10,2.3,1.20],[-2,3.15,1.55],[7,3.15,1.60],[15,2.6,1.3],[19,2.0,1.0]];
  const ring=([z,w,h])=>[[0,h,z],[w*.78,h*.55,z],[w,0,z],[w*.72,-h*.68,z],[0,-h,z],[-w*.72,-h*.68,z],[-w,0,z],[-w*.78,h*.55,z]];
  for(let s=0;s<sections.length-1;s++){
    const a=ring(sections[s]),b=ring(sections[s+1]);
    for(let i=0;i<8;i++)g.quad(a[i],b[i],b[(i+1)%8],a[(i+1)%8],i<2||i>5?metal:dark);
  }
  // Main swept wings and elevators, with thickness visible from below.
  for(const side of [-1,1]){
    const p=(x,y,z)=>[side*x,y,z];
    const a=p(2.1,.05,-10),b=p(18,.05,9),c=p(16,.05,12),d=p(3,.05,6);
    g.quad(a,b,c,d,wing);g.quad(p(2.1,-.55,-10),p(3,-.55,6),p(16,-.55,12),p(18,-.55,9),dark);
    g.quad(a,p(2.1,-.55,-10),p(18,-.55,9),b,metal);
    g.quad(p(2,.2,11),p(9,.2,17),p(7,.2,19),p(1.5,.2,16),wing);
    g.quad(p(1.3,1.1,8),p(3.8,6.9,14),p(3.8,6.9,18),p(2.1,1.1,18),metal);
    g.quad(p(1.9,1.12,10),p(3.6,5.9,14.5),p(3.6,5.9,16),p(2.2,1.12,16),dark);
    // Underwing tanks / rails.
    g.box(side*8,-.95,6,1.3,.55,7,[.44,.49,.48]);
    g.quad(p(8.3,.08,6),p(12,.08,9),p(11.4,.08,9.8),p(8.1,.08,7.2),light);
  }
  // Tinted canopy.
  const glass=[.16,.26,.30],glassLight=[.32,.43,.43];
  g.tri([0,1.0,-16],[-1.35,1.35,-8],[0,2.65,-6],glass);
  g.tri([0,1.0,-16],[0,2.65,-6],[1.35,1.35,-8],glassLight);
  g.tri([-1.35,1.35,-8],[-1.15,1.55,-2],[0,2.65,-6],glass);
  g.tri([0,2.65,-6],[1.15,1.55,-2],[1.35,1.35,-8],glassLight);
  g.tri([-1.15,1.55,-2],[0,1.55,1],[0,2.65,-6],glass);
  g.tri([0,2.65,-6],[0,1.55,1],[1.15,1.55,-2],glassLight);
  // Engine exhaust ring. The animated flame is drawn separately.
  const center=[0,0,19.1];
  for(let i=0;i<20;i++){
    const a=i*Math.PI*2/20,b=(i+1)*Math.PI*2/20;
    const p=(r,t,z)=>[Math.cos(t)*r,Math.sin(t)*r,z];
    g.tri(center,p(1.5,a,19.15),p(1.5,b,19.15),[.18,.23,.23]);
    g.tri([0,0,19.3],p(.98,a,19.3),p(.98,b,19.3),[1,.59,.25]);
  }
  return g;
}
function splitJet(jet){
  const groups=Object.fromEntries(WRECK_PARTS.map(part=>[part.id,{geometry:new Geometry(),anchor:part.anchor}]));
  for(let i=0;i<jet.positions.length;i+=9){
    const x=(jet.positions[i]+jet.positions[i+3]+jet.positions[i+6])/3,z=(jet.positions[i+2]+jet.positions[i+5]+jet.positions[i+8])/3;
    const id=x< -4?'left':x>4?'right':z< -8?'nose':z>8?'tail':'body',group=groups[id],g=group.geometry;
    for(let j=0;j<9;j++)g.positions.push(jet.positions[i+j]-group.anchor[j%3]);
    g.normals.push(...jet.normals.slice(i,i+9));g.colors.push(...jet.colors.slice(i,i+9));g.alphas.push(...jet.alphas.slice(i/3,i/3+3));
  }
  return Object.fromEntries(Object.entries(groups).map(([id,g])=>[id,g.geometry]));
}

function makeLandingGear(){
  const g=new Geometry(),strut=[.68,.72,.70],tire=[.16,.19,.20],hub=[.57,.61,.58];
  for(const [x,z,r] of [[0,-15,1.25],[-6.5,7,1.55],[6.5,7,1.55]]){
    g.box(x,-6.35,z,.7,5.15,.85,strut);
    const cy=-6.35,half=.7,segments=12;
    const p=(side,t)=>[x+side*half,cy+Math.cos(t)*r,z+Math.sin(t)*r];
    for(let i=0;i<segments;i++){
      const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
      g.quad(p(-1,a),p(1,a),p(1,b),p(-1,b),tire);
      g.tri([x-half,cy,z],p(-1,b),p(-1,a),hub);
      g.tri([x+half,cy,z],p(1,a),p(1,b),hub);
    }
  }
  return g;
}
function landingGearMatrix(model,extension){
  const gear=identity(),amount=clamp(extension||0,0,1);
  gear[5]=amount;gear[13]=-1.2*(1-amount);
  return multiply(model,gear);
}

function makeGroundShadow(s,ground){
  const g=new Geometry(),height=s.y-ground;
  if(ground<=.25||height>400||height<0)return g;
  const opacity=.40*clamp(1-(height-8)/392,0,1),scale=1+Math.max(0,height-8)*.002;
  const right=[Math.cos(s.yaw),0,Math.sin(s.yaw)],forward=[Math.sin(s.yaw),0,-Math.cos(s.yaw)];
  const center=[s.x,ground+.35,s.z],p=t=>center.map((v,i)=>v+scale*(right[i]*Math.cos(t)*10+forward[i]*Math.sin(t)*23));
  for(let i=0;i<16;i++)g.tri(center,p(i*Math.PI/8),p((i+1)*Math.PI/8),[.04,.09,.09],null,[opacity,0,0]);
  return g;
}

function makeFlame(s,time){
  const g=new Geometry(),power=(clamp(s.throttle,.25,1)-.25)/.75;
  const length=8+power*18+Math.sin(time*22)*1.4, radius=1.25+power*.8;
  for(let i=0;i<16;i++){
    const a=i*Math.PI*2/16,b=(i+1)*Math.PI*2/16;
    const p=(r,t,z)=>[Math.cos(t)*r,Math.sin(t)*r,z];
    g.tri(p(radius,a,19.4),[0,0,19.4+length],p(radius,b,19.4),[1,.42,.12],null,[.8,.08,.8]);
    g.tri(p(radius*.55,a,19.6),[0,0,19.6+length*.7],p(radius*.55,b,19.6),[1,.88,.50],null,[.96,.12,.96]);
  }
  return g;
}
function disc(g,center,right,up,radius,color,opacity){
  const point=t=>[center[0]+radius*(right[0]*Math.cos(t)+up[0]*Math.sin(t)),center[1]+radius*(right[1]*Math.cos(t)+up[1]*Math.sin(t)),center[2]+radius*(right[2]*Math.cos(t)+up[2]*Math.sin(t))];
  for(let i=0;i<8;i++)g.tri(center,point(i*Math.PI/4),point((i+1)*Math.PI/4),color,null,[opacity,0,0]);
}
function solidDisc(g,center,right,up,radius,color,opacity){
  const point=t=>[center[0]+radius*(right[0]*Math.cos(t)+up[0]*Math.sin(t)),center[1]+radius*(right[1]*Math.cos(t)+up[1]*Math.sin(t)),center[2]+radius*(right[2]*Math.cos(t)+up[2]*Math.sin(t))];
  for(let i=0;i<8;i++)g.tri(center,point(i*Math.PI/4),point((i+1)*Math.PI/4),color,null,opacity);
}
function makeWorldEffects(effects,s,eye,look,up){
  const smoke=new Geometry(),shots=new Geometry();
  if(!effects)return {smoke,shots};
  const backwards=normalize(sub(eye,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right);
  for(const particle of effects.exhaust){
    const fraction=particle.age/particle.life;
    disc(smoke,[particle.x,particle.y,particle.z],right,cameraUp,2+fraction*9,[.76,.82,.80],.42*(1-fraction));
  }
  for(const particle of effects.damageSmoke||[]){
    const fraction=particle.age/particle.life;
    disc(smoke,[particle.x,particle.y,particle.z],right,cameraUp,3+fraction*12,[.25,.27,.26],.42*(1-fraction));
  }
  for(const impact of effects.impacts||[]){
    const fade=1-impact.age/impact.life,center=[impact.x,impact.y,impact.z];
    disc(shots,center,right,cameraUp,10,[1,.35,.05],.6*fade);
    solidDisc(shots,center,right,cameraUp,3.5,[1,.90,.52],.9*fade);
  }
  for(const bullet of effects.bullets){
    const p=[bullet.x,bullet.y,bullet.z],direction=normalize([bullet.vx,bullet.vy,bullet.vz]);
    const side=normalize(cross(direction,sub(eye,p))),width=.9+Math.min(2.4,Math.hypot(...sub(eye,p))*.002),tail=p.map((v,i)=>v-direction[i]*48);
    const point=(base,factor)=>base.map((v,i)=>v+side[i]*width*factor);
    // A translucent halo surrounds a narrow white-hot tracer, both attached to the 3D projectile.
    shots.quad(point(p,3.5),point(p,-3.5),point(tail,-1.1),point(tail,1.1),[.14,1,.76],.16);
    shots.quad(point(p,1.05),point(p,-1.05),point(tail,-.30),point(tail,.30),[.25,1,.82],.82);
    shots.quad(point(p,.38),point(p,-.38),point(tail,-.10),point(tail,.10),[.90,1,1],1);
    disc(shots,p,right,cameraUp,width*3.5,[.12,1,.80],.38);
  }
  if(effects.flash>0){
    const model=aircraftMatrix(s);
    const muzzle=transformPoint(model,[0,0,-25.7]);
    disc(shots,muzzle,right,cameraUp,5,[.12,1,.80],.75);
    disc(shots,muzzle,right,cameraUp,1.5,[.92,1,1],.95);
  }
  return {smoke,shots};
}

function makeCrashVisual(crash,eye,look,up){
  const g=new Geometry();if(!crash)return g;
  const backwards=normalize(sub(eye,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right);
  const blastAge=crash.age-crash.explodeAt;
  if(blastAge>=0&&blastAge<.9){
    const fade=1-blastAge/.9,radius=12+blastAge*65,body=crash.pieces[1],center=[body.x,body.y,body.z];
    disc(g,center,right,cameraUp,radius*1.35,[1,.25,.03],.55*fade);
    disc(g,center,right,cameraUp,radius,[1,.60,.10],.85*fade);
    disc(g,center,right,cameraUp,radius*.46,[1,.95,.68],.95*fade);
    solidDisc(g,center,right,cameraUp,radius*.30,[1,.88,.42],.75*fade);
  }
  const flame=clamp((crash.age-.25)/.4,0,1)*clamp(1-crash.age/3.5,0,1);
  if(flame>0)for(const p of [crash.pieces[1],crash.pieces[4]]){
    const center=[p.x,p.y+3,p.z],radius=7+Math.sin(crash.age*22)*1.5;
    disc(g,center,right,cameraUp,radius*1.6,[1,.22,.02],.50*flame);
    disc(g,center,right,cameraUp,radius,[1,.72,.15],.85*flame);
    solidDisc(g,center,right,cameraUp,radius*.38,[1,.62,.09],.68*flame);
  }
  for(const p of crash.smoke){const fraction=p.age/p.life;disc(g,[p.x,p.y,p.z],right,cameraUp,5+fraction*22,[.18,.20,.20],.34*(1-fraction));}
  for(const p of crash.sparks){const fade=1-p.age/p.life;disc(g,[p.x,p.y,p.z],right,cameraUp,2.3,[1,.74,.24],.9*fade);}
  return g;
}

function projectWorld(viewProjection,p,canvas){
  if(!viewProjection)return null;
  const m=viewProjection,[x,y,z]=p;
  const w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=0)return null;
  const nx=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,ny=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;
  if(Math.abs(nx)>1.1||Math.abs(ny)>1.1)return null;
  return {x:(nx*.5+.5)*canvas.clientWidth,y:(.5-ny*.5)*canvas.clientHeight};
}

export class FlightRenderer {
  constructor(canvas){
    this.canvas=canvas; this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl');
    if(!this.gl)throw new Error('WebGL unavailable');
    const gl=this.gl;this.program=program(gl);gl.useProgram(this.program);
    this.attributes=Object.fromEntries(['aPosition','aNormal','aColor','aAlpha'].map(n=>[n,gl.getAttribLocation(this.program,n)]));
    this.uniforms=Object.fromEntries(['uModel','uViewProjection','uCamera'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
    this.sea=upload(gl,makeSea());this.terrain=upload(gl,makeTerrain());this.airport=upload(gl,makeAirport());this.attractions=upload(gl,makeAttractions());this.wheel=upload(gl,makeFerrisWheel());this.clouds=upload(gl,makeClouds());
    const jet=makeJet();this.jet=upload(gl,jet);this.wreck=Object.fromEntries(Object.entries(splitJet(jet)).map(([id,geometry])=>[id,upload(gl,geometry)]));this.gear=upload(gl,makeLandingGear());
    this.dynamic=upload(gl,new Geometry(),gl.DYNAMIC_DRAW);
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);this.camera=null;this.cameraMode='chase';
  }
  toggleCamera(){this.cameraMode=this.cameraMode==='chase'?'nose':'chase';this.camera=null;return this.cameraMode;}
  groundHeight(x,z){return terrainMeshHeight(x,z,WEBGL_TERRAIN_STEPS);}
  groundNormal(x,z){return terrainMeshNormal(x,z,WEBGL_TERRAIN_STEPS);}
  projectPoint(point){return projectWorld(this.viewProjection,point,this.canvas);}
  resize(){
    const ratio=Math.min(window.devicePixelRatio || 1,1.5),w=Math.max(1,Math.floor(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(this.canvas.clientHeight*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}
  }
  drawMesh(mesh,model){
    const gl=this.gl;
    for(const [name,buffer,size] of [['aPosition',mesh.position,3],['aNormal',mesh.normal,3],['aColor',mesh.color,3],['aAlpha',mesh.alpha,1]]){const loc=this.attributes[name];gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
    gl.uniformMatrix4fv(this.uniforms.uModel,false,model);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  render(s,dt,time,effects,peers=[],crash=null){
    this.resize();const gl=this.gl;gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const model=aircraftMatrix(s),body=crash?.pieces[1],cameraFlight=body?{...s,...crash.view,x:body.x,y:body.y,z:body.z}:s,cameraModel=body?aircraftMatrix(cameraFlight):model;
    const desired=keepCameraAboveSea(this.cameraMode==='chase'?transformPoint(cameraModel,chaseCameraOffset(s.speed)):transformPoint(cameraModel,[0,3,-11]));
    // The chase camera rolls gently with the aircraft while preserving the horizon.
    const look=this.cameraMode==='chase'?transformPoint(cameraModel,[0,2,-28]):transformPoint(cameraModel,[0,2,-150]);
    if(!this.camera)this.camera=desired.slice();
    const k=cameraDamping(dt,s.speed,this.cameraMode==='chase');for(let i=0;i<3;i++)this.camera[i]+=(desired[i]-this.camera[i])*k;
    keepCameraAboveSea(this.camera);
    const up=this.cameraMode==='chase'?[Math.sin(-cameraFlight.roll)*.25,1,0]:[cameraModel[4],cameraModel[5],cameraModel[6]];
    const fov=cameraFov(s.speed,this.canvas.clientWidth<this.canvas.clientHeight)*Math.PI/180;
    const projection=perspective(fov,this.canvas.width/this.canvas.height,.5,150000);
    const backwards=normalize(sub(this.camera,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right);
    this.oceanHorizon=horizonLine(right,cameraUp,backwards,this.canvas.width,this.canvas.height,this.canvas.height/(2*Math.tan(fov/2)));
    this.viewProjection=multiply(projection,lookAt(this.camera,look,up));
    gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,this.viewProjection);
    gl.uniform3fv(this.uniforms.uCamera,this.camera);
    const world=identity(),seaModel=identity();seaModel[12]=this.camera[0];seaModel[14]=this.camera[2];
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,2);this.drawMesh(this.sea,seaModel);gl.disable(gl.POLYGON_OFFSET_FILL);
    this.drawMesh(this.terrain,world);this.drawMesh(this.airport,world);this.drawMesh(this.attractions,world);this.drawMesh(this.wheel,ferrisMatrix(time));this.drawMesh(this.clouds,world);
    if(crash){for(const part of crash.pieces)this.drawMesh(this.wreck[part.id],aircraftMatrix(part));}
    else if(this.cameraMode==='chase'){this.drawMesh(this.jet,model);if(s.gearPosition>.01)this.drawMesh(this.gear,landingGearMatrix(model,s.gearPosition));}
    for(const peer of peers){
      if(peer.crash){for(const part of peer.crash.pieces)this.drawMesh(this.wreck[part.id],aircraftMatrix(part));}
      else {const peerModel=aircraftMatrix(peer.flight);this.drawMesh(this.jet,peerModel);if(peer.flight.gearPosition>.01)this.drawMesh(this.gear,landingGearMatrix(peerModel,peer.flight.gearPosition));}
    }
    const fx=makeWorldEffects(effects,s,this.camera,look,up);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    if(!crash){replaceGeometry(gl,this.dynamic,makeGroundShadow(s,this.groundHeight(s.x,s.z)));this.drawMesh(this.dynamic,world);}
    replaceGeometry(gl,this.dynamic,fx.smoke);this.drawMesh(this.dynamic,world);
    if(!s.crashed){replaceGeometry(gl,this.dynamic,makeFlame(s,time));this.drawMesh(this.dynamic,model);}
    replaceGeometry(gl,this.dynamic,fx.shots);this.drawMesh(this.dynamic,world);
    if(crash){replaceGeometry(gl,this.dynamic,makeCrashVisual(crash,this.camera,look,up));this.drawMesh(this.dynamic,world);}
    for(const peer of peers){
      const other=makeWorldEffects(peer.effects,peer.flight,this.camera,look,up);
      replaceGeometry(gl,this.dynamic,other.smoke);this.drawMesh(this.dynamic,world);
      if(!peer.flight.crashed){replaceGeometry(gl,this.dynamic,makeFlame(peer.flight,time));this.drawMesh(this.dynamic,aircraftMatrix(peer.flight));}
      replaceGeometry(gl,this.dynamic,other.shots);this.drawMesh(this.dynamic,world);
      if(peer.crash){replaceGeometry(gl,this.dynamic,makeCrashVisual(peer.crash,this.camera,look,up));this.drawMesh(this.dynamic,world);}
    }
    gl.depthMask(true);gl.disable(gl.BLEND);
  }
}

// Canvas 2D fallback: the same 3D world and aircraft are perspective-projected
// in software when a browser does not offer a WebGL context.
export class SoftwareFlightRenderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas unavailable');
    this.scene=[makeTerrain(CANVAS_TERRAIN_STEPS),makeAirport(),makeAttractions(),makeClouds(8,3,5)];this.wheel=makeFerrisWheel();
    this.jet=makeJet();this.wreck=splitJet(this.jet);this.gear=makeLandingGear();this.camera=null;this.cameraMode='chase';this.lastRender=-1;
  }
  toggleCamera(){this.cameraMode=this.cameraMode==='chase'?'nose':'chase';this.camera=null;return this.cameraMode;}
  groundHeight(x,z){return terrainMeshHeight(x,z,CANVAS_TERRAIN_STEPS);}
  groundNormal(x,z){return terrainMeshNormal(x,z,CANVAS_TERRAIN_STEPS);}
  projectPoint(point){return projectWorld(this.viewProjection,point,this.canvas);}
  render(s,dt,time,effects,peers=[],crash=null){
    if(time-this.lastRender<1/30)return;
    const renderDt=this.lastRender<0?dt:time-this.lastRender;this.lastRender=time;
    const canvas=this.canvas,ratio=Math.min(window.devicePixelRatio||1,1),w=Math.max(1,Math.floor(canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(canvas.clientHeight*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const ctx=this.ctx;ctx.clearRect(0,0,w,h);
    const model=aircraftMatrix(s),body=crash?.pieces[1],cameraFlight=body?{...s,...crash.view,x:body.x,y:body.y,z:body.z}:s,cameraModel=body?aircraftMatrix(cameraFlight):model;
    const desired=keepCameraAboveSea(this.cameraMode==='chase'?transformPoint(cameraModel,chaseCameraOffset(s.speed)):transformPoint(cameraModel,[0,3,-11]));
    const look=this.cameraMode==='chase'?transformPoint(cameraModel,[0,2,-28]):transformPoint(cameraModel,[0,2,-150]);
    if(!this.camera)this.camera=desired.slice();
    const smoothing=cameraDamping(renderDt,s.speed,this.cameraMode==='chase');for(let i=0;i<3;i++)this.camera[i]+=(desired[i]-this.camera[i])*smoothing;
    keepCameraAboveSea(this.camera);
    const up=this.cameraMode==='chase'?[Math.sin(-cameraFlight.roll)*.25,1,0]:[cameraModel[4],cameraModel[5],cameraModel[6]];
    const backwards=normalize(sub(this.camera,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right),eye=this.camera;
    const focal=h/(2*Math.tan(cameraFov(s.speed,canvas.clientWidth<canvas.clientHeight)*Math.PI/360));
    const ocean=oceanScreenGeometry({width:w,height:h,right,up:cameraUp,backwards,focal,eyeY:eye[1]});this.oceanHorizon=ocean.horizon;
    if(ocean.points.length>=3){
      let fill='#356d79';
      if(ocean.gradient){const p=ocean.gradient,gradient=ctx.createLinearGradient(p.x,p.y,p.x2,p.y2);gradient.addColorStop(0,'#abc8c7');gradient.addColorStop(.28,'#6d9da5');gradient.addColorStop(1,'#326e7b');fill=gradient;}
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...ocean.points[0]);for(let i=1;i<ocean.points.length;i++)ctx.lineTo(...ocean.points[i]);ctx.closePath();ctx.fill();
    }
    this.viewProjection=multiply(perspective(cameraFov(s.speed,canvas.clientWidth<canvas.clientHeight)*Math.PI/180,w/h,.5,150000),lookAt(eye,look,up));
    const toCamera=(x,y,z)=>{const a=x-eye[0],b=y-eye[1],c=z-eye[2];return [a*right[0]+b*right[1]+c*right[2],a*cameraUp[0]+b*cameraUp[1]+c*cameraUp[2],-(a*backwards[0]+b*backwards[1]+c*backwards[2])];};
    const project=p=>[w/2+p[0]*focal/p[2],h/2-p[1]*focal/p[2]];
    // Clip against the near plane, so triangles remain valid as the camera moves through them.
    const clip=points=>{
      const out=[];for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],ain=a[2]>=2,bin=b[2]>=2;
        if(ain)out.push(a);
        if(ain!==bin){const t=(2-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,2]);}
      }return out;
    };
    const polygons=[],shadowPolygons=[],ownAircraft=[];
    const collect=(geometry,transform,target=polygons)=>{
      const p=geometry.positions,n=geometry.normals,c=geometry.colors,alpha=geometry.alphas;
      for(let i=0;i<p.length;i+=9){
        const points=[];
        for(let j=0;j<9;j+=3){const v=transform?transformPoint(transform,[p[i+j],p[i+j+1],p[i+j+2]]):[p[i+j],p[i+j+1],p[i+j+2]];points.push(toCamera(...v));}
        if(points.every(v=>v[2]<2)||points.every(v=>v[2]>21000))continue;
        const clipped=clip(points);if(clipped.length<3)continue;
        const projected=clipped.map(project),xs=projected.map(v=>v[0]),ys=projected.map(v=>v[1]);
        if(Math.max(...xs)<0||Math.min(...xs)>w||Math.max(...ys)<0||Math.min(...ys)>h)continue;
        let nx=n[i],ny=n[i+1],nz=n[i+2];
        if(transform){const tx=transform[0]*nx+transform[4]*ny+transform[8]*nz,ty=transform[1]*nx+transform[5]*ny+transform[9]*nz,tz=transform[2]*nx+transform[6]*ny+transform[10]*nz;nx=tx;ny=ty;nz=tz;}
        const shade=.70+.30*Math.abs(nx*(-.34)+ny*.83+nz*.39),depth=clipped.reduce((sum,v)=>sum+v[2],0)/clipped.length;
        const fog=clamp((depth-3800)/(17500-3800),0,1)*.92;
        const rgb=[0,1,2].map((j)=>Math.round(255*clamp(((c[i+j]+c[i+3+j]+c[i+6+j])/3)*shade*(1-fog)+[.69,.79,.79][j]*fog,0,1)));
        const opacity=(alpha[i/3]+alpha[i/3+1]+alpha[i/3+2])/3;
        target.push({points:projected,depth,color:`rgba(${rgb.join(',')},${opacity})`});
      }
    };
    for(const mesh of this.scene)collect(mesh,null);collect(this.wheel,ferrisMatrix(time));
    if(crash){for(const part of crash.pieces)collect(this.wreck[part.id],aircraftMatrix(part),ownAircraft);collect(makeCrashVisual(crash,eye,look,up),null,ownAircraft);}
    else if(this.cameraMode==='chase'){collect(this.jet,model,ownAircraft);if(s.gearPosition>.01)collect(this.gear,landingGearMatrix(model,s.gearPosition),ownAircraft);}
    const fx=makeWorldEffects(effects,s,eye,look,up);if(!crash)collect(makeGroundShadow(s,this.groundHeight(s.x,s.z)),null,shadowPolygons);collect(fx.smoke,null);collect(fx.shots,null);if(!s.crashed)collect(makeFlame(s,time),model);
    for(const peer of peers){
      const otherModel=aircraftMatrix(peer.flight),other=makeWorldEffects(peer.effects,peer.flight,eye,look,up);
      if(peer.crash){for(const part of peer.crash.pieces)collect(this.wreck[part.id],aircraftMatrix(part));collect(makeCrashVisual(peer.crash,eye,look,up),null);}
      else {collect(this.jet,otherModel);if(peer.flight.gearPosition>.01)collect(this.gear,landingGearMatrix(otherModel,peer.flight.gearPosition));}
      collect(other.smoke,null);collect(other.shots,null);if(!peer.flight.crashed)collect(makeFlame(peer.flight,time),otherModel);
    }
    for(const layer of [polygons,shadowPolygons,ownAircraft]){
      layer.sort((a,b)=>b.depth-a.depth);
      for(const poly of layer){ctx.fillStyle=poly.color;ctx.beginPath();ctx.moveTo(...poly.points[0]);for(let j=1;j<poly.points.length;j++)ctx.lineTo(...poly.points[j]);ctx.closePath();ctx.fill();}
    }
  }
}
