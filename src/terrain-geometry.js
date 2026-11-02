// Cut terrain out under the runway so its surface cannot be hidden by a
// larger ground triangle in the Canvas renderer's depth sorting.
export function terrainOutsideRectangle(vertices,{xMin,xMax,zMin,zMax}){
  const axisClip=(polygon,axis,limit,keepGreater)=>{
    const out=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const insideA=keepGreater?a.position[axis]>=limit:a.position[axis]<=limit;
      const insideB=keepGreater?b.position[axis]>=limit:b.position[axis]<=limit;
      if(insideA)out.push(a);
      if(insideA!==insideB){
        const t=(limit-a.position[axis])/(b.position[axis]-a.position[axis]);
        out.push({position:a.position.map((n,j)=>n+(b.position[j]-n)*t),color:a.color.map((n,j)=>n+(b.color[j]-n)*t)});
      }
    }
    return out.filter((v,i)=>i===0||v.position.some((n,j)=>Math.abs(n-out[i-1].position[j])>1e-8))
      .filter((v,i,a)=>i!==a.length-1||v.position.some((n,j)=>Math.abs(n-a[0].position[j])>1e-8));
  };
  const middle=axisClip(axisClip(vertices,0,xMin,true),0,xMax,false);
  const pieces=[axisClip(vertices,0,xMin,false),axisClip(vertices,0,xMax,true),axisClip(middle,2,zMin,false),axisClip(middle,2,zMax,true)];
  return pieces.filter(p=>p.length>=3&&Math.abs(p.reduce((sum,v,i)=>sum+v.position[0]*p[(i+1)%p.length].position[2]-p[(i+1)%p.length].position[0]*v.position[2],0))>1e-6);
}
