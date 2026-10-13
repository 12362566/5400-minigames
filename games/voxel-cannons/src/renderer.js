export const PALETTE = {
  green: {name:'青柠',hex:'#74c95a',light:'#a3e879',dark:'#429940',side:'#59ac48',ink:'#234329',symbol:'◆'},
  pink: {name:'莓果',hex:'#f27a9e',light:'#ffafbd',dark:'#cd527b',side:'#de638c',ink:'#702c48',symbol:'♥'},
  cyan: {name:'晴空',hex:'#59cbdc',light:'#96e9ed',dark:'#279daF',side:'#3ab5ca',ink:'#22596b',symbol:'●'},
  ink: {name:'墨蓝',hex:'#56627c',light:'#8591a8',dark:'#333e58',side:'#424e67',ink:'#fff',symbol:'✦'}
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function polygon(ctx,p,fill,stroke){ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.55;ctx.stroke();}}
function mix(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t);}
export function cannonSVG(color, ammo, options={}){
  const p=PALETTE[color]||PALETTE.green;
  return `<svg viewBox="0 0 80 76" aria-hidden="true" focusable="false"><ellipse cx="40" cy="66" rx="29" ry="6" fill="#243244" opacity=".13"/><path d="M15 50Q13 43 21 42H59Q67 43 65 50L62 61Q59 67 52 67H27Q20 66 18 61Z" fill="${p.dark}"/><path d="M17 44Q17 38 24 37H56Q64 39 64 45L61 57Q59 62 52 62H28Q21 62 19 56Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.4"/><path d="M23 40Q27 36 40 36Q56 36 59 41L55 48H27Z" fill="${p.light}"/><rect x="30" y="5" width="21" height="31" rx="8" fill="${p.dark}"/><rect x="33" y="4" width="17" height="30" rx="7" fill="${p.hex}"/><ellipse cx="41.5" cy="7" rx="8.5" ry="4.5" fill="${p.light}"/><ellipse cx="41.5" cy="7" rx="5.7" ry="2.7" fill="${p.dark}"/><path d="M24 33Q24 22 40 22Q56 22 57 34L55 44Q52 50 40 50Q28 50 25 44Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.3"/><path d="M29 28Q38 22 49 27" fill="none" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/><text x="40" y="41" text-anchor="middle" font-family="ui-rounded,system-ui,sans-serif" font-size="16" font-weight="900" fill="white" stroke="${p.dark}" stroke-width="3" paint-order="stroke">${ammo}</text><path d="M24 54H30M50 54H56" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/></svg>`;
}
export class VoxelRenderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});
    this.cache=document.createElement('canvas');this.bctx=this.cache.getContext('2d');
    this.state=null;this.level=null;this.lastRevision='';this.bullets=[];this.particles=[];this.rings=[];
    this.time=0;this.reduced=false;this.frame=0;this.lastPaint=0;this.width=1;this.height=1;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  }
  resize(){
    const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;
    this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);
    this.cache.width=this.canvas.width;this.cache.height=this.canvas.height;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.bctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.layout();this.lastRevision='';
  }
  setState(state,level){this.state=state;this.level=level;this.bullets=[];this.particles=[];this.rings=[];this.sorted=state.voxels.slice().sort((a,b)=>(a.x-a.z+a.y*.7)-(b.x-b.z+b.y*.7));this.layout();this.lastRevision='';}
  layout(){
    if(!this.level)return;
    const l=this.level,w=l.width,d=l.depth,h=l.height;
    const rawW=w+d*.38,rawH=w*.15+d*.70+h*.90;
    const top=this.height<230?10:18,bottom=this.height<230?27:42;
    this.scale=Math.min((this.width-30)/rawW,(this.height-top-bottom)/rawH);
    this.scale=Math.max(1,this.scale);
    this.originX=(this.width-rawW*this.scale)/2+d*.38*this.scale;
    const freeHeight=Math.max(0,this.height-top-bottom-rawH*this.scale);
    this.originY=top+freeHeight*.48+rawH*this.scale;
    this.modelBounds={left:(this.width-rawW*this.scale)/2,top:top+freeHeight*.48,width:rawW*this.scale,height:rawH*this.scale};
  }
  point(x,y,z){return [this.originX+(x-z*.38)*this.scale,this.originY+(-x*.15-z*.70-y*.90)*this.scale];}
  frontPoint(v){return this.point(v.x+.5,v.y+.5,v.z);}
  sourcePoint(slot){return [this.width*(.16+slot*.17),this.height+5];}
  events(events){
    for(const e of events){if(e.type==='shot'){
      const end=this.frontPoint(e.target),start=this.sourcePoint(e.slotIndex),duration=.15+Math.abs(end[1]-start[1])/1500;
      this.bullets.push({start,end,color:e.color,t:0,duration,target:e.target,seed:(e.target.id*17||this.frame)%997});
    }}
  }
  drawBoard(){
    const c=this.bctx;c.clearRect(0,0,this.width,this.height);if(!this.state)return;
    const l=this.level,s=this.scale;
    // Low, dark-rimmed display plinth gives every sculpture a stable footprint.
    const footprint=[this.point(-.7,-.22,-.6),this.point(l.width+.7,-.22,-.6),this.point(l.width+.7,-.22,l.depth+.6),this.point(-.7,-.22,l.depth+.6)];
    const shadow=footprint.map(p=>[p[0]+s*.45,p[1]+s*.9]);polygon(c,shadow,'rgba(68,50,70,.10)');
    const lower=footprint.map(p=>[p[0],p[1]+s*.4]);
    polygon(c,[footprint[0],footprint[1],lower[1],lower[0]],'#454157');
    polygon(c,[footprint[1],footprint[2],lower[2],lower[1]],'#39384e');
    polygon(c,footprint,'#777089','#514962');
    const rim=[this.point(-.28,-.15,-.24),this.point(l.width+.28,-.15,-.24),this.point(l.width+.28,-.15,l.depth+.24),this.point(-.28,-.15,l.depth+.24)];
    polygon(c,rim,'#e5d7dc');
    // Exposed faces only. Every cube occupies an actual 3D grid coordinate.
    const occupied=new Set(this.state.voxels.filter(v=>v.alive).map(v=>`${v.x},${v.y},${v.z}`));
    const has=(x,y,z)=>occupied.has(`${x},${y},${z}`);
    for(const v of this.sorted){
      if(!v.alive)continue;
      const top=!has(v.x,v.y+1,v.z),front=!has(v.x,v.y,v.z-1),right=!has(v.x+1,v.y,v.z);
      if(!top&&!front&&!right)continue;
      const p=PALETTE[v.color],x=v.x,y=v.y,z=v.z,gap=.035;
      const a=this.point(x+gap,y+gap,z+gap),b=this.point(x+1-gap,y+gap,z+gap),c0=this.point(x+1-gap,y+1-gap,z+gap),d0=this.point(x+gap,y+1-gap,z+gap);
      const e=this.point(x+gap,y+1-gap,z+1-gap),f=this.point(x+1-gap,y+1-gap,z+1-gap),g=this.point(x+1-gap,y+gap,z+1-gap);
      if(front){polygon(c,[a,b,c0,d0],p.hex,p.dark);if(s>8){c.strokeStyle=p.light;c.lineWidth=.6;c.beginPath();c.moveTo(d0[0]+.7,d0[1]+.8);c.lineTo(c0[0]-.7,c0[1]+.8);c.stroke();}}
      if(right)polygon(c,[b,g,f,c0],p.side,p.dark);
      if(top){polygon(c,[d0,c0,f,e],p.light,p.hex);if(s>10){const center=mix(mix(d0,c0,.5),mix(e,f,.5),.5);const inset=[d0,c0,f,e].map(q=>mix(center,q,.55));polygon(c,inset,p.hex);c.globalAlpha=.35;polygon(c,inset,p.light);c.globalAlpha=1;}}
    }
    // Inset ticks signal the shooting edge without explanatory UI.
    c.strokeStyle='rgba(255,255,255,.65)';c.lineWidth=2;
    for(let i=0;i<5;i++){const q=this.point(l.width*(.13+.18*i),-.6,-.5);c.beginPath();c.moveTo(q[0]-s*.28,q[1]);c.lineTo(q[0]+s*.28,q[1]-s*.07);c.stroke();}
  }
  burst(b){
    const p=PALETTE[b.color];this.rings.push({x:b.end[0],y:b.end[1],t:0,color:p.light});
    if(this.reduced)return;
    for(let i=0;i<6;i++){const angle=(b.seed*.47+i*2.399),speed=25+(i%3)*18;this.particles.push({x:b.end[0],y:b.end[1],vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-24,t:0,size:2.5+(i%3),color:i%2?p.light:p.hex});}
  }
  render(dt){
    this.time+=dt;this.frame++;const c=this.ctx;
    const revision=this.state?`${this.state.levelIndex}:${this.state.hits}:${this.width}:${this.height}`:'';
    if(revision!==this.lastRevision){this.drawBoard();this.lastRevision=revision;}
    c.clearRect(0,0,this.width,this.height);c.drawImage(this.cache,0,0,this.width,this.height);
    for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.t+=dt;const t=clamp(b.t/b.duration,0,1);if(t>=1){this.burst(b);this.bullets.splice(i,1);continue;}
      const q=mix(b.start,b.end,t),tail=mix(b.start,b.end,Math.max(0,t-.17));
      c.beginPath();c.moveTo(tail[0],tail[1]);c.lineTo(q[0],q[1]);c.lineWidth=this.reduced?2:4;c.lineCap='round';c.strokeStyle=PALETTE[b.color].light;c.stroke();
      c.beginPath();c.moveTo(tail[0],tail[1]);c.lineTo(q[0],q[1]);c.lineWidth=1.8;c.strokeStyle='#fffef4';c.stroke();
      c.beginPath();c.arc(q[0],q[1],2.8,0,Math.PI*2);c.fillStyle='#fff';c.fill();
    }
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.t+=dt;if(r.t>.23){this.rings.splice(i,1);continue;}c.globalAlpha=(1-r.t/.23)*.7;c.strokeStyle=r.color;c.lineWidth=2;c.beginPath();c.arc(r.x,r.y,3+r.t*35,0,Math.PI*2);c.stroke();}
    c.globalAlpha=1;
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.t+=dt;if(p.t>.58){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;c.globalAlpha=1-p.t/.58;c.fillStyle=p.color;c.save();c.translate(p.x,p.y);c.rotate(p.t*4);c.fillRect(-p.size/2,-p.size/2,p.size,p.size);c.restore();}c.globalAlpha=1;
  }
  destroy(){this.observer.disconnect();}
}
