export const SEA_LEVEL=0;
export const LAND_CLEARANCE=.25;
export const CAMERA_CLEARANCE=3;

export function keepCameraAboveSea(position){
  position[1]=Math.max(SEA_LEVEL+CAMERA_CLEARANCE,position[1]);
  return position;
}

// Remove submerged terrain before rendering. Intersections keep the original
// height and vertex colors interpolated continuously along each shoreline.
export function clipTerrainAboveSea(vertices,level=SEA_LEVEL+LAND_CLEARANCE){
  if(vertices.every(v=>v.position[1]>=level))return vertices;
  if(vertices.every(v=>v.position[1]<level))return [];
  const out=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=a.position[1]>=level,insideB=b.position[1]>=level;
    if(insideA)out.push(a);
    if(insideA!==insideB){
      const t=(level-a.position[1])/(b.position[1]-a.position[1]);
      out.push({position:a.position.map((x,j)=>x+(b.position[j]-x)*t),color:a.color.map((x,j)=>x+(b.color[j]-x)*t)});
    }
  }
  return out.filter((v,i)=>i===0||v.position.some((n,j)=>Math.abs(n-out[i-1].position[j])>1e-8)).filter((v,i,a)=>i!==a.length-1||v.position.some((n,j)=>Math.abs(n-a[0].position[j])>1e-8));
}

// Horizon coefficients use normalized screen coordinates: a*u+b*v+c=0.
export function horizonLine(right,up,backwards,width,height,focal){
  const a=right[1]*width/focal,b=-up[1]*height/focal;
  return {a,b,c:-.5*a-.5*b-backwards[1]};
}

// Intersect the infinite water plane with the view, rather than sorting two
// enormous water triangles whose depth order changes with the camera.
export function oceanScreenGeometry({width,height,right,up,backwards,focal,eyeY}){
  const horizon=horizonLine(right,up,backwards,width,height,focal);
  const sign=SEA_LEVEL-eyeY>=0?1:-1;
  const evaluate=([x,y])=>sign*(horizon.a*x/width+horizon.b*y/height+horizon.c);
  const corners=[[0,0],[width,0],[width,height],[0,height]],points=[];
  for(let i=0;i<corners.length;i++){
    const a=corners[i],b=corners[(i+1)%corners.length],fa=evaluate(a),fb=evaluate(b),insideA=fa>=0,insideB=fb>=0;
    if(insideA)points.push(a);
    if(insideA!==insideB){const t=fa/(fa-fb);points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  const ax=sign*horizon.a/width,by=sign*horizon.b/height,norm2=ax*ax+by*by;
  if(norm2<1e-16)return {points,horizon,gradient:null};
  const cx=width*.5,cy=height*.5,value=evaluate([cx,cy]),length=Math.sqrt(norm2);
  const x=cx-value*ax/norm2,y=cy-value*by/norm2,distance=Math.min(width,height)*.8;
  return {points,horizon,gradient:{x,y,x2:x+ax/length*distance,y2:y+by/length*distance}};
}
