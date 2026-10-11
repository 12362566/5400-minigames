import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpeditionGame, ACTIVE_SKILLS } from '../expedition.js';
import { getEncounter, BOSSES } from '../content.js';

function gameAt(wave = 6) {
  const g = new ExpeditionGame(813);
  g.buy('blade', 2, 2);
  const s = g.state;
  // Focused fixtures establish a legal current-wave envelope; no balance claim.
  Object.assign(s, { wave, stage: Math.ceil(wave / 6), phase: 'battle', level: wave,
    encounter: getEncounter(wave), spawnQueue: getEncounter(wave).schedule.map(entry => ({...entry})) });
  s.stats.wavesCleared = wave - 1;
  s.xpNext = s.encounter.count;
  return g;
}

test('phase-two boss reactions delay only once, while active skill fully interrupts', () => {
  const g = gameAt(12), boss = g._spawnEnemy('boss');
  boss.hp = boss.maxHp * 0.4; boss.bossNextCast = 0;
  g._bossTick(boss);
  assert.equal(boss.bossPhase, 2);
  const original = boss.bossCast.resolveAt;
  assert.equal(g._interrupt(boss), true);
  assert.equal(boss.bossCast.resolveAt, original + 1);
  assert.equal(boss.bossCast.interrupted, false);
  assert.equal(g._interrupt(boss), false);
  assert.equal(boss.bossCast.resolveAt, original + 1);
  assert.equal(g.state.stats.bossDelays, 1);
  g.state.activeSkill = 'blizzard';
  assert.equal(g.useActive(), true);
  assert.equal(boss.bossCast.interrupted, true);
  assert.equal(g.state.stats.interrupts, 1);
  assert.deepEqual(ExpeditionGame.restore(g.serialize()).serialize(), g.serialize());
});

test('phase-one reaction interrupts and an uninterrupted phase-two cast resolves', () => {
  const g = gameAt(), boss = g._spawnEnemy('boss');
  boss.bossNextCast = 0; g._bossTick(boss);
  assert.equal(g._interrupt(boss), true);
  assert.equal(boss.bossCast.interrupted, true);
  boss.bossCast = null; boss.hp = boss.maxHp * 0.4; boss.bossNextCast = 0;
  g._bossTick(boss); g._interrupt(boss);
  g.state.battleTime = boss.bossCast.resolveAt;
  g._bossTick(boss);
  assert.equal(boss.bossCast, null);
  assert.equal(boss.summons, BOSSES.thorn_king.phaseCount);
});

test('build-only promotion has exact price, spend, milestones and cap', () => {
  const g = new ExpeditionGame(51); g.buy('blade',2,2); const hero=g.state.heroes[0];
  assert.equal(g.promotionCost(hero.id),63);
  const before=g.state.gold;
  assert.equal(g.promote(hero.id),true); assert.equal(g.state.gold,before-63);
  assert.equal(hero.level,2); assert.equal(g.state.stats.promotions,1); assert.equal(hero.invested,113);
  g.startWave(); assert.equal(g.promote(hero.id),false);
  assert.deepEqual(ExpeditionGame.restore(g.serialize()).serialize(),g.serialize());
});

test('early batches cannot be claimed twice before or after resume', () => {
  const g=gameAt(1); g.update(.1);
  const count=g.state.spawnQueue.length;
  assert.ok(g.callReinforcements()); assert.equal(g.state.spawnQueue.length,count);
  const after=g.state.gold; assert.equal(g.callReinforcements(),false); assert.equal(g.state.gold,after);
  const r=ExpeditionGame.restore(g.serialize()); assert.equal(r.callReinforcements(),false);
  g.update(.5);r.update(.5);assert.deepEqual(r.serialize(),g.serialize());
});

test('shop capacity checks do not spend or mark products sold', () => {
  const g=gameAt(3);g.state.spawnQueue=[];g._finishWave();g.chooseRelic(g.state.choices[0]);
  g.state.gold=1000;
  g.state.shopOffers=[{id:'royal_egg',price:75,sold:false}];
  while(g.state.eggs.length<3)g._spawnEgg();
  assert.equal(g.buyOffer('royal_egg'),false);assert.equal(g.state.gold,1000);assert.equal(g.state.shopOffers[0].sold,false);
});

test('relic rank-cap event rejects costs and duplicate point/key actions', () => {
  const g=gameAt(2);g.state.spawnQueue=[];g._finishWave();
  g.state.eventId='ancient_forge';g.state.choices=['temper','sacrifice','leave'];g.state.gold=1000;
  for(let i=0;i<3;i++)g._grantRelic('sharp');
  const before=g.state.gold;assert.equal(g.chooseEvent('temper'),false);assert.equal(g.state.gold,before);
  assert.equal(g.chooseEvent('leave'),true);assert.equal(g.chooseEvent('leave'),false);
  assert.equal(g.train('toString'),false);assert.equal(g.train('__proto__'),false);
});

test('strong restore validation rejects queue edits, pending-node and lineage corruption', () => {
  const g=gameAt(6);g.update(.1); const save=g.serialize();
  const cases=[
    s=>s.spawnQueue[0].type='boss', s=>s.spawnQueue[0].at=500,
    s=>s.nodeQueue=['reward'], s=>s.stats.wavesCleared=6, s=>s.phase='reward',
    s=>s.classMilestones.blade=NaN, s=>s.relicRanks=JSON.parse('{"__proto__":1}'),
    s=>s.mapIndex=2, s=>s.activeCooldown=-1, s=>s.heroes[0].disabledUntil=Infinity,
    s=>s.enemies[0].hp=-1,s=>s.enemies[0].x=8,
  ];
  for(const mutate of cases){const bad=structuredClone(save);mutate(bad.state);assert.throws(()=>ExpeditionGame.restore(bad));}
});
