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
 arsenal:{name:'军械库',cost:140,hp:220,icon:'arsenal',description:'解锁手动轰击与穿透炮。初始 1/3 弹，每 18 秒补 1 弹，两种武器共享冷却。'},
 hospital:{name:'医馆',cost:110,hp:200,icon:'hospital',description:'半径 2 内的友方部队每秒恢复 8 生命，不治疗敌军。'},
 beacon:{name:'战鼓营',cost:130,hp:230,icon:'beacon',description:'半径 2.5 内友方建筑训练 +20%、部队与塔/主城攻击 +10%。同类光环取最强，不叠加。'},
 mystery:{name:'盲盒地块',cost:25,hp:0,icon:'mystery',description:'随机建成金矿、兵营、守卫塔或骑士营。'}
};
const UNIT={barracks:{hp:66,damage:13,range:.9,speed:.75,cooldown:1},archer:{hp:40,damage:12,range:2.15,speed:.62,cooldown:1.2},knight:{hp:170,damage:27,range:.95,speed:.58,cooldown:1.1}};
const UPGRADES={economy:{name:'精炼采矿',description:'每座金矿 +1 金/秒',costs:[100,180],max:2},training:{name:'急行训练',description:'训练速度 +15%',costs:[120,200],max:2},armor:{name:'精钢护甲',description:'所有部队生命 +20%',costs:[120,200],max:2}};

// Routes are faction-wide commitments; branch effects belong to one building.
// An untouched level-one building and an unchosen route use the V2 numbers exactly.
const ROUTES={
 economy:{name:'富国路线',description:'每级：主城、金矿和据点产金 +25%，直接攻击伤害 -10%。2 级为产金 +50% / 伤害 -20%。',costs:[90,150],max:2},
 defense:{name:'坚城路线',description:'每级：全部建筑耐久 +30%，塔与主城攻击 +20%，训练速度 -10%。2 级为 +60% / +40% / -20%。',costs:[90,150],max:2},
 offense:{name:'征战路线',description:'每级：直接攻击伤害 +20%，训练速度 +10%，主城、金矿和据点产金 -10%。2 级为 +40% / +20% / -20%。',costs:[90,150],max:2}
};
const BUILDING_UPGRADES={
 mine:{yield:{name:'深层矿脉',description:'每级额外 +1.5 金/秒。',costs:[65,110]},fortified:{name:'堡垒矿井',description:'每级额外 +0.5 金/秒，额外耐久 +35%。',costs:[60,100]}},
 barracks:{drill:{name:'疾训营',description:'每级训练速度 +25%，新兵生命 -5%。',costs:[70,115]},veteran:{name:'老兵营',description:'每级新兵生命 +25%、伤害 +15%，训练速度 -10%。',costs:[80,130]}},
 archer:{volley:{name:'齐射营',description:'每级训练速度 +20%，新兵伤害 -5%。',costs:[90,145]},longbow:{name:'长弓营',description:'每级新兵射程 +0.35、伤害 +15%，训练速度 -10%。',costs:[100,160]}},
 tower:{rapid:{name:'连弩塔',description:'每级攻击频率 +35%，单次伤害 -10%。',costs:[85,135]},bastion:{name:'重垒塔',description:'每级额外耐久 +40%、射程 +0.3、伤害 +20%。',costs:[105,170]}},
 knight:{charge:{name:'冲锋骑',description:'每级新兵伤害 +25%、移速 +10%，生命 -10%。',costs:[120,180]},plate:{name:'铁甲骑',description:'每级新兵生命 +35%，训练速度 -10%。',costs:[125,190]}},
 arsenal:{magazine:{name:'扩容弹仓',description:'每级弹药上限 +1、补弹间隔 -3 秒。升级不补发弹药。',costs:[95,155]},siege:{name:'攻城火药',description:'每级两种手动武器对部队和建筑的伤害 +20%。',costs:[110,175]}},
 hospital:{triage:{name:'战地急救',description:'每级单位治疗 +4 生命/秒。',costs:[80,130]},sanctuary:{name:'庇护医馆',description:'每级治疗半径 +0.5，并为范围内友方建筑恢复 4 生命/秒。',costs:[90,145]}},
 beacon:{drums:{name:'急行战鼓',description:'每级训练光环额外 +15 个百分点。',costs:[85,140]},banner:{name:'破阵军旗',description:'每级攻击光环额外 +10 个百分点。',costs:[95,155]}}
};
const WEAPONS={
 barrage:{name:'范围轰击',description:'射程 6，半径 1.25；部队 110 / 建筑 100 伤害，消耗 1 弹和 35 金，共享冷却 12 秒。友军安全。',cost:35,ammoCost:1,range:6,radius:1.25,damage:110,buildingDamage:100,cooldown:12},
 rail:{name:'穿透炮',description:'射程 8，沿瞄准方向贯穿至满射程，中心线两侧各 0.48；部队 150 / 建筑 140 伤害，消耗 2 弹和 45 金，共享冷却 15 秒。友军安全。',cost:45,ammoCost:2,range:8,width:.48,damage:150,buildingDamage:140,cooldown:15}
};
function own(object,key){return typeof key==='string'&&Object.prototype.hasOwnProperty.call(object,key);}
function routeState(s,side){return s.routes?.[side]||{key:null,level:0};}
function validRoute(s,side){const r=s.routes?.[side];if(r===undefined)return true;return !!r&&typeof r==='object'&&(r.key===null?r.level===0:own(ROUTES,r.key)&&Number.isInteger(r.level)&&r.level>=1&&r.level<=2);}
function routeEffects(s,side){const r=validRoute(s,side)?routeState(s,side):{key:null,level:0},level=own(ROUTES,r.key)?r.level:0;return {income:r.key==='economy'?1+.25*level:r.key==='offense'?1-.1*level:1,damage:r.key==='economy'?1-.1*level:r.key==='offense'?1+.2*level:1,training:r.key==='defense'?1-.1*level:r.key==='offense'?1+.1*level:1,buildingHp:r.key==='defense'?1+.3*level:1,towerDamage:r.key==='defense'?1+.2*level:1};}
function buildingEffects(b){
 const effects={training:1,hp:1,damage:1,speed:1,range:0,attackRate:1,income:0,buildingHp:1,maxAmmo:3,reload:18,weaponDamage:1,heal:8,healRadius:2,buildingHeal:0,auraRadius:2.5,auraTraining:.2,auraDamage:.1};
 if(!b)return effects;const n=Math.max(0,Math.min(2,(b.level||1)-1));
 if(b.type==='mine'){if(b.branch==='yield')effects.income=1.5*n;if(b.branch==='fortified'){effects.income=.5*n;effects.buildingHp=1+.35*n;}}
 if(b.type==='barracks'){if(b.branch==='drill'){effects.training=1+.25*n;effects.hp=1-.05*n;}if(b.branch==='veteran'){effects.hp=1+.25*n;effects.damage=1+.15*n;effects.training=1-.1*n;}}
 if(b.type==='archer'){if(b.branch==='volley'){effects.training=1+.2*n;effects.damage=1-.05*n;}if(b.branch==='longbow'){effects.range=.35*n;effects.damage=1+.15*n;effects.training=1-.1*n;}}
 if(b.type==='knight'){if(b.branch==='charge'){effects.damage=1+.25*n;effects.speed=1+.1*n;effects.hp=1-.1*n;}if(b.branch==='plate'){effects.hp=1+.35*n;effects.training=1-.1*n;}}
 if(b.type==='tower'){if(b.branch==='rapid'){effects.attackRate=1+.35*n;effects.damage=1-.1*n;}if(b.branch==='bastion'){effects.buildingHp=1+.4*n;effects.range=.3*n;effects.damage=1+.2*n;}}
 if(b.type==='arsenal'){if(b.branch==='magazine'){effects.maxAmmo=3+n;effects.reload=18-3*n;}if(b.branch==='siege')effects.weaponDamage=1+.2*n;}
 if(b.type==='hospital'){if(b.branch==='triage')effects.heal=8+4*n;if(b.branch==='sanctuary'){effects.healRadius=2+.5*n;effects.buildingHeal=4*n;}}
 if(b.type==='beacon'){if(b.branch==='drums')effects.auraTraining=.2+.15*n;if(b.branch==='banner')effects.auraDamage=.1+.1*n;}
 return effects;
}
function buildingMaxHp(s,b){return TYPES[b.type].hp*(1+.25*Math.max(0,(b.level||1)-1))*buildingEffects(b).buildingHp*routeEffects(s,b.side).buildingHp;}
function rescaleBuilding(s,b){const ratio=b.maxHp>0?Math.max(0,Math.min(1,b.hp/b.maxHp)):1;b.maxHp=buildingMaxHp(s,b);b.hp=b.maxHp*ratio;}
function aura(s,side,position){let training=0,damage=0;for(const c of s.cells){const b=c.building;if(!b||b.side!==side||b.type!=='beacon'||b.hp<=0)continue;const e=buildingEffects(b);if(distance(c,position)<=e.auraRadius+1e-8){training=Math.max(training,e.auraTraining);damage=Math.max(damage,e.auraDamage);}}return {training,damage};}
function directDamage(s,side,position){return routeEffects(s,side).damage*(1+aura(s,side,position).damage);}

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
 const s={seed,difficulty,mode,map,classic,random,cells,bases,sides:FACTIONS.slice(0,count).map(f=>({...f})),alive:Array(count).fill(true),eliminated:[],units:[],gold:Array(count).fill(100),upgrades:Array.from({length:count},()=>({economy:0,training:0,armor:0})),routes:Array.from({length:count},()=>({key:null,level:0})),elapsed:0,aiTimer:3,aiTimers:Array.from({length:count},(_,i)=>3+i*.35),phase:'ready',winner:null,resultKind:null,tiedSides:[],reason:'',events:[],nextId:1,captures:Array(count).fill(0),builds:Array(count).fill(0),kills:Array(count).fill(0)};
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
function makeBuilding(type,side){return {type,side,hp:TYPES[type].hp,maxHp:TYPES[type].hp,timer:0,cooldown:0,level:1,branch:null,ammo:type==='arsenal'?1:0,ammoTimer:0,weaponCooldown:0};}
function isAlive(s,side){return Number.isInteger(side)&&s.alive[side]===true;}
function validTreasury(s,side){return Number.isFinite(s.gold[side])&&s.gold[side]>=0;}
function validPosition(point){return point&&Number.isFinite(point.x)&&Number.isFinite(point.y);}
function validBuilding(b){if(!b||!own(TYPES,b.type)||!Number.isFinite(b.hp)||!Number.isFinite(b.maxHp)||b.hp<=0||b.maxHp<=0||b.hp>b.maxHp+1e-8)return false;const level=b.level===undefined?1:b.level;if(!Number.isInteger(level)||level<1||level>3)return false;return level===1?(b.branch===null||b.branch===undefined):own(BUILDING_UPGRADES,b.type)&&own(BUILDING_UPGRADES[b.type],b.branch);}
function validArsenal(b){const e=buildingEffects(b);return Number.isInteger(b.ammo)&&b.ammo>=0&&b.ammo<=e.maxAmmo&&Number.isFinite(b.weaponCooldown)&&b.weaponCooldown>=0&&Number.isFinite(b.ammoTimer)&&b.ammoTimer>=0;}
function connected(s,side){if(!isAlive(s,side))return new Set();const castles=s.cells.filter(c=>c.building?.side===side&&c.building.type==='castle');const seen=new Set(castles.map(c=>c.id)),queue=[...castles];for(let i=0;i<queue.length;i++)for(const id of queue[i].neighbors){const c=s.cells[id];if(!seen.has(id)&&c.building?.side===side&&c.owner===side){seen.add(id);queue.push(c);}}return seen;}
function available(s,side){const links=connected(s,side);return s.cells.filter(c=>!c.water&&c.owner===side&&!c.building&&!c.outpost&&c.neighbors.some(n=>links.has(n)));}
function purchase(s,id,side=0,requestedType=null){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 if(!validTreasury(s,side))return {ok:false,reason:'金币状态无效'};
 if(!validRoute(s,side))return {ok:false,reason:'路线状态无效'};
 const c=Number.isInteger(id)?s.cells[id]:null;if(!c||!available(s,side).some(t=>t.id===id))return {ok:false,reason:'只能建造与主城相连的己方空地'};
 if(requestedType!==null&&!own(BUILDING_UPGRADES,requestedType))return {ok:false,reason:'请选择普通建筑，主城和盲盒不能指定建造'};
 let type=requestedType===null?c.offer:requestedType;
 if(!own(TYPES,type)||type==='castle')return {ok:false,reason:'此地块没有合法建造选项'};
 const mystery=type==='mystery',cost=TYPES[type].cost;if(s.gold[side]+1e-8<cost)return {ok:false,reason:'金币不足，等待主城与金矿产出'};
 s.gold[side]=Math.max(0,s.gold[side]-cost);
 if(mystery){const roll=s.random();type=roll<.3?'mine':roll<.64?'barracks':roll<.83?'archer':roll<.95?'tower':'knight';}
 c.building=makeBuilding(type,side);rescaleBuilding(s,c.building);c.flash=1;s.builds[side]++;s.events.push({type:'build',cell:id,side,kind:type,mystery});return {ok:true,type,cost};
}
function routeCost(s,side=0){if(!isAlive(s,side)||!validRoute(s,side))return null;const r=routeState(s,side);return r.level>=2?null:(own(ROUTES,r.key)?ROUTES[r.key]:ROUTES.economy).costs[r.level||0];}
function chooseRoute(s,key,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 if(!validTreasury(s,side))return {ok:false,reason:'金币状态无效'};
 if(!validRoute(s,side))return {ok:false,reason:'路线状态无效'};
 if(!own(ROUTES,key))return {ok:false,reason:'路线不存在'};
 if(routeState(s,side).key!==null)return {ok:false,reason:'已选择路线，本局不能切换'};
 const cost=ROUTES[key].costs[0];if(s.gold[side]<cost)return {ok:false,reason:'金币不足'};
 s.gold[side]-=cost;s.routes[side]={key,level:1};for(const c of s.cells)if(c.building?.side===side)rescaleBuilding(s,c.building);
 s.events.push({type:'route',side,kind:key,level:1});return {ok:true,cost,key,level:1};
}
function upgradeRoute(s,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 if(!validTreasury(s,side))return {ok:false,reason:'金币状态无效'};
 if(!validRoute(s,side))return {ok:false,reason:'路线状态无效'};
 const r=routeState(s,side);if(!own(ROUTES,r.key)||r.level>=2)return {ok:false,reason:'请先选择路线，或该路线已满级'};
 const cost=routeCost(s,side);if(s.gold[side]<cost)return {ok:false,reason:'金币不足'};
 s.gold[side]-=cost;r.level++;for(const c of s.cells)if(c.building?.side===side)rescaleBuilding(s,c.building);
 s.events.push({type:'route',side,kind:r.key,level:r.level});return {ok:true,cost,key:r.key,level:r.level};
}
function buildingUpgradeCost(s,id,branchKey,side=0){
 const c=Number.isInteger(id)?s.cells[id]:null,b=c?.building;
 if(!isAlive(s,side)||!validRoute(s,side)||!c||c.water||c.owner!==side||!validBuilding(b)||b.side!==side||!own(BUILDING_UPGRADES,b.type)||!own(BUILDING_UPGRADES[b.type],branchKey))return null;
 if(b.type==='arsenal'&&!validArsenal(b))return null;
 const level=b.level||1;if(level>=3||(level>1&&b.branch!==branchKey)||(b.branch!==null&&b.branch!==undefined&&b.branch!==branchKey))return null;
 return BUILDING_UPGRADES[b.type][branchKey].costs[level-1];
}
function upgradeBuilding(s,id,branchKey,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 if(!validTreasury(s,side))return {ok:false,reason:'金币状态无效'};
 if(!validRoute(s,side))return {ok:false,reason:'路线状态无效'};
 const cost=buildingUpgradeCost(s,id,branchKey,side);if(cost===null||cost===undefined)return {ok:false,reason:'只能升级己方普通建筑，同一分支最高 3 级且不可切换'};
 if(s.gold[side]<cost)return {ok:false,reason:'金币不足'};
 const c=s.cells[id],b=c.building;s.gold[side]-=cost;b.branch=branchKey;b.level=(b.level||1)+1;rescaleBuilding(s,b);
 if(b.type==='arsenal'){b.ammo=Math.min(b.ammo??1,buildingEffects(b).maxAmmo);b.ammoTimer=Math.min(b.ammoTimer||0,buildingEffects(b).reload);}
 c.flash=.6;s.events.push({type:'buildingUpgrade',cell:id,side,kind:branchKey,level:b.level});return {ok:true,cost,level:b.level,branch:branchKey};
}
function weaponStatus(s,id,key,side=0){
 const c=Number.isInteger(id)?s.cells[id]:null,b=c?.building,spec=own(WEAPONS,key)?WEAPONS[key]:null,e=buildingEffects(b);
 const result={ok:false,reason:'',cost:spec?.cost??0,ammo:b?.type==='arsenal'?(b.ammo??1):0,maxAmmo:b?.type==='arsenal'?e.maxAmmo:3,cooldown:Math.max(0,b?.weaponCooldown||0),range:spec?.range??0,ammoCost:spec?.ammoCost??0};
 if(s.phase!=='playing')result.reason='请先开始对局';
 else if(!isAlive(s,side))result.reason='该阵营已被淘汰';
 else if(!validTreasury(s,side))result.reason='金币状态无效';
 else if(!validRoute(s,side))result.reason='路线状态无效';
 else if(!spec)result.reason='武器不存在';
 else if(!c||c.water||c.owner!==side||!b||b.side!==side||b.type!=='arsenal')result.reason='请选择己方军械库';
 else if(!validPosition(c)||!validBuilding(b))result.reason='军械库状态无效';
 else if(!validArsenal(b))result.reason='弹药或冷却状态无效';
 else if(result.cooldown>1e-8)result.reason=`武器冷却中，还需 ${result.cooldown.toFixed(1)} 秒`;
 else if(result.ammo<spec.ammoCost)result.reason='弹药不足，等待军械库补弹';
 else if(s.gold[side]+1e-8<spec.cost)result.reason='金币不足';
 else result.ok=true;
 return result;
}
function lineDistance(point,from,to){const dx=to.x-from.x,dy=to.y-from.y,length2=dx*dx+dy*dy,t=((point.x-from.x)*dx+(point.y-from.y)*dy)/length2;return t<0||t>1?Infinity:Math.hypot(point.x-from.x-t*dx,point.y-from.y-t*dy);}
function previewWeapon(s,id,key,targetId,side=0){
 const status=weaponStatus(s,id,key,side),spec=own(WEAPONS,key)?WEAPONS[key]:null,c=Number.isInteger(id)?s.cells[id]:null,target=Number.isInteger(targetId)?s.cells[targetId]:null;
 const scale=routeEffects(s,side).damage*buildingEffects(c?.building).weaponDamage;
 const result={...status,cells:[],damage:spec?spec.damage*scale:0,buildingDamage:spec?spec.buildingDamage*scale:0,radius:spec?.radius??null,line:null};
 if(!spec||!c||!target){result.ok=false;if(status.ok||!target)result.reason='请选择地图内的目标格';return result;}
 if(!Number.isFinite(result.damage)||result.damage<=0||!Number.isFinite(result.buildingDamage)||result.buildingDamage<=0){result.ok=false;result.reason='武器伤害状态无效';return result;}
 if(!validPosition(c)||!validPosition(target)){result.ok=false;result.reason='目标或军械库坐标无效';return result;}
 const dist=distance(c,target);if(dist>spec.range+1e-8){result.ok=false;result.reason='目标超出武器射程';return result;}
 if(key==='rail'&&dist<1e-8){result.ok=false;result.reason='穿透炮需要瞄准另一格';return result;}
 if(key==='barrage')result.cells=s.cells.filter(t=>distance(t,target)<=spec.radius+1e-8).map(t=>t.id);
 else{result.line={from:{x:c.x,y:c.y},to:{x:c.x+(target.x-c.x)/dist*spec.range,y:c.y+(target.y-c.y)/dist*spec.range},width:spec.width};result.cells=s.cells.filter(t=>lineDistance(t,result.line.from,result.line.to)<=spec.width+1e-8).map(t=>t.id);}
 return result;
}
function fireWeapon(s,id,key,targetId,side=0){
 const preview=previewWeapon(s,id,key,targetId,side);if(!preview.ok)return preview;
 const c=s.cells[id],target=s.cells[targetId],b=c.building,spec=WEAPONS[key];s.gold[side]=Math.max(0,s.gold[side]-spec.cost);b.ammo=(b.ammo??1)-spec.ammoCost;b.weaponCooldown=spec.cooldown;
 const inBlast=position=>key==='barrage'?distance(position,target)<=spec.radius+1e-8:lineDistance(position,preview.line.from,preview.line.to)<=spec.width+1e-8;
 for(const u of s.units){if(u.side===side||!isAlive(s,u.side)||u.hp<=0||!inBlast(u))continue;u.hp-=preview.damage;u.attack=.3;if(u.hp<=0){s.kills[side]++;s.gold[side]+=5;}}
 s.units=s.units.filter(u=>u.hp>0&&isAlive(s,u.side));
 for(const tile of s.cells){if(s.phase!=='playing')break;if(tile.building&&tile.building.side!==side&&inBlast(tile))damageBuilding(s,tile,preview.buildingDamage,side);}
 s.events.push({type:'weapon',from:id,target:targetId,kind:key,side,cells:preview.cells.slice(),damage:preview.damage,buildingDamage:preview.buildingDamage,radius:preview.radius,line:preview.line});
 if(s.events.length>80)s.events.splice(0,s.events.length-80);
 return {...preview,ok:true,cost:spec.cost,ammo:b.ammo,cooldown:b.weaponCooldown};
}
function upgradeCost(s,key,side=0){const spec=own(UPGRADES,key)?UPGRADES[key]:null,level=s.upgrades[side]?.[key];return spec&&Number.isInteger(level)&&level>=0&&level<spec.max?spec.costs[level]:null;}
function upgrade(s,key,side=0){
 if(s.phase!=='playing')return {ok:false,reason:'请先开始对局'};
 if(!isAlive(s,side))return {ok:false,reason:'该阵营已被淘汰'};
 if(!validTreasury(s,side))return {ok:false,reason:'金币状态无效'};
 if(!validRoute(s,side))return {ok:false,reason:'路线状态无效'};
 const cost=upgradeCost(s,key,side);if(cost===null)return {ok:false,reason:'该升级已满级或不存在'};
 if(s.gold[side]<cost)return {ok:false,reason:'金币不足'};
 const old=s.upgrades[side][key];s.gold[side]-=cost;s.upgrades[side][key]++;
 if(key==='armor')for(const u of s.units)if(u.side===side){const ratio=(1+.2*(old+1))/(1+.2*old);u.hp*=ratio;u.maxHp*=ratio;}
 s.events.push({type:'upgrade',side,kind:key,level:old+1});return {ok:true,cost,level:old+1};
}
function trainingRate(s,side,c=null){const base=1+.15*(s.upgrades[side]?.training||0)+.12*s.cells.filter(c=>c.owner===side&&c.outpost==='rally').length;return base*routeEffects(s,side).training*(c?buildingEffects(c.building).training*(1+aura(s,side,c).training):1);}
function spawn(s,c){const side=c.building.side;if(!isAlive(s,side)||s.units.filter(u=>u.side===side).length>=(s.classic?50:40))return;const t=UNIT[c.building.type],e=buildingEffects(c.building),hp=t.hp*(1+.2*s.upgrades[side].armor)*e.hp;s.units.push({id:s.nextId++,side,type:c.building.type,cell:c.id,x:c.x,y:c.y,hp,maxHp:hp,cooldown:.25,moving:null,waypoint:s.classic?7*COLS+(c.c>=4?7:1):null,targetSide:null,goal:null,walk:0,attack:0,traits:{damage:e.damage,speed:e.speed,range:e.range}});}
function path(s,from,goal){if(!s.cells[from]||!s.cells[goal]||s.cells[goal].water||s.cells[from].water)return null;const queue=[from],prev=new Map([[from,null]]);for(let i=0;i<queue.length;i++){const id=queue[i];if(id===goal)break;for(const n of s.cells[id].neighbors)if(!s.cells[n].water&&!prev.has(n)){prev.set(n,id);queue.push(n);}}if(!prev.has(goal))return null;let step=goal;while(prev.get(step)!==from&&prev.get(step)!==null)step=prev.get(step);return step===from?null:step;}
function finish(s,winner,reason,kind){if(s.phase==='over')return;s.phase='over';s.winner=winner;s.reason=reason;s.resultKind=kind||(winner===null?'draw':winner===0?'victory':'defeat');}
function stats(s,side){const alive=isAlive(s,side),mines=s.cells.filter(c=>c.building?.side===side&&c.building.type==='mine'),outposts=s.cells.filter(c=>c.owner===side&&c.outpost).length,income=alive?(2+mines.reduce((total,c)=>total+3+s.upgrades[side].economy+buildingEffects(c.building).income,0)+s.cells.filter(c=>c.owner===side&&c.outpost==='gold').length*2)*routeEffects(s,side).income:0;return {land:s.cells.filter(c=>c.owner===side&&!c.water).length,gold:Math.floor(s.gold[side]||0),income,units:s.units.filter(u=>u.side===side&&u.hp>0).length,buildings:s.cells.filter(c=>c.building?.side===side).length,outposts,alive};}
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
 for(const c of s.cells){c.flash=Math.max(0,c.flash-dt);const b=c.building;if(!b||!isAlive(s,b.side))continue;const e=buildingEffects(b);
  if(UNIT[b.type]){b.timer+=dt*trainingRate(s,b.side,c);if(b.timer>=TYPES[b.type].period){b.timer-=TYPES[b.type].period;spawn(s,c);}}
  if(b.type==='arsenal'){
   b.weaponCooldown=Math.max(0,(b.weaponCooldown||0)-dt);b.ammo=Math.min(e.maxAmmo,b.ammo??1);
   if(b.ammo<e.maxAmmo){b.ammoTimer=(b.ammoTimer||0)+dt;while(b.ammoTimer+1e-8>=e.reload&&b.ammo<e.maxAmmo){b.ammo++;b.ammoTimer=Math.max(0,b.ammoTimer-e.reload);}}if(b.ammo>=e.maxAmmo)b.ammoTimer=0;
  }
  if(b.type==='hospital'){
   for(const u of s.units)if(u.side===b.side&&u.hp>0&&distance(c,u)<=e.healRadius+1e-8)u.hp=Math.min(u.maxHp,u.hp+e.heal*dt);
   if(e.buildingHeal>0)for(const tile of s.cells){const other=tile.building;if(other?.side===b.side&&other.hp>0&&distance(c,tile)<=e.healRadius+1e-8)other.hp=Math.min(other.maxHp,other.hp+e.buildingHeal*dt);}
  }
  if(b.type==='tower'||b.type==='castle'){b.cooldown-=dt;const range=(b.type==='tower'?2.3:1.45)+e.range;const target=s.units.filter(u=>u.side!==b.side&&isAlive(s,u.side)&&u.hp>0&&distance(c,u)<=range).sort((a,z)=>distance(c,a)-distance(c,z))[0];if(target&&b.cooldown<=0){target.hp-=(b.type==='tower'?20:13)*e.damage*routeEffects(s,b.side).towerDamage*directDamage(s,b.side,c);target.attack=.18;b.cooldown=.9/e.attackRate;s.events.push({type:'shot',from:c.id,to:target.id,side:b.side});}}
 }
 for(const u of s.units.slice()){
  if(u.hp<=0||!isAlive(s,u.side)||s.phase!=='playing')continue;const spec=UNIT[u.type],traits=u.traits||{damage:1,speed:1,range:0},unitRange=spec.range+(traits.range||0);u.cooldown-=dt;u.attack=Math.max(0,u.attack-dt);
  const target=s.units.filter(v=>v.side!==u.side&&isAlive(s,v.side)&&v.hp>0&&distance(u,v)<=unitRange).sort((a,b)=>distance(u,a)-distance(u,b))[0];
  const buildings=s.cells.filter(c=>c.building&&c.building.side!==u.side&&isAlive(s,c.building.side)&&distance(u,c)<=unitRange).sort((a,b)=>distance(u,a)-distance(u,b));
  if(target||buildings.length){if(u.cooldown<=0){if(target){target.hp-=spec.damage*(traits.damage??1)*directDamage(s,u.side,u);target.attack=.2;if(target.hp<=0){s.kills[u.side]++;s.gold[u.side]+=5;}}else damageBuilding(s,buildings[0],spec.damage*(traits.damage??1)*directDamage(s,u.side,u),u.side);u.cooldown=spec.cooldown;s.events.push({type:'hit',x:u.x,y:u.y,side:u.side});}continue;}
  if(u.moving===null){capture(s,s.cells[u.cell],u.side);if(u.cell===u.waypoint)u.waypoint=null;const goal=u.waypoint??chooseGoal(s,u);u.moving=goal===null?null:path(s,u.cell,goal);}
  if(u.moving!==null){const dest=s.cells[u.moving];if(!dest||dest.water){u.moving=null;continue;}const dist=distance(u,dest),step=spec.speed*(traits.speed??1)*dt;if(dist<=step){u.x=dest.x;u.y=dest.y;u.cell=dest.id;u.moving=null;capture(s,dest,u.side);}else{u.x+=(dest.x-u.x)/dist*step;u.y+=(dest.y-u.y)/dist*step;}u.walk+=dt;}
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
 if(s.phase!=='playing'||!isAlive(s,side)||!validTreasury(s,side)||!validRoute(s,side))return;
 const free=available(s,side),owned=s.cells.filter(c=>c.building?.side===side),mines=owned.filter(c=>c.building.type==='mine').length,army=owned.filter(c=>UNIT[c.building.type]).length;
 let choices=free.filter(c=>own(TYPES,c.offer)&&c.offer!=='arsenal'&&TYPES[c.offer].cost<=s.gold[side]);
 // Existing technologies retain their priority and costs (including V2's six-upgrade sequence).
 if(!s.classic&&army>=2){const order=mines>=2?['economy','training','armor']:['training','armor'];for(const key of order){const cost=upgradeCost(s,key,side);if(cost!==null&&s.gold[side]>=cost+50&&s.upgrades[side][key]<1+(s.elapsed>90)){upgrade(s,key,side);return;}}}
 const route=routeState(s,side);
 if(mines>=2&&army>=2&&s.elapsed>=25){
  if(route.key===null&&s.gold[side]>=routeCost(s,side)+100){chooseRoute(s,['economy','defense','offense'][(s.seed+side)%3],side);return;}
  if(route.key!==null&&route.level===1&&s.elapsed>100&&s.gold[side]>=routeCost(s,side)+100){upgradeRoute(s,side);return;}
 }
 if(mines>=2&&army>=3&&s.elapsed>35&&free.length){
  // AI invests in passive support. Arsenals and weapon fire require manual control.
  for(const type of ['beacon','hospital'])if(!owned.some(c=>c.building.type===type)&&s.gold[side]>=TYPES[type].cost+50){
   const target=free.slice().sort((a,b)=>owned.filter(c=>UNIT[c.building.type]&&distance(c,b)<=2.5).length-owned.filter(c=>UNIT[c.building.type]&&distance(c,a)<=2.5).length||a.id-b.id)[0];purchase(s,target.id,side,type);return;
  }
 }
 if(mines>=2&&army>=2&&s.elapsed>50){
  const preferred={mine:route.key==='defense'?'fortified':'yield',barracks:route.key==='offense'?'drill':'veteran',archer:route.key==='offense'?'volley':'longbow',tower:route.key==='offense'?'rapid':'bastion',knight:route.key==='offense'?'charge':'plate',hospital:'triage',beacon:route.key==='offense'?'banner':'drums'};
  const candidates=owned.filter(c=>own(BUILDING_UPGRADES,c.building.type)&&c.building.type!=='arsenal'&&(c.building.level||1)<3).sort((a,b)=>(a.building.level||1)-(b.building.level||1)||((a.id+s.seed)%11)-((b.id+s.seed)%11));
  for(const c of candidates){const branch=c.building.branch||preferred[c.building.type],cost=buildingUpgradeCost(s,c.id,branch,side);if(cost!==null&&s.gold[side]>=cost+100){upgradeBuilding(s,c.id,branch,side);return;}}
 }
 choices=choices.map(c=>({cell:c,score:score(c)})).sort((a,b)=>b.score-a.score).map(x=>x.cell);
 function score(c){let v=s.random()*2;if(c.offer==='mine')v+=mines<2?12:mines<4?5:0;if(c.offer==='barracks')v+=army<2?10:5;if(c.offer==='mystery')v+=4;if(c.offer==='knight')v+=7;if(c.offer==='archer')v+=6;if(c.offer==='tower')v+=s.units.some(u=>u.side!==side&&isAlive(s,u.side)&&distance(c,u)<3)?12:1;return v;}
 if(choices.length)purchase(s,choices[0].id,side);
}
return {COLS,ROWS,DURATION,FACTIONS,MODES,MAPS,TYPES,UNIT,UPGRADES,ROUTES,BUILDING_UPGRADES,WEAPONS,create,available,purchase,upgrade,upgradeCost,chooseRoute,upgradeRoute,routeCost,upgradeBuilding,buildingUpgradeCost,weaponStatus,previewWeapon,fireWeapon,buildingEffects,trainingRate,tick,stats,ai,path,finish,neighborsIndex,distance,damageBuilding,chooseGoal};
});
