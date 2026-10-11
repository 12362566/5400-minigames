import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Game } from '../engine.js';
import { ExpeditionGame } from '../expedition.js';
import { TALENTS, RELICS_LONG, COMBOS, getEncounter } from '../content.js';
import { chooseNode, trainArmy } from './expedition-balance.mjs';

function finishForFixture(game) {
 const s=game.state;
 if(s.phase==='build')assert.ok(game.startWave());
 assert.equal(s.phase,'battle');
 s.enemies=[];s.spawnQueue=[];s.nextReinforcement=0;
 game._finishWave();
}
function legalStart(seed=123){const g=new ExpeditionGame(seed);assert.ok(g.buy('blade',2,2));assert.ok(g.buy('fire',6,4));return g;}

test('long expedition is isolated from unchanged classic and legacy eight-wave engine',()=>{
 const long=new ExpeditionGame(1),classic=new Game(1,'classic'),legacy=new Game(1,'roguelike');
 assert.equal(long.state.totalWaves,30);assert.equal(long.state.mode,'expedition');
 assert.equal(classic.state.totalWaves,8);assert.equal(legacy.state.totalWaves,8);
 assert.equal(classic.serialize().version,1);assert.equal(long.serialize().version,2);
 assert.deepEqual(Game.restore(legacy.serialize()).serialize(),legacy.serialize());
});

test('new run, battle and every mandatory decision survive exact save/restore',()=>{
 let g=legalStart(715), phases=new Set();
 for(let wave=1;wave<=7;wave++){
  assert.equal(g.state.phase,'build');assert.ok(g.startWave());g.update(.75);
  assert.deepEqual(ExpeditionGame.restore(g.serialize()).serialize(),g.serialize());
  g.state.enemies=[];g.state.spawnQueue=[];g._finishWave();
  let guard=0;
  while(g.state.phase!=='build'&&guard++<10){
   phases.add(g.state.phase);
   const before=g.serialize();g=ExpeditionGame.restore(JSON.stringify(before));assert.deepEqual(g.serialize(),before);
   chooseNode(g);
  }
  assert.equal(g.state.wave,wave);
 }
 for(const phase of ['reward','event','shop','camp','route'])assert.ok(phases.has(phase),phase);
});

test('battle replay is fixed-step deterministic at 60Hz,30Hz and batched updates',()=>{
 const games=[legalStart(848),legalStart(848),legalStart(848)];for(const g of games)g.startWave();
 for(let i=0;i<1200;i++)games[0].update(1/60);
 for(let i=0;i<600;i++)games[1].update(1/30);
 for(let i=0;i<40;i++)games[2].update(.5);
 assert.deepEqual(games[0].serialize(),games[1].serialize());assert.deepEqual(games[1].serialize(),games[2].serialize());
 const restored=ExpeditionGame.restore(games[0].serialize());
 for(let i=0;i<120;i++){games[0].update(.1);restored.update(.1);}
 assert.deepEqual(games[0].serialize(),restored.serialize());
});

test('mandatory rewards reject unrelated actions and cannot be redeemed twice',()=>{
 const g=legalStart();finishForFixture(g);assert.equal(g.state.phase,'reward');
 const choice=g.state.choices[0];assert.equal(g.startWave(),false);assert.equal(g.buy('blade',4,2),false);
 assert.ok(g.chooseRelic(choice));const after=g.serialize();assert.equal(g.chooseRelic(choice),false);
 // Rejected inputs may update the explanatory message but cannot change resources.
 assert.equal(g.state.gold,after.state.gold);assert.deepEqual(g.state.relicRanks,after.state.relicRanks);
 assert.equal(g.chooseRelic('constructor'),false);assert.equal(g.chooseRoute('constructor'),false);
});

test('talent points and exclusive branches are bounded and persist',()=>{
 const g=legalStart();g.state.talentPoints=40;
 for(const [id,talent] of Object.entries(TALENTS)){
  const before=g.state.talentPoints;
  if(g.train(id)){assert.equal(g.state.talentPoints,before-1);assert.ok(g.state.talents[id]>0);}
 }
 trainArmy(g);for(const rank of Object.values(g.state.talents))assert.ok(rank>=1&&rank<=3);
 const before=g.state.talentPoints;assert.equal(g.train('toString'),false);assert.equal(g.state.talentPoints,before);
 assert.deepEqual(ExpeditionGame.restore(g.serialize()).serialize(),g.serialize());
});

test('combo unlocks derive from real merged class milestones, equip capacity is two',()=>{
 const g=new ExpeditionGame(600);g.state.gold=5000;
 const spots=[[2,2],[3,2],[4,2],[5,2]];
 for(const [i,type] of ['blade','fire','frost','thunder'].entries()){
  const [x,y]=spots[i];g._addHero(type,x,y,3);
 }
 g._refreshCombos();assert.equal(g.state.unlockedCombos.length,6);
 for(const id of g.state.unlockedCombos)g.equipCombo(id);
 assert.ok(g.state.combos.length<=2);assert.ok(g.state.combos.length>0);
 assert.equal(g.equipCombo('invalid'),false);
 assert.deepEqual(ExpeditionGame.restore(g.serialize()).serialize(),g.serialize());
});

test('unattended poor placement loses with no free rescue',()=>{
 const g=new ExpeditionGame(909);g.buy('blade',8,10);g.startWave();
 for(let i=0;i<360&&g.state.phase==='battle';i++)g.update(.5);
 assert.equal(g.state.phase,'lost');assert.equal(g.state.lives,0);
});

test('restore rejects corrupt numeric, entity, catalog and mode fields',()=>{
 const g=legalStart();g.startWave();g.update(1);const save=g.serialize();
 const mutations=[s=>s.gold=-1,s=>s.lives=NaN,s=>s.totalWaves=8,s=>s.mode='classic',s=>s.wave=31,s=>s.talentPoints=-1,s=>s.talents={constructor:1},s=>s.relicRanks={bad:1},s=>s.combos=['bad'],s=>s.unlockedCombos=['bad'],s=>s.activeSkill='bad',s=>s.activeCooldown=Infinity,s=>s.heroes[0].x=-1,s=>s.heroes[0].id=s.heroes[1].id,s=>s.enemies=null,s=>s.effects=null,s=>s.nodeQueue=['bad']];
 for(const mutate of mutations){const bad=structuredClone(save);mutate(bad.state);assert.throws(()=>ExpeditionGame.restore(bad),String(mutate));}
});
