(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HexWar=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const COLS=9,ROWS=15,DURATION=180;
const TYPES={
 castle:{name:'主城',cost:0,hp:800,icon:'castle',description:'守住主城！失守即败。每秒获得 2 金。'},
 mine:{name:'金矿',cost:50,hp:160,icon:'mine',description:'每秒 +3 金币，先发展经济。'},
 barracks:{name:'步兵营',cost:50,hp:210,period:7,icon:'barracks',description:'每 7 秒训练步兵，自动进军占地。'},
 archer:{name:'弓箭营',cost:100,hp:170,period:9,icon:'archer',description:'每 9 秒训练弓手，在后排远程攻击。'},
 tower:{name:'守卫塔',cost:100,hp:320,icon:'tower',description:'攻击附近敌军，稳住防线。'},
 knight:{name:'骑士营',cost:250,hp:280,period:13,icon:'knight',description:'每 13 秒训练重装骑士，强力推进。'},
 mystery:{name:'盲盒地块',cost:25,hp:0,icon:'mystery',description:'随机建成金矿、兵营、守卫塔或骑士营。'}
};
const UNIT={barracks:{hp:66,damage:13,range:0.9,speed:0.75,cooldown:1},archer:{hp:40,damage:12,range:2.15,speed:0.62,cooldown:1.2},knight:{hp:170,damage:27,range:0.95,speed:0.58,cooldown:1.1}};
function rng(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function xy(c,r){return {x:c+(r%2)*0.5,y:r*Math.sqrt(3)/2};}
function neighborsIndex(c,r){const d=r%2?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]];return d.map(([x,y])=>[c+x,r+y]).filter(([x,y])=>x>=0&&x<COLS&&y>=0&&y<ROWS).map(([x,y])=>y*COLS+x);}
function create(seed=Date.now(),difficulty='normal'){
 const random=rng(seed),cells=[];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const lake=(r>=5&&r<=9&&c>=3&&c<=5)||((r===4||r===10)&&c===4);
  const roll=random();const offer=roll<.25?'mine':roll<.55?'barracks':roll<.7?'archer':roll<.82?'tower':roll<.93?'mystery':'knight';
  cells.push({id:r*COLS+c,c,r,...xy(c,r),water:lake,owner:lake?-1:r<7?1:r>7?0:c<4?1:0,building:null,offer,neighbors:neighborsIndex(c,r),flash:0});
 }
 const s={seed,difficulty,random,cells,units:[],gold:[100,100],elapsed:0,aiTimer:3,phase:'ready',winner:null,reason:'',events:[],nextId:1,captures:[0,0],builds:[0,0],kills:[0,0]};
 for(const [id,side]of [[12*COLS+4,0],[2*COLS+4,1]]) cells[id].building=makeBuilding('castle',side);
 // Equal guaranteed opening choices, so every seed has an economy and a military route.
 for(const [r,side]of [[12,0],[2,1]]){
  cells[r*COLS+3].offer='mine';cells[r*COLS+5].offer='barracks';cells[(r+(side?1:-1))*COLS+4].offer='mystery';
 }
 return s;
}
function makeBuilding(type,side){return {type,side,hp:TYPES[type].hp,maxHp:TYPES[type].hp,timer:0,cooldown:0};}
function connected(s,side){const castles=s.cells.filter(c=>c.building?.side===side&&c.building.type==='castle');let seen=new Set(castles.map(c=>c.id)),queue=[...castles];for(let i=0;i<queue.length;i++)for(const id of queue[i].neighbors){const c=s.cells[id];if(!seen.has(id)&&c.building?.side===side&&c.owner===side){seen.add(id);queue.push(c);}}return seen;}
function available(s,side){const links=connected(s,side);return s.cells.filter(c=>!c.water&&c.owner===side&&!c.building&&c.neighbors.some(n=>links.has(n)));}
function purchase(s,id,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 const c=s.cells[id];if(!c||!available(s,side).some(t=>t.id===id))return {ok:false,reason:'只能建造与主城相连的己方地块'};
 const cost=TYPES[c.offer].cost;if(s.gold[side]+1e-8<cost)return {ok:false,reason:'金币不足，等待主城与金矿产出'};
 s.gold[side]-=cost;let type=c.offer;
 if(type==='mystery'){const roll=s.random();type=roll<.3?'mine':roll<.64?'barracks':roll<.83?'archer':roll<.95?'tower':'knight';}
 c.building=makeBuilding(type,side);c.flash=1;s.builds[side]++;s.events.push({type:'build',cell:id,side,kind:type,mystery:c.offer==='mystery'});return {ok:true,type,cost};
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function spawn(s,c){if(s.units.filter(u=>u.side===c.owner).length>=50)return;const t=UNIT[c.building.type];s.units.push({id:s.nextId++,side:c.owner,type:c.building.type,cell:c.id,x:c.x,y:c.y,hp:t.hp,maxHp:t.hp,cooldown:.25,moving:null,waypoint:7*COLS+(c.c>=4?7:1),walk:0,attack:0});}
function path(s,from,goal){const queue=[from],prev=new Map([[from,null]]);for(let i=0;i<queue.length;i++){const id=queue[i];if(id===goal)break;for(const n of s.cells[id].neighbors)if(!s.cells[n].water&&!prev.has(n)){prev.set(n,id);queue.push(n);}}if(!prev.has(goal))return null;let step=goal;while(prev.get(step)!==from&&prev.get(step)!==null)step=prev.get(step);return step===from?null:step;}
function finish(s,winner,reason){if(s.phase==='over')return;s.phase='over';s.winner=winner;s.reason=reason;}
function stats(s,side){return {land:s.cells.filter(c=>c.owner===side&&!c.water).length,gold:Math.floor(s.gold[side]),income:2+s.cells.filter(c=>c.building?.side===side&&c.building.type==='mine').length*3,units:s.units.filter(u=>u.side===side&&u.hp>0).length,buildings:s.cells.filter(c=>c.building?.side===side).length};}
function damageBuilding(s,c,amount,side){const b=c.building;if(!b)return;b.hp-=amount;c.flash=.3;if(b.hp<=0){s.events.push({type:'destroy',cell:c.id,side});c.building=null;c.owner=side;s.captures[side]++;if(b.type==='castle')finish(s,side,side===0?'攻破了敌方主城':'我方主城被攻破');}}
function tick(s,dt){
 if(s.phase!=='playing')return;dt=Math.min(Math.max(dt,0),.1);s.elapsed+=dt;s.gold[0]+=2*dt;s.gold[1]+=2*dt;
 for(const c of s.cells){c.flash=Math.max(0,c.flash-dt);const b=c.building;if(!b)continue;if(b.type==='mine')s.gold[b.side]+=3*dt;
 if(UNIT[b.type]){b.timer+=dt;if(b.timer>=TYPES[b.type].period){b.timer-=TYPES[b.type].period;spawn(s,c);}}
 if(b.type==='tower'||b.type==='castle'){b.cooldown-=dt;const range=b.type==='tower'?2.3:1.45;const target=s.units.filter(u=>u.side!==b.side&&u.hp>0&&distance(c,u)<=range).sort((a,z)=>distance(c,a)-distance(c,z))[0];if(target&&b.cooldown<=0){target.hp-=b.type==='tower'?20:13;target.attack=.18;b.cooldown=.9;s.events.push({type:'shot',from:c.id,to:target.id,side:b.side});}}
 }
 for(const u of s.units){if(u.hp<=0||s.phase!=='playing')continue;const spec=UNIT[u.type];u.cooldown-=dt;u.attack=Math.max(0,u.attack-dt);
 const enemies=s.units.filter(v=>v.side!==u.side&&v.hp>0&&distance(u,v)<=spec.range).sort((a,b)=>distance(u,a)-distance(u,b));
 const target=enemies[0];const buildings=s.cells.filter(c=>c.building&&c.building.side!==u.side&&distance(u,c)<=spec.range);
 if(target||buildings.length){if(u.cooldown<=0){if(target){target.hp-=spec.damage;target.attack=.2;if(target.hp<=0){s.kills[u.side]++;s.gold[u.side]+=5;}}else damageBuilding(s,buildings[0],spec.damage,u.side);u.cooldown=spec.cooldown;s.events.push({type:'hit',x:u.x,y:u.y,side:u.side});}continue;}
 if(u.moving===null){const home=s.cells.find(c=>c.building?.side!==u.side&&c.building?.type==='castle');if(!home)continue;if(u.cell===u.waypoint)u.waypoint=null;u.moving=path(s,u.cell,u.waypoint??home.id);}
 if(u.moving!==null){const dest=s.cells[u.moving];const dist=distance(u,dest),step=spec.speed*dt;if(dist<=step){u.x=dest.x;u.y=dest.y;u.cell=dest.id;u.moving=null;if(!dest.building&&dest.owner!==u.side){dest.owner=u.side;dest.flash=.5;s.captures[u.side]++;s.events.push({type:'capture',cell:dest.id,side:u.side});}}else{u.x+=(dest.x-u.x)/dist*step;u.y+=(dest.y-u.y)/dist*step;}u.walk+=dt;}
 }
 s.units=s.units.filter(u=>u.hp>0);
 s.aiTimer-=dt;if(s.aiTimer<=0){s.aiTimer=s.difficulty==='easy'?4.2:s.difficulty==='hard'?1.6:2.8;ai(s);}
 if(s.elapsed>=DURATION&&s.phase==='playing'){const a=stats(s,0),b=stats(s,1);finish(s,a.land===b.land?null:a.land>b.land?0:1,'时间到，领地更多的一方获胜');}
 if(s.events.length>80)s.events.splice(0,s.events.length-80);
}
function ai(s,side=1){let choices=available(s,side).filter(c=>TYPES[c.offer].cost<=s.gold[side]);const mines=s.cells.filter(c=>c.building?.side===side&&c.building.type==='mine').length;const army=s.cells.filter(c=>c.building?.side===side&&UNIT[c.building.type]).length;choices=choices.map(c=>({cell:c,score:score(c)})).sort((a,b)=>b.score-a.score).map(x=>x.cell);function score(c){let v=s.random()*2;if(c.offer==='mine')v+=mines<2?12:mines<4?5:0;if(c.offer==='barracks')v+=army<2?10:5;if(c.offer==='mystery')v+=4;if(c.offer==='knight')v+=7;if(c.offer==='archer')v+=6;if(c.offer==='tower')v+=s.units.some(u=>u.side!==side&&distance(c,u)<3)?12:1;return v;}
 if(choices.length)purchase(s,choices[0].id,side);
}
return {COLS,ROWS,DURATION,TYPES,UNIT,create,available,purchase,tick,stats,ai,path,finish,neighborsIndex,distance};
});
