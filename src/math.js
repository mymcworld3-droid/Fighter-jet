export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return v.map(n => n / len);
}
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

export function multiply(a,b) {
  const out = new Float32Array(16);
  for (let col=0; col<4; col++) for (let row=0; row<4; row++) {
    let value=0; for (let k=0; k<4; k++) value+=a[k*4+row]*b[col*4+k];
    out[col*4+row]=value;
  }
  return out;
}
export const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export function perspective(fov,aspect,near,far) {
  const f=1/Math.tan(fov/2), nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
export function lookAt(eye,target,up) {
  const z=normalize(sub(eye,target)), x=normalize(cross(up,z)), y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export function aircraftMatrix(s) {
  const cy=Math.cos(-s.yaw), sy=Math.sin(-s.yaw), cp=Math.cos(s.pitch), sp=Math.sin(s.pitch), cr=Math.cos(s.roll), sr=Math.sin(s.roll);
  const yaw=new Float32Array([cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1]);
  const pitch=new Float32Array([1,0,0,0, 0,cp,sp,0, 0,-sp,cp,0, 0,0,0,1]);
  const roll=new Float32Array([cr,sr,0,0, -sr,cr,0,0, 0,0,1,0, 0,0,0,1]);
  const m=multiply(multiply(yaw,pitch),roll); m[12]=s.x; m[13]=s.y; m[14]=s.z; return m;
}
export function transformPoint(m,p) {
  return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}
