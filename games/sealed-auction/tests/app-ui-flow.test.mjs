/* DOM-independent UI flow tests. These exercise app handlers with the real engine,
   but deliberately do not claim browser rendering, focus semantics or CSS coverage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../engine.js';
import * as artwork from '../art.js';

const appSource = (await readFile(new URL('../app.js', import.meta.url), 'utf8')).replace(/^import .*;\s*$/gm, '');
const SAVE = '5400-sealed-auction-v1';
function classList() {
  const values = new Set();
  return {add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)), contains: name => values.has(name), toggle(name, force) {const on = force ?? !values.has(name); if (on) values.add(name); else values.delete(name); return on;}};
}
function node() {
  const listeners = new Map(), properties = new Map();
  return {classList: classList(), style: {setProperty: (name, value) => properties.set(name, value), getPropertyValue: name => properties.get(name)}, isConnected: true, value: '', textContent: '', title: '',
    addEventListener(name, handler) {listeners.set(name, handler);},
    fire(name, event) {listeners.get(name)?.(event);},
    setAttribute() {}, focus() {}, blur() {},
    getBoundingClientRect: () => ({width: 300, height: 280, left: 0, top: 0, right: 300, bottom: 280}),
    querySelector: () => null, querySelectorAll: () => []};
}
function app(storage = new Map()) {
  const root = node(), modal = node(), modalContent = node(), body = node(), html = node();
  let markup = '', modalMarkup = '', bid = null, form = null, error = null, nextSeed = 2400, modalClose = node();
  Object.defineProperty(root, 'innerHTML', {get: () => markup, set(value) {
    markup = value;
    if (bid) bid.isConnected = false;
    bid = /id="bid"/.test(value) ? node() : null;
    if (bid) bid.value = value.match(/id="bid"[^>]*value="([^"]*)"/)?.[1] || '';
    form = /id="bid-form"/.test(value) ? node() : null;
    error = /id="bid-error"/.test(value) ? node() : null;
  }});
  Object.defineProperty(modalContent, 'innerHTML', {get: () => modalMarkup, set(value) {modalMarkup = value; modalClose.isConnected = false; modalClose = node();}});
  modalContent.querySelector = () => modalClose;
  modal.open = false;
  modal.showModal = () => {modal.open = true;};
  modal.close = () => {modal.open = false;};
  const stage = node(), documentListeners = new Map();
  const staticNodes = {'#app': root, '#modal': modal, '#modal-content': modalContent, '#sound': node(), '#help': node(), '#toast': node()};
  const document = {body, documentElement: html, activeElement: node(),
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    querySelector(selector) {
      if (selector === '#bid') return bid;
      if (selector === '#bid-form') return form;
      if (selector === '#bid-error') return error;
      if (selector === '.warehouse-stage') return markup.includes('warehouse-stage') ? stage : null;
      return staticNodes[selector] || null;
    }
  };
  const window = {innerWidth: 390, innerHeight: 844, scrollTo() {}, addEventListener() {}, visualViewport: {height: 844, width: 390, scale: 1, offsetTop: 0, addEventListener() {}}};
  const context = vm.createContext({...engine, ...artwork, window, document,
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    crypto: {getRandomValues: values => {values[0] = nextSeed++; return values;}},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => callback(),
    ResizeObserver: class {observe() {} disconnect() {}},
  });
  vm.runInContext(appSource, context, {filename: 'app.js'});
  return {context, document, body, html, root, modal, modalContent, storage, window, stage,
    run: source => vm.runInContext(source, context),
    click(dataset) {const button = {dataset, closest: () => button}; documentListeners.get('click')({target: button});},
    type(value) {assert.ok(bid, 'bid input must exist'); bid.value = value; bid.fire('input', {target: bid});},
    submit() {assert.ok(form, 'bid form must exist'); form.fire('submit', {preventDefault() {}});},
    get bid() {return bid;}, get error() {return error;}
  };
}
function start(instance) {instance.click({action: 'start'}); instance.click({action: 'close'});}

test('game and all secondary drawers render without changing the saved action log', () => {
  const a = app();
  assert.equal(a.body.classList.contains('in-game'), false);
  a.click({role: 'scout'});
  start(a);
  assert.equal(a.body.classList.contains('in-game'), true);
  assert.equal(a.run('view.role'), 'scout');
  for (const className of ['play-shell', 'play-layout', 'play-main', 'game-hud', 'warehouse-stage', 'warehouse', 'side-rail', 'bid-dock']) assert.ok(a.root.innerHTML.includes(`class="${className}`), className);
  const before = a.storage.get(SAVE);
  for (const panel of ['clues', 'tools', 'history', 'settings', 'quick']) {
    a.click({panel});
    assert.equal(a.modal.open, true, panel);
    assert.equal(a.modal.classList.contains('side-drawer'), true, panel);
    a.click({action: 'close'});
    assert.equal(a.modal.open, false);
    assert.equal(a.storage.get(SAVE), before);
  }
  a.click({action: 'catalog'});
  assert.equal(a.modal.classList.contains('side-drawer'), true);
  a.click({action: 'close'});
  assert.equal(a.storage.get(SAVE), before);
});

test('quick bids fill but never submit; a confirmed tool preserves the current draft', () => {
  const a = app(); start(a); a.type('12000');
  const before = a.storage.get(SAVE);
  a.click({panel: 'quick'}); a.click({quick: 'plus'});
  assert.equal(a.bid.value, '22000');
  assert.equal(a.storage.get(SAVE), before);
  a.click({panel: 'quick'}); a.click({quick: 'all'});
  assert.equal(a.bid.value, '1200000');
  assert.equal(a.storage.get(SAVE), before);
  a.type('34000');
  const wallet = a.run('view.wallet'), cost = a.run("view.tools.find(tool => tool.id === 'scan').cost");
  a.click({panel: 'tools'}); a.click({tool: 'scan'});
  assert.equal(a.storage.get(SAVE), before);
  a.click({buyTool: 'scan'});
  assert.equal(a.run('view.wallet'), wallet - cost);
  assert.equal(a.bid.value, '34000');
  assert.equal(a.run('game.actions.length'), 1);
  assert.equal(a.modal.open, true);
  assert.ok(a.modalContent.innerHTML.includes('本仓情报'));
});

test('invalid bids and cancelled all-balance confirmation do not alter state', () => {
  const a = app(); start(a);
  const before = a.storage.get(SAVE);
  for (const value of ['', '-1', '1.5', '1200001']) {
    a.type(value); a.submit();
    assert.ok(a.error.textContent, value);
    assert.equal(a.storage.get(SAVE), before);
  }
  a.type('1200000'); a.submit();
  assert.equal(a.modal.open, true);
  assert.ok(a.modalContent.innerHTML.includes('确认使用全部余额报价'));
  assert.equal(a.storage.get(SAVE), before);
  a.click({action: 'close'});
  assert.equal(a.bid.value, '1200000');
  assert.equal(a.run('view.phase'), 'bidding');
});

test('five-lot play, final inspection, replay and save/continue remain wired to the engine', () => {
  const a = app(); start(a);
  let turns = 0;
  while (a.run('view.phase') !== 'finished') {
    assert.ok(++turns <= 55, 'session should terminate');
    const phase = a.run('view.phase');
    if (phase === 'bidding') a.click({action: 'pass'});
    else if (phase === 'round-result') a.click({action: 'next-round'});
    else if (phase === 'lot-result') a.click({action: 'next-lot'});
    else assert.fail(`unexpected phase ${phase}`);
  }
  assert.equal(a.run('view.completedLots.length'), 5);
  assert.ok(a.root.innerHTML.includes('class="end-screen"'));
  const complete = a.storage.get(SAVE);
  a.click({action: 'inspect-last'});
  assert.equal(a.run('view.phase'), 'lot-result');
  assert.equal(a.run('game.phase'), 'finished');
  assert.ok(a.root.innerHTML.includes('data-action="show-ending"'));
  assert.equal(a.storage.get(SAVE), complete);
  a.click({action: 'show-ending'});
  assert.equal(a.run('view.phase'), 'finished');
  a.click({action: 'home'});
  assert.equal(a.body.classList.contains('in-game'), false);
  a.click({action: 'continue'});
  assert.equal(a.run('view.phase'), 'finished');
  const restored = app(a.storage);
  restored.click({action: 'continue'});
  assert.equal(restored.run('view.phase'), 'finished');
  assert.equal(restored.storage.get(SAVE), complete);
  restored.click({action: 'replay'});
  assert.equal(restored.run('view.phase'), 'bidding');
  assert.equal(restored.run('view.lotIndex'), 0);
  assert.equal(restored.run('view.wallet'), 1200000);
  assert.equal(restored.run('game.actions.length'), 0);
});

test('visual viewport and warehouse sizing update without mutating the game', () => {
  const a = app(); start(a);
  const before = a.storage.get(SAVE);
  a.window.visualViewport.height = 480;
  a.window.visualViewport.offsetTop = 20;
  a.run('updateViewport()');
  assert.equal(a.html.style.getPropertyValue('--screen-height'), '480px');
  assert.equal(a.html.style.getPropertyValue('--screen-top'), '20px');
  assert.equal(a.body.classList.contains('compact-view'), true);
  assert.equal(a.body.classList.contains('short-view'), false);
  assert.equal(a.stage.style.getPropertyValue('--board-size'), '280px');
  a.window.visualViewport.height = 320;
  a.run('updateViewport()');
  assert.equal(a.body.classList.contains('short-view'), true);
  assert.equal(a.storage.get(SAVE), before);
});

test('replacing drawer content preserves the external opener and Escape closes through the shared handler', () => {
  const a = app(); start(a);
  const opener = node();
  let focusOptions = null, focused = 0;
  opener.focus = options => {focused++; focusOptions = options;};
  a.document.activeElement = opener;
  a.click({panel: 'settings'});
  assert.equal(a.run('lastFocus'), opener);
  a.document.activeElement = a.modalContent.querySelector('button');
  a.click({action: 'help'});
  assert.equal(a.run('lastFocus'), opener);
  let prevented = false;
  a.modal.fire('cancel', {preventDefault() {prevented = true;}});
  assert.equal(prevented, true);
  assert.equal(a.modal.open, false);
  assert.equal(focused, 1);
  assert.equal(focusOptions?.preventScroll, true);
});
