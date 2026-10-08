(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HexWar=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const COLS=9,ROWS=15,DURATION=180;
const FACTIONS=[
 {id:0,name:'金曜王国',label:'你',color:'#d4e879',light:'#ebf6ac',dark:'#718839'},
 {id:1,name:'赤焰军团',label:'赤',color:'#e1846d',light:'#ffb99e',dark:'#a44e44'},
 {id:2,name:'苍蓝同盟',label:'蓝',color:'#78bfe0',light:'#b4e4f5',dark:'#397d9d'},
 {id:3,name:'紫曜公国',label:'紫',color:'#b895e0',light:'#e2c8fa',dark:'#7652a0'}
];
const MODES={duel:{name:'经典对决',players:2,description:'你 + 1 个 AI'},trio:{name:'三方混战',players:3,description:'你 + 2 个 AI'},quad:{name:'四国争霸',players:4,description:'你 + 3 个 AI'}};
const MAPS={lake:{name:'双岸之争',description:'绕湖包抄，守住两岸'},crossroads:{name:'三桥争夺',description:'三座陆桥，抢占要道'},rift:{name:'裂谷走廊',description:'曲折水道，多线进军'},random:{name:'迷雾群岛',description:'种子随机地图，每局不同'}};
const TYPES={
 castle:{name:'主城',cost:0,hp:800,icon:'castle',description:'守住主城！失守即败。每秒获得 2 金。'},
 mine:{name:'金矿',cost:50,hp:160,icon:'mine',description:'每秒 +3 金币，先发展经济。'},
 barracks:{name:'步兵营',cost:50,hp:210,period:7,icon:'barracks',description:'每 7 秒训练步兵，自动进军占地。'},
 archer:{name:'弓箭营',cost:100,hp:170,period:9,icon:'archer',description:'每 9 秒训练弓手，在后排远程攻击。'},
 tower:{name:'守卫塔',cost:100,hp:320,icon:'tower',description:'攻击附近敌军，稳住防线。'},
 knight:{name:'骑士营',cost:250,hp:280,period:13,icon:'knight',description:'每 13 秒训练重装骑士，强力推进。'},
 mystery:{name:'盲盒地块',cost:25,hp:0,icon:'mystery',description:'随机建成金矿、兵营、守卫塔或骑士营。'}
};
const UNIT={barracks:{hp:66,damage:13,range:.9,speed:.75,cooldown:1},archer:{hp:40,damage:12,range:2.15,speed:.62,cooldown:1.2},knight:{hp:170,damage:27,range:.95,speed:.58,cooldown:1.1}};
const UPGRADES={economy:{name:'精炼采矿',description:'每座金矿 +1 金/秒',costs:[100,180],max:2},training:{name:'急行训练',description:'训练速度 +15%',costs:[120,200],max:2},armor:{name:'精钢护甲',description:'所有部队生命 +20%',costs:[120,200],max:2}};
function rng(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function xy(c,r){return {x:c+(r%2)*.5,y:r*Math.sqrt(3)/2};}
function neighborsIndex(c,r){const d=r%2?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]];return d.map(([x,y])=>[c+x,r+y]).filter(([x,y])=>x>=0&&x<COLS&&y>=0&&y<ROWS).map(([x,y])=>y*COLS+x);}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function flood(cells,from,ignoreWater=false){const d=new Map([[from,0]]),q=[from];for(let i=0;i<q.length;i++)for(const n of cells[q[i]].neighbors)if(!d.has(n)&&(ignoreWater||!cells[n].water)){d.set(n,d.get(q[i])+1);q.push(n);}return d;}
function create(seed=Date.now(),difficulty='normal',options={}){
 options=options&&typeof options==='object'?options:{};seed=Number(seed)>>>0;difficulty=['easy','normal','hard'].includes(difficulty)?difficulty:'normal';
 const mode=Object.prototype.hasOwnProperty.call(MODES,options.mode)?options.mode:'duel',map=Object.prototype.hasOwnProperty.call(MAPS,options.map)?options.map:'lake',count=MODES[mode].players,classic=mode==='duel'&&map==='lake';
 const random=rng(seed),cells=[],bases=count===2?[112,22]:count===3?[112,20,24]:[110,20,24,114];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const lake=(r>=5&&r<=9&&c>=3&&c<=5)||((r===4||r===10)&&c===4);
  let water=map==='lake'?lake:map==='crossroads'?(r===7&&![1,4,7].includes(c))||([5,6,8,9].includes(r)&&c===4):map==='rift'?(r>=4&&r<=10&&r!==7&&[3,5].includes(c))||([5,9].includes(r)&&c===4):random()<.18;
  const roll=random(),offer=roll<.25?'mine':roll<.55?'barracks':roll<.7?'archer':roll<.82?'tower':roll<.93?'mystery':'knight';
  cells.push({id:r*COLS+c,c,r,...xy(c,r),water,owner:-1,building:null,outpost:null,offer,neighbors:neighborsIndex(c,r),flash:0});
 }
 // Clear identical opening rings, and connect every land component. Water never strands a castle or objective.
 if(!classic){for(const id of bases)for(const [n,d]of flood(cells,id,true))if(d<=2)cells[n].water=false;
  for(const c of cells){if(c.water)continue;let reachable=flood(cells,bases[0]);if(reachable.has(c.id))continue;let at=c.id;while(!reachable.has(at)){cells[at].water=false;at=cells[at].neighbors.slice().sort((a,b)=>distance(cells[a],cells[bases[0]])-distance(cells[b],cells[bases[0]]))[0];}cells[at].water=false;}
 }
 const s={seed,difficulty,mode,map,classic,random,cells,bases,sides:FACTIONS.slice(0,count).map(f=>({...f})),alive:Array(count).fill(true),eliminated:[],units:[],gold:Array(count).fill(100),upgrades:Array.from({length:count},()=>({economy:0,training:0,armor:0})),elapsed:0,aiTimer:3,aiTimers:Array.from({length:count},(_,i)=>3+i*.35),phase:'ready',winner:null,resultKind:null,tiedSides:[],reason:'',events:[],nextId:1,captures:Array(count).fill(0),builds:Array(count).fill(0),kills:Array(count).fill(0)};
 if(classic){for(const c of cells)c.owner=c.water?-1:c.r<7?1:c.r>7?0:c.c<4?1:0;}
 else{
  // Round-robin expansion guarantees exactly 15 connected opening cells per faction.
  bases.forEach((id,side)=>{cells[id].owner=side;});
  for(let round=1;round<15;round++)for(let side=0;side<count;side++){
   const frontier=cells.filter(c=>!c.water&&c.owner===-1&&c.neighbors.some(n=>cells[n].owner===side));
   frontier.sort((a,b)=>distance(a,cells[bases[side]])-distance(b,cells[bases[side]])||a.id-b.id);
   if(frontier[0])frontier[0].owner=side;
  }
 }
 bases.forEach((id,side)=>{
  const c=cells[id];c.water=false;c.owner=side;c.building=makeBuilding('castle',side);
  const adjacent=c.neighbors.map(n=>cells[n]).filter(n=>!n.water&&n.owner===side);
  adjacent.sort((a,b)=>a.c-b.c||a.r-b.r);
  // Preserve classic opening IDs and routes for regression and familiar play.
  if(classic){cells[id-1].offer='mine';cells[id+1].offer='barracks';cells[id+(side?COLS:-COLS)].offer='mystery';}
  else{const opening=['mine','mystery','archer','tower','mine','barracks'];adjacent.forEach((tile,i)=>{tile.offer=opening[i%opening.length];});}
 });
 if(!classic){
  const candidates=[64,70,67];for(let i=0;i<candidates.length;i++){
   const desired=cells[candidates[i]],c=cells.filter(c=>!c.water&&c.owner===-1&&!c.outpost).sort((a,b)=>distance(a,desired)-distance(b,desired)||a.id-b.id)[0];
   if(c){c.outpost=i===2?'rally':'gold';c.offer=null;}
  }
 }
 return s;
}
function makeBuilding(type,side){return {type,side,hp:TYPES[type].hp,maxHp:TYPES[type].hp,timer:0,cooldown:0};}
function isAlive(s,side){return Number.isInteger(side)&&s.alive[side]===true;}
function connected(s,side){if(!isAlive(s,side))return new Set();const castles=s.cells.filter(c=>c.building?.side===side&&c.building.type==='castle');const seen=new Set(castles.map(c=>c.id)),queue=[...castles];for(let i=0;i<queue.length;i++)for(const id of queue[i].neighbors){const c=s.cells[id];if(!seen.has(id)&&c.building?.side===side&&c.owner===side){seen.add(id);queue.push(c);}}return seen;}
function available(s,side){const links=connected(s,side);return s.cells.filter(c=>!c.water&&c.owner===side&&!c.building&&!c.outpost&&c.neighbors.some(n=>links.has(n)));}
function purchase(s,id,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 const c=s.cells[id];if(!c||!available(s,side).some(t=>t.id===id))return {ok:false,reason:'只能建造与主城相连的己方空地'};
 const cost=TYPES[c.offer].cost;if(s.gold[side]+1e-8<cost)return {ok:false,reason:'金币不足，等待主城与金矿产出'};
 s.gold[side]-=cost;let type=c.offer;
 if(type==='mystery'){const roll=s.random();type=roll<.3?'mine':roll<.64?'barracks':roll<.83?'archer':roll<.95?'tower':'knight';}
 c.building=makeBuilding(type,side);c.flash=1;s.builds[side]++;s.events.push({type:'build',cell:id,side,kind:type,mystery:c.offer==='mystery'});return {ok:true,type,cost};
}
function upgradeCost(s,key,side=0){const spec=UPGRADES[key],level=s.upgrades[side]?.[key];return spec&&Number.isInteger(level)&&level<spec.max?spec.costs[level]:null;}
function upgrade(s,key,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 const cost=upgradeCost(s,key,side);if(cost===null)return {ok:false,reason:'该升级已满级或不存在'};
 if(s.gold[side]<cost)return {ok:false,reason:'金币不足'};
 const old=s.upgrades[side][key];s.gold[side]-=cost;s.upgrades[side][key]++;
 if(key==='armor')for(const u of s.units)if(u.side===side){const ratio=(1+.2*(old+1))/(1+.2*old);u.hp*=ratio;u.maxHp*=ratio;}
 s.events.push({type:'upgrade',side,kind:key,level:old+1});return {ok:true,cost,level:old+1};
}
function trainingRate(s,side){return 1+.15*s.upgrades[side].training+.12*s.cells.filter(c=>c.owner===side&&c.outpost==='rally').length;}
function spawn(s,c){const side=c.building.side;if(!isAlive(s,side)||s.units.filter(u=>u.side===side).length>=(s.classic?50:40))return;const t=UNIT[c.building.type],hp=t.hp*(1+.2*s.upgrades[side].armor);s.units.push({id:s.nextId++,side,type:c.building.type,cell:c.id,x:c.x,y:c.y,hp,maxHp:hp,cooldown:.25,moving:null,waypoint:s.classic?7*COLS+(c.c>=4?7:1):null,targetSide:null,goal:null,walk:0,attack:0});}
function path(s,from,goal){if(!s.cells[from]||!s.cells[goal]||s.cells[goal].water||s.cells[from].water)return null;const queue=[from],prev=new Map([[from,null]]);for(let i=0;i<queue.length;i++){const id=queue[i];if(id===goal)break;for(const n of s.cells[id].neighbors)if(!s.cells[n].water&&!prev.has(n)){prev.set(n,id);queue.push(n);}}if(!prev.has(goal))return null;let step=goal;while(prev.get(step)!==from&&prev.get(step)!==null)step=prev.get(step);return step===from?null:step;}
function finish(s,winner,reason,kind){if(s.phase==='over')return;s.phase='over';s.winner=winner;s.reason=reason;s.resultKind=kind||(winner===null?'draw':winner===0?'victory':'defeat');}
function stats(s,side){const alive=isAlive(s,side),mines=s.cells.filter(c=>c.building?.side===side&&c.building.type==='mine').length,outposts=s.cells.filter(c=>c.owner===side&&c.outpost).length;return {land:s.cells.filter(c=>c.owner===side&&!c.water).length,gold:Math.floor(s.gold[side]||0),income:alive?2+mines*(3+s.upgrades[side].economy)+s.cells.filter(c=>c.owner===side&&c.outpost==='gold').length*2:0,units:s.units.filter(u=>u.side===side&&u.hp>0).length,buildings:s.cells.filter(c=>c.building?.side===side).length,outposts,alive};}
function eliminate(s,side,by){
 if(!isAlive(s,side))return;s.alive[side]=false;s.eliminated.push({side,by,time:s.elapsed});
 s.units=s.units.filter(u=>u.side!==side);for(const c of s.cells){if(c.building?.side===side)c.building=null;if(c.owner===side)c.owner=-1;}
 s.events.push({type:'eliminate',side,by});
 if(side===0){finish(s,by,s.classic?'我方主城被攻破':`${FACTIONS[by].name}攻破了你的主城。你已被淘汰。`,'defeat');return;}
 const survivors=s.alive.map((v,i)=>v?i:-1).filter(i=>i>=0);
 if(survivors.length===1)finish(s,survivors[0],s.classic?'攻破了敌方主城':`${FACTIONS[survivors[0]].name}成为最后存活的阵营！`,survivors[0]===0?'victory':'defeat');
}
function damageBuilding(s,c,amount,side){if(s.phase!=='playing'||!c||s.cells[c.id]!==c||!Number.isFinite(amount)||amount<=0)return;const b=c.building;if(!b||b.side===side||!isAlive(s,side))return;b.hp-=amount;c.flash=.3;if(b.hp<=0){const lost=b.side;s.events.push({type:'destroy',cell:c.id,side,defender:lost});c.building=null;c.owner=side;s.captures[side]++;if(b.type==='castle')eliminate(s,lost,side);}}
function chooseGoal(s,u){
 const enemyCastles=s.cells.filter(c=>c.building?.type==='castle'&&c.building.side!==u.side&&isAlive(s,c.building.side));
 if(!enemyCastles.length)return null;
 const distances=flood(s.cells,u.cell);
 const ranked=enemyCastles.map(c=>({c,score:(distances.get(c.id)??999)+(c.building.hp/c.building.maxHp)*3+((u.id+c.building.side*7)%5)*.65})).sort((a,b)=>a.score-b.score);
 let target=ranked[0].c;u.targetSide=target.building.side;
 if(!s.classic){const posts=s.cells.filter(c=>c.outpost&&c.owner!==u.side&&distances.has(c.id)).sort((a,b)=>distances.get(a.id)-distances.get(b.id)||a.id-b.id);if(posts[0]&&(distances.get(posts[0].id)<=5||(u.id%3===0&&distances.get(posts[0].id)<distances.get(target.id))))target=posts[0];}
 u.goal=target.id;return target.id;
}
function capture(s,c,side){if(c.building||c.water||c.owner===side)return;const old=c.owner;c.owner=side;c.flash=.5;s.captures[side]++;s.events.push({type:c.outpost?'outpost':'capture',cell:c.id,side,previous:old});}
function tick(s,dt){
 if(s.phase!=='playing'||!Number.isFinite(dt))return;dt=Math.min(Math.max(dt,0),.1);if(dt===0)return;s.elapsed+=dt;
 for(let side=0;side<s.sides.length;side++)if(isAlive(s,side))s.gold[side]+=stats(s,side).income*dt;
 for(const c of s.cells){c.flash=Math.max(0,c.flash-dt);const b=c.building;if(!b||!isAlive(s,b.side))continue;
  if(UNIT[b.type]){b.timer+=dt*trainingRate(s,b.side);if(b.timer>=TYPES[b.type].period){b.timer-=TYPES[b.type].period;spawn(s,c);}}
  if(b.type==='tower'||b.type==='castle'){b.cooldown-=dt;const range=b.type==='tower'?2.3:1.45;const target=s.units.filter(u=>u.side!==b.side&&isAlive(s,u.side)&&u.hp>0&&distance(c,u)<=range).sort((a,z)=>distance(c,a)-distance(c,z))[0];if(target&&b.cooldown<=0){target.hp-=b.type==='tower'?20:13;target.attack=.18;b.cooldown=.9;s.events.push({type:'shot',from:c.id,to:target.id,side:b.side});}}
 }
 for(const u of s.units.slice()){
  if(u.hp<=0||!isAlive(s,u.side)||s.phase!=='playing')continue;const spec=UNIT[u.type];u.cooldown-=dt;u.attack=Math.max(0,u.attack-dt);
  const target=s.units.filter(v=>v.side!==u.side&&isAlive(s,v.side)&&v.hp>0&&distance(u,v)<=spec.range).sort((a,b)=>distance(u,a)-distance(u,b))[0];
  const buildings=s.cells.filter(c=>c.building&&c.building.side!==u.side&&isAlive(s,c.building.side)&&distance(u,c)<=spec.range).sort((a,b)=>distance(u,a)-distance(u,b));
  if(target||buildings.length){if(u.cooldown<=0){if(target){target.hp-=spec.damage;target.attack=.2;if(target.hp<=0){s.kills[u.side]++;s.gold[u.side]+=5;}}else damageBuilding(s,buildings[0],spec.damage,u.side);u.cooldown=spec.cooldown;s.events.push({type:'hit',x:u.x,y:u.y,side:u.side});}continue;}
  if(u.moving===null){capture(s,s.cells[u.cell],u.side);if(u.cell===u.waypoint)u.waypoint=null;const goal=u.waypoint??chooseGoal(s,u);u.moving=goal===null?null:path(s,u.cell,goal);}
  if(u.moving!==null){const dest=s.cells[u.moving];if(!dest||dest.water){u.moving=null;continue;}const dist=distance(u,dest),step=spec.speed*dt;if(dist<=step){u.x=dest.x;u.y=dest.y;u.cell=dest.id;u.moving=null;capture(s,dest,u.side);}else{u.x+=(dest.x-u.x)/dist*step;u.y+=(dest.y-u.y)/dist*step;}u.walk+=dt;}
 }
 s.units=s.units.filter(u=>u.hp>0&&isAlive(s,u.side));
 if(s.events.length>80)s.events.splice(0,s.events.length-80);
 if(s.phase!=='playing')return;
 const interval=s.difficulty==='easy'?4.2:s.difficulty==='hard'?1.6:2.8;
 // Preserve aiTimer for old duel controls; new games run independent staggered clocks.
 if(s.classic){s.aiTimer-=dt;if(s.aiTimer<=0){s.aiTimer=interval;ai(s,1);}}
 else for(let side=1;side<s.sides.length;side++)if(isAlive(s,side)){s.aiTimers[side]-=dt;if(s.aiTimers[side]<=0){s.aiTimers[side]=interval;ai(s,side);}}
 if(s.elapsed+1e-7>=DURATION){const scores=s.sides.filter(f=>isAlive(s,f.id)).map(f=>({side:f.id,land:stats(s,f.id).land})),best=Math.max(...scores.map(x=>x.land));s.tiedSides=scores.filter(x=>x.land===best).map(x=>x.side);const winner=s.tiedSides.length===1?s.tiedSides[0]:null;const reason=s.classic?'时间到，领地更多的一方获胜':winner===null?`时间到，${s.tiedSides.map(i=>FACTIONS[i].name).join('、')}以 ${best} 格并列第一。`:`时间到，${FACTIONS[winner].name}以 ${best} 格领地获胜。`;finish(s,winner,reason,'timeout');}
 if(s.events.length>80)s.events.splice(0,s.events.length-80);
}
function ai(s,side=1){
 if(s.phase!=='playing'||!isAlive(s,side))return;
 let choices=available(s,side).filter(c=>TYPES[c.offer].cost<=s.gold[side]);const mines=s.cells.filter(c=>c.building?.side===side&&c.building.type==='mine').length,army=s.cells.filter(c=>c.building?.side===side&&UNIT[c.building.type]).length;
 if(!s.classic&&army>=2){const order=mines>=2?['economy','training','armor']:['training','armor'];for(const key of order){const cost=upgradeCost(s,key,side);if(cost!==null&&s.gold[side]>=cost+50&&s.upgrades[side][key]<1+(s.elapsed>90)){upgrade(s,key,side);return;}}}
 choices=choices.map(c=>({cell:c,score:score(c)})).sort((a,b)=>b.score-a.score).map(x=>x.cell);
 function score(c){let v=s.random()*2;if(c.offer==='mine')v+=mines<2?12:mines<4?5:0;if(c.offer==='barracks')v+=army<2?10:5;if(c.offer==='mystery')v+=4;if(c.offer==='knight')v+=7;if(c.offer==='archer')v+=6;if(c.offer==='tower')v+=s.units.some(u=>u.side!==side&&isAlive(s,u.side)&&distance(c,u)<3)?12:1;return v;}
 if(choices.length)purchase(s,choices[0].id,side);
}
return {COLS,ROWS,DURATION,FACTIONS,MODES,MAPS,TYPES,UNIT,UPGRADES,create,available,purchase,upgrade,upgradeCost,trainingRate,tick,stats,ai,path,finish,neighborsIndex,distance,damageBuilding,chooseGoal};
});
