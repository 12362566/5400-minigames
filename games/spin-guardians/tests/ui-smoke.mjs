import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game as LegacyGame} from '../engine.js';
import {ExpeditionGame} from '../expedition.js';
import {TALENTS,COMBOS,EVENTS,CAMP_OPTIONS,SHOP_ITEMS} from '../content.js';
const elements=new Map();
class Element {
 constructor(id='',dataset={}){this.id=id;this.dataset=dataset;this.style={};this.hidden=false;this.open=false;this.disabled=false;this.listeners={};this.classList={add(){},remove(){},toggle(){}};this.tagName='DIV';this.children=[];this._html='';}
 set innerHTML(html){this._html=html;this.children=[];for(const m of html.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=m[2],id=attrs.match(/\bid="([^"]+)"/)?.[1]||'',dataset={};for(const d of attrs.matchAll(/data-([a-z]+)="([^"]*)"/g))dataset[d[1]]=d[2];if(/data-close\b/.test(attrs))dataset.close='';if(id||Object.keys(dataset).length){const child=new Element(id,dataset);child.tagName=m[1].toUpperCase();this.children.push(child);if(id)elements.set(id,child)}}}
 get innerHTML(){return this._html}
 querySelectorAll(selector){const key=selector.match(/\[data-([a-z]+)\]/)?.[1];return key?this.children.filter(e=>key in e.dataset):[]}
 setAttribute(){} addEventListener(name,fn){this.listeners[name]=fn} getBoundingClientRect(){return {left:0,top:0,width:360,height:440}} showModal(){this.open=true}close(){this.open=false}
}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const id of html.matchAll(/id="([^"]+)"/g))elements.set(id[1],new Element(id[1]));
let draws=0;const ctx=new Proxy({setTransform(){draws++}}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});elements.get('board').getContext=()=>ctx;
const storage=new Map([['woodland-seen','1'],['woodland-guardians-v1',JSON.stringify(new LegacyGame(123,'roguelike').serialize())]]);globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
globalThis.document={getElementById:id=>elements.get(id),querySelectorAll:selector=>[...elements.values()].flatMap(e=>e.querySelectorAll(selector)),addEventListener(){},activeElement:{tagName:'BODY'}};
globalThis.window={addEventListener(){}};globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;let frame;globalThis.requestAnimationFrame=fn=>{frame=fn};
await import('../app.js');const get=id=>elements.get(id),game=window.__game();
assert.equal(game.state.phase,'build');assert.equal(get('startBtn').disabled,true);
const cards=document.querySelectorAll('[data-type]');assert.equal(cards.length,4);cards[0].onclick();assert.match(get('contextPanel').innerHTML,/部署预览/);
get('board').listeners.pointerdown({clientX:2.5/9*360,clientY:2.5/11*440});get('board').listeners.pointerup({clientX:2.5/9*360,clientY:2.5/11*440});assert.equal(game.state.heroes.length,1);assert.equal(game.state.gold,130);assert.equal(get('startBtn').disabled,false);
cards[0].onclick();get('board').listeners.pointerdown({clientX:100,clientY:100});get('board').listeners.pointerup({clientX:100,clientY:145});assert.equal(game.state.heroes.length,1,'swipe must not deploy');get('board').listeners.pointerdown({clientX:100,clientY:100});get('board').listeners.pointercancel();get('board').listeners.pointerup({clientX:100,clientY:100});assert.equal(game.state.heroes.length,1,'cancel must not deploy');
get('clearBtn').onclick();assert.equal(game.buy('blade',6,4),true);window.__ui.refresh(true);
get('board').listeners.pointerdown({clientX:2.5/9*360,clientY:2.5/11*440});get('board').listeners.pointerup({clientX:2.5/9*360,clientY:2.5/11*440});assert.equal(get('mergeBtn').hidden,false);assert.match(get('boardHint').textContent,/1 位可合成/);
get('mergeBtn').onclick();assert.match(get('modalContent').innerHTML,/14 → 23/);assert.match(get('modalContent').innerHTML,/保留的位置/);get('modalContent').querySelectorAll('[data-merge]')[0].onclick();assert.equal(game.state.heroes.length,1);assert.equal(game.state.heroes[0].level,2);assert.equal(game.state.heroes[0].x,6);assert.equal(game.state.gold,80);assert.equal(get('mergeBtn').hidden,true);
get('waveLabel').onclick();assert.match(get('modalContent').innerHTML,/16 位初始来敌/);assert.match(get('modalContent').innerHTML,/疾跑者/);get('modalContent').querySelectorAll('[data-close]')[0].onclick();assert.equal(get('modal').open,false);
get('startBtn').onclick();assert.equal(game.state.phase,'battle');const battleSave=game.serialize();frame(16);const firstDraws=draws;frame(32);assert.equal(draws,firstDraws,'30fps cap must skip unnecessary render');assert.match(get('waveLabel').textContent,/1 \/ 8/);
get('pauseBtn').onclick();assert.equal(get('pauseVeil').hidden,false);get('resumeBtn').onclick();assert.equal(get('pauseVeil').hidden,true);
get('helpBtn').onclick();assert.equal(get('modal').open,true);assert.match(get('modalContent').innerHTML,/同种同级/);get('tutorialDone').onclick();assert.equal(get('modal').open,false);
get('settingsBtn').onclick();get('soundToggle').onclick();get('motionToggle').onclick();assert.ok(storage.has('woodland-guardians-prefs'));get('restartBtn').onclick();assert.match(get('modalContent').innerHTML,/无法撤销/);
get('confirmRestart').onclick();assert.ok(get('classicMode'));get('classicMode').onclick();assert.equal(window.__game().state.mode,'classic');assert.equal(window.__game().state.wave,0);
const s=window.__game().state;s.phase='reward';s.choices=['sharp','haste','reach'];frame(64);assert.match(get('modalContent').innerHTML,/磨刀石/);get('modalContent').querySelectorAll('[data-choice]')[0].onclick();assert.ok(s.relics.includes('sharp'));assert.equal(get('modal').open,false);
s.phase='route';s.choices=['0','1','2'];frame(80);assert.match(get('modalContent').innerHTML,/琥珀矿道/);get('modalContent').querySelectorAll('[data-route]')[1].onclick();assert.equal(s.mapIndex,1);
s.phase='won';s.wave=8;frame(96);assert.match(get('modalContent').innerHTML,/守住了/);get('reviewBtn').onclick();assert.equal(get('modal').open,false);frame(112);assert.equal(get('modal').open,false);
window.innerWidth=390;get('boardWrap').clientWidth=366;get('boardWrap').clientHeight=474;window.__ui.draw();assert.equal(get('board').style.width,'366px');assert.equal(get('board').style.height,(366*11/9)+'px');window.innerWidth=320;get('boardWrap').clientWidth=296;get('boardWrap').clientHeight=274;window.__ui.draw();assert.equal(Number.parseFloat(get('board').style.height),274);
const beforeHidden=s.time,hiddenDraws=draws;document.hidden=true;frame(250);assert.equal(s.time,beforeHidden);assert.equal(draws,hiddenDraws);document.hidden=false;
window.__ui.save();assert.ok(storage.has('woodland-guardians-v1'));storage.set('woodland-guardians-v1',JSON.stringify(battleSave));await import('../app.js?restore-check=1');assert.equal(window.__game().state.phase,'battle');assert.equal(get('pauseVeil').hidden,false,'restored battle must wait for explicit resume');
console.log('UI smoke passed: shop, placement, swipe guards, merge upgrade/destination preview, wave scouting, 30fps cap/offscreen suspension, start, pause, tutorial, settings, restart safeguards, modes, rewards/routes, endings, save and proportional canvas. This is mocked DOM/canvas, not real browser layout QA.');

// Long campaign UI: new default, compact build controls, save-on-mutation and all forced nodes.
storage.delete('woodland-guardians-v1');window.innerWidth=1280;
await import('../app.js?expedition-default=2');
let expedition=window.__game();assert.equal(expedition.state.mode,'expedition');assert.equal(expedition.state.totalWaves,30);
assert.match(get('waveLabel').textContent,/1 \/ 30/);assert.match(get('waveTitle').textContent,/第 1 章/);
assert.equal(get('activeBtn').hidden,false);assert.equal(get('activeBtn').disabled,true);
const selected=(key,value)=>get('modalContent').querySelectorAll(`[data-${key}]`).find(b=>value===undefined||b.dataset[key]===value);
const saved=()=>JSON.parse(storage.get('woodland-guardians-v1'));
expedition.state.talentPoints=4;
get('buildBtn').onclick();assert.equal(get('modalContent').querySelectorAll('[data-buildtab]').length,4);
selected('train','might').onclick();assert.equal(expedition.state.talents.might,1);assert.equal(saved().state.talents.might,1);
selected('train','blade_duelist').onclick();assert.equal(expedition.state.talents.blade_duelist,1);
assert.match(get('modalContent').innerHTML,/另一专精已选，互斥/);
selected('buildtab','combos').onclick();selected('active','blizzard').onclick();assert.equal(expedition.state.activeSkill,'blizzard');assert.equal(saved().state.activeSkill,'blizzard');
expedition.state.classMilestones={blade:3,fire:3,frost:3,thunder:3};expedition._refreshCombos();window.__ui.openBuild('combos');
assert.equal(expedition.state.combos.length,2);const removed=expedition.state.combos[0];selected('combo',removed).onclick();assert.equal(expedition.state.combos.length,1);selected('combo',removed).onclick();assert.equal(expedition.state.combos.length,2);assert.equal(saved().state.combos.length,2);
selected('buildtab','codex').onclick();assert.match(get('modalContent').innerHTML,/元素反应/);assert.match(get('modalContent').innerHTML,/虚空窃能者/);selected('close').onclick();
assert.equal(expedition.buy('blade',2,2),true);window.__ui.refresh(true);get('startBtn').onclick();assert.equal(expedition.state.phase,'battle');
get('activeBtn').onclick();assert.ok(expedition.state.activeCooldown>0);assert.ok(saved().state.activeCooldown>0);
expedition.update(.25);window.__ui.refresh(true);assert.ok(expedition.state.nextReinforcement>3);assert.equal(get('startBtn').disabled,false);get('startBtn').onclick();assert.equal(expedition.state.stats.earlyCalls,1);assert.equal(saved().state.stats.earlyCalls,1);
// Finish one live wave; choosing a reward must persist before any next frame.
expedition._finishWave();window.__ui.showPhase();assert.equal(expedition.state.phase,'reward');assert.equal(saved().state.phase,'reward');
let prevented=false;get('modal').listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);
get('nodeBuild').onclick();assert.equal(get('modal').open,true);selected('close').onclick();assert.match(get('modalContent').innerHTML,/带走一份林地/);
const reward=expedition.state.choices[0];selected('choice',reward).onclick();assert.equal(expedition.state.relicRanks[reward],1);assert.equal(saved().state.relicRanks[reward],1);assert.equal(expedition.state.phase,'build');
// Promotion is visible in selected hero details without adding another dock row.
expedition.state.gold=1000;get('board').listeners.pointerdown({clientX:2.5/9*360,clientY:2.5/11*440});get('board').listeners.pointerup({clientX:2.5/9*360,clientY:2.5/11*440});
assert.match(get('contextPanel').innerHTML,/可晋升/);const oldLevel=expedition.state.heroes[0].level;get('promoteBtn').onclick();assert.match(get('modalContent').innerHTML,/25% 省位费/);get('confirmPromote').onclick();assert.equal(expedition.state.heroes[0].level,oldLevel+1);assert.equal(saved().state.heroes[0].level,oldLevel+1);window.innerWidth=320;get('contextPanel').onclick({target:{tagName:'DIV'}});assert.equal(typeof get('modalPromote').onclick,'function','narrow-screen details must expose promotion');selected('close').onclick();window.innerWidth=1280;
function finishNext(){get('startBtn').onclick();assert.equal(expedition.state.phase,'battle');expedition._finishWave();window.__ui.showPhase()}
finishNext();assert.equal(expedition.state.phase,'event');assert.ok(EVENTS[expedition.state.eventId]);assert.equal(saved().state.phase,'event');
prevented=false;get('modal').listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);selected('event').onclick();assert.equal(expedition.state.phase,'build');
finishNext();assert.equal(expedition.state.phase,'reward');selected('choice').onclick();assert.equal(expedition.state.phase,'shop');assert.ok(expedition.state.shopOffers.length);
expedition.state.gold=1000;window.__ui.showPhase();const offer=expedition.state.shopOffers.find(o=>{const effect=SHOP_ITEMS[o.id].effects;return !o.sold&&(!effect.egg||expedition.state.eggs.length<3)&&(!effect.hero||expedition.state.heroes.length<12)&&(!effect.relic||effect.relic==='random'||(expedition.state.relicRanks[effect.relic]||0)<3)});assert.ok(offer,'shop should offer at least one eligible purchase');selected('offer',offer.id).onclick();assert.equal(offer.sold,true);assert.equal(saved().state.shopOffers.find(o=>o.id===offer.id).sold,true);assert.equal(get('modal').open,true);const moneyAfterPurchase=expedition.state.gold;assert.equal(expedition.buyOffer(offer.id),false);assert.equal(expedition.state.gold,moneyAfterPurchase,'sold offers must not debit again');
prevented=false;get('modal').listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);get('leaveNode').onclick();assert.equal(expedition.state.phase,'build');
finishNext();selected('choice').onclick();assert.equal(expedition.state.phase,'build');finishNext();assert.equal(expedition.state.phase,'camp');assert.equal(selected('event','rest').dataset.event,'rest');assert.match(get('modalContent').innerHTML,/100 金币/);
prevented=false;get('modal').listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);selected('event','train').onclick();assert.equal(expedition.state.phase,'build');
finishNext();selected('choice').onclick();assert.equal(expedition.state.phase,'route');assert.match(get('modalContent').innerHTML,/精英狩猎/);selected('route','elite').onclick();assert.equal(expedition.state.route,'elite');assert.equal(expedition.state.mapIndex,1);assert.equal(saved().state.route,'elite');
window.__ui.modePicker();assert.match(get('modalContent').innerHTML,/30 波/);assert.match(get('modalContent').innerHTML,/45–75 分钟/);get('rogueMode').onclick();assert.match(get('modalContent').innerHTML,/无法撤销/);selected('close').onclick();
window.__ui.newRun('expedition');expedition=window.__game();assert.equal(expedition.buy('blade',2,2),true);get('startBtn').onclick();window.__ui.save();
const expeditionBattleSave=saved();assert.equal(expeditionBattleSave.version,2);
await import('../app.js?expedition-restore-battle=3');assert.equal(window.__game().state.mode,'expedition');assert.equal(window.__game().state.phase,'battle');assert.equal(get('pauseVeil').hidden,false);
expedition=window.__game();expedition._finishWave();window.__ui.showPhase();window.__ui.save();const pendingReward=saved();
await import('../app.js?expedition-restore-reward=4');assert.equal(window.__game().state.phase,'reward');assert.equal(get('modal').open,true);assert.deepEqual(window.__game().state.choices,pendingReward.state.choices);assert.match(get('modalContent').innerHTML,/带走一份林地/);
// No Escape bypass or silent new-run replacement while a reward is outstanding.
prevented=false;get('modal').listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);window.__ui.modePicker();get('classicMode').onclick();assert.match(get('modalContent').innerHTML,/待选奖励/);selected('close').onclick();assert.equal(window.__game().state.phase,'reward');assert.match(get('modalContent').innerHTML,/带走一份林地/);
console.log('Expedition UI smoke passed: 30-wave default, four build tabs, talent ranks/exclusive branches, combo equips, active switch/use, batch early-call, promotion, reward/event/shop/camp/route controls, forced Escape protection, immediate v2 saves, old v1 restore, resumable reward and paused battle restore. Mocked DOM/canvas only.');

const corruptRaw='{"version":2,"state":{"mode":"expedition","phase":"battle"}}';storage.set('woodland-guardians-v1',corruptRaw);
await import('../app.js?corrupt-recovery=5');assert.match(get('modalContent').innerHTML,/原数据已保留/);assert.match(get('saveStatus').textContent,/未覆盖/);
assert.equal(storage.get('woodland-guardians-recovery'),corruptRaw);window.__ui.save();assert.equal(storage.get('woodland-guardians-v1'),corruptRaw);
for(let i=1;i<=120;i++)frame(500+i*50);assert.equal(storage.get('woodland-guardians-v1'),corruptRaw,'automatic saving cannot overwrite a failed restore');
get('recoverNew').onclick();get('rogueMode').onclick();assert.equal(saved().version,2);assert.equal(saved().state.mode,'expedition');assert.ok(saved().state.heroes);assert.equal(storage.get('woodland-guardians-recovery'),corruptRaw);
console.log('Failed-restore protection passed: recovery backup retained, auto-save blocked, explicit new run unblocks saving.');

// Reload every pending node from genuine engine transitions, not fabricated phases.
const checkpointGame=new ExpeditionGame(8841),checkpoints=new Map();checkpointGame.buy('blade',2,2);
for(let wave=1;wave<=6;wave++){
 assert.equal(checkpointGame.startWave(),true);checkpointGame._finishWave();
 while(checkpointGame.state.phase!=='build'){
  const phase=checkpointGame.state.phase;if(!checkpoints.has(phase))checkpoints.set(phase,checkpointGame.serialize());
  if(phase==='reward')assert.equal(checkpointGame.chooseRelic(checkpointGame.state.choices[0]),true);
  else if(phase==='event'){assert.ok(checkpointGame.state.choices.some(id=>checkpointGame.chooseEvent(id)));}
  else if(phase==='camp')assert.equal(checkpointGame.chooseEvent('train'),true);
  else if(phase==='shop')assert.equal(checkpointGame.leaveNode(),true);
  else if(phase==='route')assert.equal(checkpointGame.chooseRoute('balanced'),true);
  else assert.fail('unexpected node '+phase);
 }
}
for(const[phase,data]of checkpoints){
 storage.set('woodland-guardians-v1',JSON.stringify(data));await import(`../app.js?restore-every-${phase}=6`);
 assert.equal(window.__game().state.phase,phase);assert.equal(get('modal').open,true);assert.deepEqual(window.__game().state.choices,data.state.choices);
 let escaped=false;get('modal').listeners.cancel({preventDefault(){escaped=true}});assert.equal(escaped,true,phase+' must prevent Escape');
 if(phase==='shop')assert.deepEqual(window.__game().state.shopOffers,data.state.shopOffers);
}
assert.equal(checkpoints.size,5);console.log('All five pending node reloads passed: reward, event, shop, camp and route reopen without rerolling choices or offers.');
