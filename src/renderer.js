import { terrainHeight, clamp } from './flight.js';
import { identity, perspective, lookAt, multiply, aircraftMatrix, transformPoint, normalize, cross, sub } from './math.js';

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
uniform float uWater;
uniform float uTime;
void main() {
  vec3 light = normalize(vec3(-0.35, 0.85, 0.4));
  float shade = 0.70 + 0.30 * abs(dot(normalize(vNormal), light));
  vec3 color = vColor * shade;
  if (uWater > 0.5) {
    float waves = sin(vPosition.x * 0.006 + uTime * 0.3) * sin(vPosition.z * 0.008 - uTime * 0.22);
    color += vec3(0.018, 0.038, 0.043) * waves;
  }
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
  if(h<5)return [0.58*v,0.65*v,0.52*v];
  if(h<35)return [0.45*v,0.59*v,0.43*v];
  if(h<180)return [0.28*v,0.46*v,0.35*v];
  if(h<360)return [0.35*v,0.47*v,0.40*v];
  return [0.49*v,0.55*v,0.51*v];
};
function makeTerrain(steps=150){
  const g=new Geometry(), size=18000, start=-size/2, step=size/steps;
  for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){
    const x=start+ix*step,z=start+iz*step;
    const a=[x,terrainHeight(x,z),z], b=[x,terrainHeight(x,z+step),z+step], c=[x+step,terrainHeight(x+step,z+step),z+step], d=[x+step,terrainHeight(x+step,z),z];
    const ca=colorForHeight(a[1],a[0],a[2]),cb=colorForHeight(b[1],b[0],b[2]),cc=colorForHeight(c[1],c[0],c[2]),cd=colorForHeight(d[1],d[0],d[2]);
    g.tri(a,b,c,null,[ca,cb,cc]);g.tri(a,c,d,null,[ca,cc,cd]);
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
function makeSea(){const g=new Geometry();flatRect(g,-100000,-100000,100000,100000,-1,[.20,.43,.49]);return g;}
function sphere(g,cx,cy,cz,rx,ry,rz,color,rows=5,cols=8){
  const p=(a,b)=>[cx+rx*Math.sin(a)*Math.cos(b),cy+ry*Math.cos(a),cz+rz*Math.sin(a)*Math.sin(b)];
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const a=i*Math.PI/rows,b=(i+1)*Math.PI/rows,c=j*2*Math.PI/cols,d=(j+1)*2*Math.PI/cols;
    g.quad(p(a,c),p(b,c),p(b,d),p(a,d),color);
  }
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
function makeWorldEffects(effects,s,eye,look,up){
  const smoke=new Geometry(),shots=new Geometry();
  if(!effects)return {smoke,shots};
  const backwards=normalize(sub(eye,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right);
  for(const particle of effects.exhaust){
    const fraction=particle.age/particle.life;
    disc(smoke,[particle.x,particle.y,particle.z],right,cameraUp,2+fraction*9,[.76,.82,.80],.42*(1-fraction));
  }
  for(const bullet of effects.bullets){
    const p=[bullet.x,bullet.y,bullet.z],direction=normalize([bullet.vx,bullet.vy,bullet.vz]);
    const side=normalize(cross(direction,sub(eye,p))),width=2.4+Math.min(3,Math.hypot(...sub(eye,p))*.002),tail=p.map((v,i)=>v-direction[i]*48);
    const point=(base,factor)=>base.map((v,i)=>v+side[i]*width*factor);
    shots.quad(point(p,1),point(p,-1),point(tail,-.35),point(tail,.35),[1,.95,.55],1);
  }
  if(effects.flash>0){
    const model=aircraftMatrix(s);
    for(const side of [-1,1])disc(shots,transformPoint(model,[side*1.3,0,-20]),right,cameraUp,4.2,[1,.74,.29],.9);
  }
  return {smoke,shots};
}

export class FlightRenderer {
  constructor(canvas){
    this.canvas=canvas; this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl');
    if(!this.gl)throw new Error('WebGL unavailable');
    const gl=this.gl;this.program=program(gl);gl.useProgram(this.program);
    this.attributes=Object.fromEntries(['aPosition','aNormal','aColor','aAlpha'].map(n=>[n,gl.getAttribLocation(this.program,n)]));
    this.uniforms=Object.fromEntries(['uModel','uViewProjection','uCamera','uWater','uTime'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
    this.sea=upload(gl,makeSea());this.terrain=upload(gl,makeTerrain());this.airport=upload(gl,makeAirport());this.clouds=upload(gl,makeClouds());this.jet=upload(gl,makeJet());
    this.dynamic=upload(gl,new Geometry(),gl.DYNAMIC_DRAW);
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);this.camera=null;this.cameraMode='chase';
  }
  toggleCamera(){this.cameraMode=this.cameraMode==='chase'?'nose':'chase';this.camera=null;return this.cameraMode;}
  resize(){
    const ratio=Math.min(window.devicePixelRatio || 1,1.5),w=Math.max(1,Math.floor(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(this.canvas.clientHeight*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}
  }
  drawMesh(mesh,model,water=0){
    const gl=this.gl;
    for(const [name,buffer,size] of [['aPosition',mesh.position,3],['aNormal',mesh.normal,3],['aColor',mesh.color,3],['aAlpha',mesh.alpha,1]]){const loc=this.attributes[name];gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
    gl.uniformMatrix4fv(this.uniforms.uModel,false,model);gl.uniform1f(this.uniforms.uWater,water);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  render(s,dt,time,effects){
    this.resize();const gl=this.gl;gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const model=aircraftMatrix(s);
    const desired=this.cameraMode==='chase'?transformPoint(model,[0,19,72]):transformPoint(model,[0,3,-11]);
    // The chase camera rolls gently with the aircraft while preserving the horizon.
    const look=this.cameraMode==='chase'?transformPoint(model,[0,2,-28]):transformPoint(model,[0,2,-150]);
    if(!this.camera)this.camera=desired.slice();
    const k=1-Math.exp(-clamp(dt,0,0.25)*5);for(let i=0;i<3;i++)this.camera[i]+=(desired[i]-this.camera[i])*k;
    const up=this.cameraMode==='chase'?[Math.sin(-s.roll)*.25,1,0]:[model[4],model[5],model[6]];
    const projection=perspective((this.canvas.clientWidth<this.canvas.clientHeight?68:58)*Math.PI/180,this.canvas.width/this.canvas.height,.5,150000);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,multiply(projection,lookAt(this.camera,look,up)));
    gl.uniform3fv(this.uniforms.uCamera,this.camera);gl.uniform1f(this.uniforms.uTime,time);
    const world=identity();this.drawMesh(this.sea,world,1);this.drawMesh(this.terrain,world);this.drawMesh(this.airport,world);this.drawMesh(this.clouds,world);
    if(this.cameraMode==='chase')this.drawMesh(this.jet,model);
    const fx=makeWorldEffects(effects,s,this.camera,look,up);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    replaceGeometry(gl,this.dynamic,fx.smoke);this.drawMesh(this.dynamic,world);
    if(!s.crashed){replaceGeometry(gl,this.dynamic,makeFlame(s,time));this.drawMesh(this.dynamic,model);}
    replaceGeometry(gl,this.dynamic,fx.shots);this.drawMesh(this.dynamic,world);
    gl.depthMask(true);gl.disable(gl.BLEND);
  }
}

// Canvas 2D fallback: the same 3D world and aircraft are perspective-projected
// in software when a browser does not offer a WebGL context.
export class SoftwareFlightRenderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas unavailable');
    this.scene=[makeSea(),makeTerrain(34),makeAirport(),makeClouds(8,3,5)];
    this.jet=makeJet();this.camera=null;this.cameraMode='chase';this.lastRender=-1;
  }
  toggleCamera(){this.cameraMode=this.cameraMode==='chase'?'nose':'chase';this.camera=null;return this.cameraMode;}
  render(s,dt,time,effects){
    if(time-this.lastRender<1/30)return;this.lastRender=time;
    const canvas=this.canvas,ratio=Math.min(window.devicePixelRatio||1,1),w=Math.max(1,Math.floor(canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(canvas.clientHeight*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const ctx=this.ctx;ctx.clearRect(0,0,w,h);
    const model=aircraftMatrix(s),desired=this.cameraMode==='chase'?transformPoint(model,[0,19,72]):transformPoint(model,[0,3,-11]);
    const look=this.cameraMode==='chase'?transformPoint(model,[0,2,-28]):transformPoint(model,[0,2,-150]);
    if(!this.camera)this.camera=desired.slice();
    const smoothing=1-Math.exp(-clamp(dt,0,.25)*5);for(let i=0;i<3;i++)this.camera[i]+=(desired[i]-this.camera[i])*smoothing;
    const up=this.cameraMode==='chase'?[Math.sin(-s.roll)*.25,1,0]:[model[4],model[5],model[6]];
    const backwards=normalize(sub(this.camera,look)),right=normalize(cross(up,backwards)),cameraUp=cross(backwards,right),eye=this.camera;
    const focal=h/(2*Math.tan((canvas.clientWidth<canvas.clientHeight?68:58)*Math.PI/360));
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
    const polygons=[];
    const collect=(geometry,transform)=>{
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
        polygons.push({points:projected,depth,color:`rgba(${rgb.join(',')},${opacity})`});
      }
    };
    for(const mesh of this.scene)collect(mesh,null);if(this.cameraMode==='chase')collect(this.jet,model);
    const fx=makeWorldEffects(effects,s,eye,look,up);collect(fx.smoke,null);collect(fx.shots,null);if(!s.crashed)collect(makeFlame(s,time),model);
    polygons.sort((a,b)=>b.depth-a.depth);
    for(const poly of polygons){ctx.fillStyle=poly.color;ctx.beginPath();ctx.moveTo(...poly.points[0]);for(let j=1;j<poly.points.length;j++)ctx.lineTo(...poly.points[j]);ctx.closePath();ctx.fill();}
  }
}
