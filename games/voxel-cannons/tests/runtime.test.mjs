import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as engine from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { PALETTE, cannonSVG } from '../src/renderer.js';

// DOM-free application integration harness. This exercises the real app module;
// browser layout, dialog focus, default key activation, and canvas pixels still
// require the separate public-site browser QA pass.
function application({ saved, qa = true, storageFails = false } = {}) {
  let now = 0;
  let nextFrame;
  let storageWriteAttempts = 0;
  const pending = [];
  const storage = new Map(saved === undefined ? [] : [['cube-salvo-v1', saved]]);
  const elements = new Map();
  class Target {
    constructor(id = '', tagName = 'DIV') {
      this.id = id; this.tagName = tagName; this.listeners = new Map();
      this.open = false; this.hidden = false; this.disabled = false;
      this.dataset = {}; this.style = {}; this.attributes = {};
      this.textContent = ''; this.children = []; this._html = '';
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(callback); this.listeners.set(name, callbacks);
    }
    fire(name, data = {}) {
      const event = { target: this, repeat: false, ctrlKey: false, metaKey: false, altKey: false,
        key: '', code: '', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...data };
      for (const callback of this.listeners.get(name) || []) callback(event);
      return event;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    append(child) { this.children.push(child); elements.set(child.id, child); }
    showModal() { this.open = true; }
    close() { if (!this.open) return; this.open = false; pending.push(() => this.fire('close')); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 320, bottom: 568, width: 320, height: 568 }; }
    focus() { document.activeElement = this; }
    closest(selector) {
      if (selector === '[data-column]' && this.dataset.column !== undefined) return this;
      if (selector === '[data-level]' && this.dataset.level !== undefined) return this;
      if (selector.includes('button') && this.tagName === 'BUTTON') return this;
      if (selector.includes('a') && this.tagName === 'A') return this;
      return null;
    }
    querySelectorAll(selector) { return selector === 'button' ? this.children : []; }
    querySelector(selector) {
      const match = selector.match(/data-(column|level)=["']?(\d+)/);
      return match ? this.children.find(child => child.dataset[match[1]] === match[2]) : null;
    }
    set innerHTML(html) {
      this._html = html;
      if (this.children.includes(document.activeElement)) document.activeElement = document.body;
      this.children = [];
      for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
        const attrs = match[1]; const id = attrs.match(/\bid="([^"]+)"/)?.[1] || '';
        const child = new Target(id, 'BUTTON'); child.disabled = /\bdisabled\b/.test(attrs);
        for (const data of attrs.matchAll(/data-([\w-]+)="([^"]+)"/g)) child.dataset[data[1]] = data[2];
        if (id) elements.set(id, child); this.children.push(child);
      }
    }
    get innerHTML() { return this._html; }
  }
  const document = new Target('document', 'DOCUMENT');
  document.body = new Target('body', 'BODY'); document.activeElement = document.body; document.hidden = false;
  document.getElementById = id => elements.get(id) || null;
  document.createElement = tag => new Target('', tag.toUpperCase());
  for (const match of fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[2], new Target(match[2], match[1].toUpperCase()));
  }
  elements.get('progress-fill').parentElement = new Target();
  const window = new Target('window', 'WINDOW');
  class Renderer {
    setState(state, level) { this.state = state; this.level = level; this.received = []; }
    events(events) { this.received.push(...events); }
    render(dt) { this.lastDt = dt; }
  }
  const context = vm.createContext({
    engine, LEVELS, PALETTE, cannonSVG, VoxelRenderer: Renderer,
    document, window, location: { search: qa ? '?qa=1' : '' }, URLSearchParams,
    matchMedia: () => ({ matches: false }), performance: { now: () => now },
    localStorage: { getItem: key => { if (storageFails) throw Error('denied'); return storage.get(key) ?? null; },
      setItem: (key, value) => { storageWriteAttempts++; if (storageFails) throw Error('denied'); storage.set(key, value); } },
    requestAnimationFrame: callback => { nextFrame = callback; },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '');
  vm.runInContext(`const { createGame, deploy, tick, exposedTargets, summarize, serialize, restore, getStateLevel } = engine;\n${source}\nglobalThis.readApp = () => ({ state, unlocked, userPaused, resultShown, best, sound, reduced, confirmAction });`, context);
  const drain = () => { while (pending.length) pending.shift()(); };
  return {
    get: id => elements.get(id), read: () => context.readApp(), window, document, storage,
    get storageWriteAttempts() { return storageWriteAttempts; },
    click(id, target) { elements.get(id).fire('click', target ? { target } : {}); drain(); },
    key(key, code = key, target = document.body) { const event = window.fire('keydown', { key, code, target }); drain(); return event; },
    frame(ms = 16) { now += ms; nextFrame(now); drain(); },
    hide(value) { document.hidden = value; document.fire('visibilitychange'); drain(); },
    cancel(id) { const dialog = elements.get(id); const event = dialog.fire('cancel'); if (!event.defaultPrevented) dialog.close(); drain(); return event; },
    qa: window.cubeSalvoQA,
  };
}

function advance(app, frames = 20) { for (let i = 0; i < frames; i++) app.frame(16); }
function wonState(index) {
  const state = engine.createGame(index);
  for (let i = 0; i < 2000 && state.status === 'playing'; i++) {
    const colors = new Set(engine.exposedTargets(state).map(voxel => voxel.color));
    for (let column = 0; column < 4; column++) {
      if (colors.has(engine.COLORS[column]) && !state.slots.some(cannon => cannon?.color === engine.COLORS[column]) && state.queues[column].length) engine.deploy(state, column);
    }
    engine.tick(state, .5);
  }
  assert.equal(state.status, 'won'); return state;
}

const savedEnvelope = game => JSON.stringify({ version: 1, game: engine.serialize(game), unlocked: 1, best: {}, sound: false, reduced: false });

test('application pauses through menu, Space, and background visibility; resume advances again', () => {
  const app = application(); app.key('1', 'Digit1'); advance(app);
  const hits = app.read().state.hits; assert.ok(hits > 0);
  app.click('menu-button'); advance(app); assert.equal(app.read().state.hits, hits);
  app.click('close-menu'); advance(app); assert.ok(app.read().state.hits > hits);
  app.key(' ', 'Space'); const pausedHits = app.read().state.hits;
  advance(app); assert.equal(app.read().state.hits, pausedHits); assert.equal(app.get('pause-card').hidden, false);
  app.click('continue-game'); advance(app); assert.ok(app.read().state.hits > pausedHits);
  app.hide(true); const hiddenHits = app.read().state.hits; advance(app); app.hide(false); advance(app);
  assert.equal(app.read().state.hits, hiddenHits); assert.equal(app.read().userPaused, true);
  app.click('continue-game'); advance(app); assert.ok(app.read().state.hits > hiddenHits);
});

test('restart Cancel and Escape preserve the run; confirm resets only the current level', () => {
  const app = application(); app.key('1'); advance(app);
  app.key('r'); const snapshot = engine.serialize(app.read().state);
  advance(app); assert.equal(engine.serialize(app.read().state), snapshot);
  app.click('confirm-cancel'); assert.equal(engine.serialize(app.read().state), snapshot);
  app.key('r'); app.cancel('confirm-dialog'); assert.equal(engine.serialize(app.read().state), snapshot);
  app.click('menu-button'); app.click('restart-button'); app.click('confirm-ok');
  assert.equal(app.read().state.hits, 0); assert.equal(app.read().state.levelIndex, 0);
  assert.equal(app.get('menu-dialog').open, false); assert.equal(app.get('confirm-dialog').open, false);
  assert.equal(app.read().userPaused, false);
});

test('nested level-switch cancellation preserves the menu and current run', () => {
  const app = application(); app.qa.load(engine.createGame(1)); app.key('1'); advance(app);
  app.click('menu-button'); app.click('levels-button');
  const snapshot = engine.serialize(app.read().state);
  app.click('level-grid', app.get('level-grid').children[0]); assert.equal(app.get('confirm-dialog').open, true);
  app.click('confirm-cancel'); assert.equal(engine.serialize(app.read().state), snapshot);
  assert.equal(app.get('level-dialog').open, true); assert.equal(app.get('menu-dialog').open, true);
  app.click('level-grid', app.get('level-grid').children[0]); app.click('confirm-ok');
  assert.equal(app.read().state.levelIndex, 0); assert.equal(app.read().state.hits, 0);
  assert.equal(app.get('level-dialog').open, false); assert.equal(app.get('menu-dialog').open, false);
});

test('valid stored run starts paused and cannot shoot before explicit resume', () => {
  const state = engine.createGame(2); engine.deploy(state, 0); engine.tick(state, .321);
  const snapshot = engine.serialize(state); const app = application({ qa: false, saved: savedEnvelope(state) });
  assert.equal(app.read().unlocked, 3); assert.equal(app.read().userPaused, true);
  advance(app); assert.equal(engine.serialize(app.read().state), snapshot);
  app.click('continue-game'); advance(app); assert.ok(app.read().state.hits > state.hits);
});

test('corrupt or unavailable local storage recovers to a playable game', () => {
  for (const saved of ['{', '{}', 'null', savedEnvelope(engine.createGame()).replace('"version":1', '"version":9')]) {
    const app = application({ qa: false, saved }); assert.equal(app.read().state.hits, 0);
    assert.match(app.get('toast').textContent, /无法读取/); app.key('1'); advance(app); assert.ok(app.read().state.hits > 0);
  }
  const app = application({ qa: false, storageFails: true }); app.key('1'); advance(app);
  assert.ok(app.read().state.hits > 0); assert.match(app.get('toast').textContent, /不能保存/);
});

test('win/result/retry/next maintain finite campaign completion and cannot Escape the result', () => {
  const app = application(); app.qa.load(wonState(0)); app.frame();
  assert.equal(app.get('result-dialog').open, true); assert.equal(app.get('next-button').hidden, false);
  assert.equal(app.cancel('result-dialog').defaultPrevented, true); assert.equal(app.get('result-dialog').open, true);
  app.click('next-button'); assert.equal(app.read().state.levelIndex, 1); assert.equal(app.read().state.status, 'playing');
  app.qa.load(wonState(11)); app.frame(); assert.match(app.get('result-title').textContent, /12/);
  assert.equal(app.read().unlocked, 12); assert.equal(app.get('next-button').textContent, '从第一关再玩');
  app.click('next-button'); assert.equal(app.read().state.levelIndex, 0); assert.equal(app.read().state.hits, 0);
  assert.equal(app.read().unlocked, 12); assert.equal(app.get('result-dialog').open, false);
});

test('loss offers retry, never next, and retry resets the correct board', () => {
  const app = application(); const state = engine.createGame(6);
  for (let i = 0; i < 5; i++) engine.deploy(state, 0); engine.tick(state, 100);
  assert.equal(state.status, 'lost'); app.qa.load(state); app.frame();
  assert.equal(app.get('result-dialog').open, true); assert.equal(app.get('next-button').hidden, true);
  app.click('retry-button'); assert.equal(app.read().state.status, 'playing');
  assert.equal(app.read().state.levelIndex, 6); assert.equal(app.read().state.hits, 0);
});

test('Space preserves native keyboard activation on focused controls', () => {
  const app = application();
  const event = app.key(' ', 'Space', app.get('menu-button'));
  assert.equal(event.defaultPrevented, false, 'Space on a button must remain available for native click activation');
  assert.equal(app.read().userPaused, false, 'a focused button must not trigger the global pause shortcut');
});


test('unavailable storage retries are throttled instead of retried every animation frame', () => {
  const app = application({ qa: false, storageFails: true });
  app.key('1'); advance(app, 125); // Two seconds, including the first retry window.
  assert.ok(app.storageWriteAttempts <= 3, `unexpected hot-loop storage attempts: ${app.storageWriteAttempts}`);
  assert.ok(app.read().state.hits > 0);
});

test('legacy in-progress browser save preserves its layout, then confirmed restart uses tall campaign', () => {
  const legacy=fs.readFileSync(new URL('fixtures/legacy-v1-midround.json',import.meta.url),'utf8');
  const saved=JSON.stringify({version:1,game:legacy,unlocked:7,best:{0:42},sound:false,reduced:false});
  const app=application({saved,qa:false});
  assert.equal(app.read().state.campaignVersion,1);assert.equal(app.read().state.total,476);assert.equal(app.read().state.hits,8);assert.equal(app.read().userPaused,true);
  app.click('restart-button');app.click('confirm-cancel');assert.equal(app.read().state.hits,8);
  app.click('restart-button');app.click('confirm-ok');assert.equal(app.read().state.campaignVersion,2);assert.equal(app.read().state.total,2072);assert.equal(app.read().unlocked,7);assert.equal(app.read().best[0],42);
});

test('an untouched legacy browser save upgrades without losing any played progress', () => {
  const app=application({saved:savedEnvelope(engine.createGame(0,1)),qa:false});
  assert.equal(app.read().state.campaignVersion,2);assert.equal(app.read().state.hits,0);
});

test('unavailable or lost WebGL pauses simulation and context callback keeps explicit resume', () => {
  const app=application();app.key('1');advance(app);const hits=app.read().state.hits;
  app.qa.renderer.blocked=true;advance(app);assert.equal(app.read().state.hits,hits);
  app.qa.renderer.onContextChange(true);assert.equal(app.read().userPaused,true);
  app.qa.renderer.blocked=false;app.qa.renderer.onContextChange(false);advance(app);assert.equal(app.read().state.hits,hits);
  app.click('continue-game');advance(app);assert.ok(app.read().state.hits>hits);
});
