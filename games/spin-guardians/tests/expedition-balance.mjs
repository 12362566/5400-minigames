/** Real-money deterministic balancing harness. Never injects combat resources. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ExpeditionGame } from '../expedition.js';
import { MAPS, HEROES, MAX_HEROES } from '../engine.js';
import { TALENTS, RELICS_LONG, COMBOS } from '../content.js';

const ids = data => Array.isArray(data) ? data.map(x=>x.id) : Object.keys(data);
const lookup = (data, id) => Array.isArray(data) ? data.find(x=>x.id===id) : data[id];
const heroTypes=['blade','fire','frost','thunder'];
export function bestCells(game) {
 const map=MAPS[game.state.mapIndex], cells=[];
 for(let y=0;y<11;y++)for(let x=0;x<9;x++)if(game.isBuildable(x,y)&&!game.heroAt(x,y)) {
  const score=map.path.reduce((sum,p)=>{const d=Math.hypot(x-p[0],y-p[1]);return sum+(d>.75&&d<1.9?1:0)},0)+(y===9?.4:0);
  cells.push({x,y,score});
 }
 return cells.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
}
export function improveArmy(game, strategy='balanced') {
 const s=game.state;
 let guard=0;
 while(s.gold>=50&&guard++<120) {
  // Merge only when the field is full, preserving immediate orbital coverage.
  if(s.heroes.length>=MAX_HEROES) {
   const a=s.heroes.find(a=>a.level<6&&s.heroes.some(b=>a!==b&&a.type===b.type&&a.level===b.level));
   if(!a)break;
   const b=s.heroes.find(b=>b!==a&&b.type===a.type&&b.level===a.level);
   assert.equal(game.merge(a.id,b.id),true);continue;
  }
  const cells=bestCells(game);if(!cells.length)break;
  const count=type=>s.heroes.filter(h=>h.type===type).length;
  let type;
  if(strategy==='flame')type=count('frost')<2?'frost':count('thunder')<2?'thunder':'fire';
  else if(strategy==='storm')type=count('frost')<3?'frost':count('fire')<1?'fire':'thunder';
  else type=count('frost')<2?'frost':count('thunder')<3?'thunder':count('fire')<3?'fire':'blade';
  if(s.gold<HEROES[type].cost)type='blade';
  if(!game.buy(type,cells[0].x,cells[0].y))break;
 }
}
export function trainArmy(game, strategy='balanced') {
 const talents=ids(TALENTS);
 let attempts=0;
 while(game.state.talentPoints>0&&attempts++<50){
  let trained=false;
  // Stable rotating order creates different legal branches for each strategy.
  const priorities = strategy==='flame' ? ['fire_inferno','frost_glacier','thunder_tempest','blade_reaper','might','rhythm','incubation','command','prosperity','reachcraft'] : strategy==='storm' ? ['thunder_tempest','frost_glacier','fire_alchemist','blade_duelist','rhythm','might','command','reachcraft','prosperity','incubation'] : ['might','rhythm','blade_duelist','fire_alchemist','frost_shatter','thunder_conductor','command','reachcraft','prosperity','incubation'];
  const order=[...priorities,...talents.filter(id=>!priorities.includes(id))];
  for(const id of order)if(game.train(id)){trained=true;break;}
  if(!trained)break;
 }
 const available=game.state.unlockedCombos||[];
 const preferred=strategy==='flame'?['combo_fire_frost','combo_fire_thunder']:strategy==='storm'?['combo_frost_thunder','combo_blade_thunder']:['combo_blade_frost','combo_blade_fire'];
 const wanted=[...preferred.filter(id=>available.includes(id)),...available.filter(id=>!preferred.includes(id))].slice(0,2);
 for(const id of [...game.state.combos])if(!wanted.includes(id))game.equipCombo(id);
 for(const id of wanted)if(!game.state.combos.includes(id))game.equipCombo(id);
}
export function chooseNode(game, strategy='balanced', route='balanced') {
 const s=game.state;
 if(s.phase==='reward'){
  const priority=['sharp','haste','reach','winter','fortress','bounty'];
  const chosen=priority.find(id=>s.choices.includes(id))||s.choices[0];
  assert.ok(game.chooseRelic(chosen),`reward ${chosen}: ${s.lastMessage}`);
 } else if(s.phase==='route') {
  const chosen=s.choices.includes(route)?route:s.choices[0];
  assert.ok(game.chooseRoute(chosen),`route ${chosen}: ${s.lastMessage}`);
 } else if(s.phase==='event') {
  // Evaluate offered options in stable order; illegal/unaffordable options may decline.
  assert.ok(s.choices.some(id=>game.chooseEvent(id)),`event: ${s.lastMessage}`);
 } else if(s.phase==='shop') {
  for(const offer of s.shopOffers||[]){
   if(s.gold>offer.price+250&&!offer.sold)game.buyOffer(offer.id);
  }
  assert.ok(game.leaveNode(),`shop exit: ${s.lastMessage}`);
 } else if(s.phase==='camp') {
  if(s.choices.length)assert.ok(s.choices.some(id=>game.chooseEvent(id)),`camp: ${s.lastMessage}`);
  else assert.ok(game.leaveNode(),`camp exit: ${s.lastMessage}`);
 }
 trainArmy(game,strategy);
}
export function runCampaign({seed=123,strategy='balanced',route='balanced',early=false,checkpoint=false}={}){
 let game=new ExpeditionGame(seed);const s0=game.state;
 assert.ok(game.buy('blade',2,2));assert.ok(game.buy('blade',6,4));assert.ok(game.buy('fire',3,9));
 const phases=[],waves=[],stats={maxEnemies:0,maxEffects:0,maxHeroes:0,earlyCalls:0,restores:0},start=performance.now();
 let ticks=0,lastWave=0,lastPhase='',waveStart=0;
 while(!['won','lost'].includes(game.state.phase)&&ticks<12000){
  const s=game.state;
  if(s.phase!==lastPhase){phases.push(`${s.phase}:${s.wave}`);lastPhase=s.phase;}
  if(s.phase==='build'){
   improveArmy(game,strategy);trainArmy(game,strategy);
   if(typeof game.promote==='function'){let promotionGuard=0;while(promotionGuard++<50){const target=[...s.heroes].filter(h=>h.level<6).sort((a,b)=>a.level-b.level).find(h=>game.promotionCost(h.id)<=s.gold-50);if(!target||!game.promote(target.id))break;}}
   if(typeof game.setActive==='function')game.setActive(strategy==='storm'?'blizzard':'rally');
   waveStart=s.battleTime;
   assert.ok(game.startWave());
  } else if(s.phase==='battle') {
   if(ticks%6===0){improveArmy(game,strategy);trainArmy(game,strategy);}
   if(typeof game.useActive==='function'&&(s.bossWarning||s.enemies.length>12))game.useActive();
   if(early&&s.enemies.length<4&&s.nextReinforcement>3&&typeof game.callReinforcements==='function'&&game.callReinforcements())stats.earlyCalls++;
   game.update(.5);ticks++;
   if(s.phase!=='battle')waves.push({wave:s.wave,seconds:Number((s.battleTime-waveStart).toFixed(2)),lives:s.lives,gold:s.gold,heroes:s.heroes.length});
  } else chooseNode(game,strategy,route);
  const current=game.state;
  stats.maxEnemies=Math.max(stats.maxEnemies,current.enemies.length);stats.maxEffects=Math.max(stats.maxEffects,current.effects.length);stats.maxHeroes=Math.max(stats.maxHeroes,current.heroes.length);
  assert.ok(current.gold>=0&&current.heroes.length<=12&&current.effects.length<=100&&current.enemies.length<=72,'resource/performance caps');
  if(checkpoint&&((current.phase!=='battle'&&current.wave!==lastWave)||(current.phase==='battle'&&ticks%60===0))){const before=game.serialize();game=ExpeditionGame.restore(JSON.stringify(before));assert.deepEqual(game.serialize(),before);stats.restores++;lastWave=current.wave;}
 }
 return {game,report:{seed,strategy,route,early,phase:game.state.phase,wave:game.state.wave,lives:game.state.lives,battleMinutes:Number((game.state.battleTime/60).toFixed(2)),simulatedSeconds:game.state.battleTime,wallMilliseconds:Math.round(performance.now()-start),levels:game.state.level,interrupts:game.state.stats.interrupts,bossDelays:game.state.stats.bossDelays||0,promotions:game.state.stats.promotions||0,talents:game.state.talents,equippedCombos:game.state.combos,relics:game.state.relics.length,reactions:game.state.stats.reactions,combos:game.state.stats.comboTriggers,kills:game.state.stats.kills,bosses:game.state.stats.bosses,highestLevel:game.state.stats.highestLevel,...stats,waves,phases}};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const reports=[];
 for(const setup of [{seed:123,checkpoint:true},{seed:42,strategy:'flame'},{seed:987,strategy:'storm'},{seed:456,route:'elite'},{seed:789,route:'fortune'},{seed:123,early:true,checkpoint:true}]){
  const {report}=runCampaign(setup);reports.push(report);console.log(JSON.stringify(report));
 }
 fs.writeFileSync(new URL('./balance-results.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),method:'60 Hz engine, legal purchases/merges/talents/rewards, no injected money, HP or lives; battle time excludes human decision time.',reports},null,2));
 assert.ok(reports.every(r=>r.phase==='won'),'Every nominated build must complete all 30 waves');
}
