export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const rand = (a,b)=>a+Math.random()*(b-a);
export const dist2 = (ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy;};
export const hypot = (x,y)=>Math.hypot(x,y) || 0.000001;
export const wrapAngle = (a)=>{ while(a>Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; };
export const norm = (x,y)=>{ const d=hypot(x,y); return {x:x/d,y:y/d}; };
