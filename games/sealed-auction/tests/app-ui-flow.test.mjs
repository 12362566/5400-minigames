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
  const listeners = new Map(), properties = new Map(), attributes = new Map();
  return {classList: classList(), style: {setProperty: (name, value) => properties.set(name, value), getPropertyValue: name => properties.get(name)}, isConnected: true, value: '', textContent: '', title: '', dataset: {}, disabled: false,
    addEventListener(name, handler) {listeners.set(name, handler);},
    fire(name, event) {listeners.get(name)?.(event);},
    setAttribute: (key, value) => attributes.set(key, String(value)), getAttribute: key => attributes.get(key) ?? null,
    focus() {}, blur() {}, select() {},
    getBoundingClientRect: () => ({width: 300, height: 280, left: 0, top: 0, right: 300, bottom: 280}),
    querySelector: () => null, querySelectorAll: () => []};
}
function app(storage = new Map()) {
  const root = node(), modal = node(), modalContent = node(), body = node(), html = node();
  let markup = '', modalMarkup = '', nextSeed = 2400, modalClose = node();
  const rootNodes = new Map(), modalNodes = new Map();
  const rootElements = [], modalElements = [];
  const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const matches = (element, selector) => {
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return element.getAttribute(attr[1]) !== null && (attr[2] === undefined || element.getAttribute(attr[1]) === attr[2]);
    return element.tagName === selector.toUpperCase();
  };
  function replaceNodes(nodes, value) {
    for (const existing of nodes.values()) existing.isConnected = false;
    nodes.clear();
    const elements = nodes === rootNodes ? rootElements : modalElements;
    for (const existing of elements) existing.isConnected = false;
    elements.length = 0;
    for (const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const element = node(), [, tag, attrs] = match, id = attrs.match(/\bid="([^"]*)"/)?.[1];
      element.id = id || ''; element.tagName = tag.toUpperCase();
      element.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
      element.disabled = /\bdisabled\b/.test(attrs);
      for (const attr of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        element.setAttribute(attr[1], attr[2]);
        if (attr[1].startsWith('data-')) element.dataset[dataKey(attr[1].slice(5))] = attr[2];
      }
      element.classList.add(...(element.getAttribute('class') || '').split(' ').filter(Boolean));
      const rest = value.slice(match.index + match[0].length), end = rest.indexOf(`</${tag}>`);
      element.textContent = end < 0 ? '' : rest.slice(0, end).replace(/<[^>]*>/g, '');
      if (id) nodes.set(`#${id}`, element);
      elements.push(element);
    }
  }
  Object.defineProperty(root, 'innerHTML', {get: () => markup, set(value) {
    markup = value;
    replaceNodes(rootNodes, value);
  }});
  Object.defineProperty(modalContent, 'innerHTML', {get: () => modalMarkup, set(value) {
    modalMarkup = value; modalClose.isConnected = false; modalClose = node(); replaceNodes(modalNodes, value);
  }});
  modalContent.querySelector = selector => modalElements.find(element => matches(element, selector)) || (selector === 'button' ? modalClose : null);
  modalContent.querySelectorAll = selector => modalElements.filter(element => matches(element, selector));
  root.querySelector = selector => rootElements.find(element => matches(element, selector)) || null;
  root.querySelectorAll = selector => rootElements.filter(element => matches(element, selector));
  modal.open = false;
  modal.showModal = () => {modal.open = true;};
  modal.close = () => {modal.open = false;};
  const stage = node(), documentListeners = new Map();
  const staticNodes = {'#app': root, '#modal': modal, '#modal-content': modalContent, '#sound': node(), '#help': node(), '#toast': node()};
  const document = {body, documentElement: html, activeElement: node(),
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    querySelector(selector) {
      if (rootNodes.has(selector)) return rootNodes.get(selector);
      if (modalNodes.has(selector)) return modalNodes.get(selector);
      if (selector === '.warehouse-stage') return markup.includes('warehouse-stage') ? stage : null;
      return staticNodes[selector] || [...rootElements, ...modalElements].find(element => matches(element, selector)) || null;
    },
    querySelectorAll: selector => [...rootElements, ...modalElements].filter(element => selector.split(',').some(part => matches(element, part.trim())))
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
    click(dataset) {
      const button = [...(modal.open ? modalElements : []), ...rootElements].find(element => element.tagName === 'BUTTON' && Object.entries(dataset).every(([key, value]) => element.dataset[key] === value)) || {dataset};
      if (button.disabled) return;
      button.closest = () => button;
      documentListeners.get('click')({target: button});
    },
    type(value) {const bid = document.querySelector('#bid'); assert.ok(bid, 'bid input must exist'); bid.value = value; bid.fire('input', {target: bid});},
    submit(selector = '#bid-form') {const form = document.querySelector(selector); assert.ok(form, `${selector} must exist`); form.fire('submit', {preventDefault() {}});},
    get bid() {return document.querySelector('#bid');}, get error() {return document.querySelector('#bid-error');}
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
  for (const panel of ['clues', 'tools', 'history', 'settings']) {
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

test('fast presets and adjustments render in the main dock, update the draft, and never submit', () => {
  const a = app(); start(a);
  const before = a.storage.get(SAVE);
  assert.doesNotMatch(a.root.innerHTML, /<input/);
  assert.equal(a.document.querySelector('#bid-submit').disabled, true);
  assert.deepEqual(a.document.querySelectorAll('[data-bid-amount]').map(button => button.textContent), ['10万', '30万', '50万']);
  assert.deepEqual(a.document.querySelectorAll('[data-bid-adjust]').map(button => button.dataset.bidAdjust), ['-50000', '-10000', '10000', '50000']);
  for (const button of a.document.querySelectorAll('[data-bid-amount], [data-bid-adjust], [data-quick="own"], [data-action="exact-bid"], [data-action="pass"]')) {
    assert.equal(button.getAttribute('type'), 'button', 'a quick control must never trigger native form submission');
  }
  assert.equal(a.document.querySelector('#bid-submit').getAttribute('type'), 'submit');
  assert.equal(a.document.querySelector('[data-quick="own"]').disabled, true);
  a.click({quick: 'own'});
  assert.equal(a.run('bidDraft'), '');
  for (const [dataset, expected] of [
    [{bidAmount: '100000'}, 100000], [{bidAmount: '300000'}, 300000], [{bidAmount: '500000'}, 500000],
    [{bidAdjust: '50000'}, 550000], [{bidAdjust: '10000'}, 560000],
    [{bidAdjust: '-10000'}, 550000], [{bidAdjust: '-50000'}, 500000]
  ]) {
    a.click(dataset);
    assert.equal(a.run('Number(bidDraft)'), expected);
    assert.equal(a.document.querySelector('#bid-amount').textContent, expected.toLocaleString('zh-CN'));
    assert.equal(a.document.querySelector('#bid-submit').disabled, false);
    assert.equal(a.modal.open, false, 'one tap must not open a drawer or confirmation');
    assert.equal(a.storage.get(SAVE), before);
    assert.equal(a.run('game.actions.length'), 0);
  }
  assert.equal(a.document.querySelector('#bid-wan').textContent, '50 万 · 虚拟币');
  a.run('setBidDraft(1)'); a.click({bidAdjust: '-10000'});
  assert.equal(a.run('bidDraft'), '0');
  assert.equal(a.document.querySelector('[data-bid-adjust="-50000"]').disabled, true);
  assert.equal(a.document.querySelector('#bid-submit').disabled, false, 'zero is a valid pass bid');
  a.run('setBidDraft(view.wallet - 1)'); a.click({bidAdjust: '50000'});
  assert.equal(a.run('Number(bidDraft)'), a.run('view.wallet'));
  assert.equal(a.document.querySelector('[data-bid-adjust="10000"]').disabled, true);
  assert.equal(a.modal.open, false, 'clamping to all-in must not submit or confirm by itself');
  assert.equal(a.storage.get(SAVE), before);
});

test('exact amount typing stays pending until Apply; Cancel and Escape discard it', () => {
  const a = app(); start(a); a.click({bidAmount: '300000'});
  const before = a.storage.get(SAVE);
  a.click({action: 'exact-bid'});
  assert.equal(a.modal.open, true);
  assert.equal(a.modal.classList.contains('side-drawer'), false);
  assert.equal(a.bid.value, '300000');
  a.type('235001');
  assert.equal(a.run('bidDraft'), '300000');
  a.click({action: 'close'});
  assert.equal(a.run('bidDraft'), '300000');
  a.click({action: 'exact-bid'});
  assert.equal(a.bid.value, '300000', 'reopening must not retain cancelled text');
  a.type('500001');
  a.modal.fire('cancel', {preventDefault() {}});
  assert.equal(a.modal.open, false);
  assert.equal(a.run('bidDraft'), '300000');
  a.click({action: 'exact-bid'}); a.type('235001'); a.submit('#exact-form');
  assert.equal(a.modal.open, false);
  assert.equal(a.run('bidDraft'), '235001');
  assert.equal(a.document.querySelector('#bid-amount').textContent, '235,001');
  assert.equal(a.document.querySelector('#bid-wan').textContent, '23.5001 万 · 虚拟币');
  assert.equal(a.run('view.phase'), 'bidding');
  assert.equal(a.storage.get(SAVE), before);
  a.submit();
  assert.equal(a.run("view.history.at(-1).bids.find(bid => bid.id === 'player').amount"), 235001);
  assert.equal(a.run('game.actions.length'), 1, 'only explicit main submission records a bid');
});

test('exact-entry invalids stay in the modal and do not replace the selected draft or saved state', () => {
  const a = app(); start(a); a.click({bidAmount: '100000'});
  const before = a.storage.get(SAVE);
  a.click({action: 'exact-bid'});
  for (const value of ['', '-1', '1.5', '1e3', 'abc', '1200001', '9007199254740992']) {
    a.type(value); a.submit('#exact-form');
    assert.ok(a.document.querySelector('#exact-error').textContent, value);
    assert.equal(a.modal.open, true);
    assert.equal(a.run('bidDraft'), '100000');
    assert.equal(a.storage.get(SAVE), before);
  }
  a.type(' 0 ');
  assert.equal(a.document.querySelector('#exact-error').textContent, '');
  a.submit('#exact-form');
  assert.equal(a.run('bidDraft'), '0');
  assert.equal(a.modal.open, false);
  assert.equal(a.storage.get(SAVE), before);
});

test('all-balance filling stays separate from explicit submission and confirmation', () => {
  const a = app(); start(a);
  const before = a.storage.get(SAVE);
  a.click({action: 'exact-bid'}); a.click({quick: 'all'});
  assert.equal(a.run('bidDraft'), '1200000');
  assert.equal(a.modal.open, false);
  assert.equal(a.storage.get(SAVE), before);
  a.submit();
  assert.equal(a.modal.open, true);
  assert.ok(a.modalContent.innerHTML.includes('确认使用全部余额报价'));
  assert.equal(a.storage.get(SAVE), before);
  a.click({action: 'close'});
  assert.equal(a.run('bidDraft'), '1200000');
  assert.equal(a.run('view.phase'), 'bidding');
  a.submit(); a.click({submit: '1200000'});
  assert.equal(a.modal.open, false);
  assert.equal(a.run('game.actions.length'), 1);
  assert.equal(a.run("view.history.at(-1).bids.find(bid => bid.id === 'player').amount"), 1200000);
});

test('previous uses the player own bid including zero, not the public highest rival bid', () => {
  for (const previous of [0, 100000]) {
    const a = app(); start(a);
    if (previous) {a.click({bidAmount: String(previous)}); a.submit();}
    else a.click({action: 'pass'});
    assert.equal(a.run('view.phase'), 'round-result');
    assert.notEqual(a.run('view.history.at(-1).highest'), previous);
    a.click({action: 'next-round'});
    assert.equal(a.run('bidDraft'), String(previous), 'next round carries the player own bid');
    assert.equal(a.document.querySelector('[data-quick="own"]').disabled, false);
    const before = a.storage.get(SAVE);
    a.click({bidAmount: '500000'}); a.click({quick: 'own'});
    assert.equal(a.run('bidDraft'), String(previous));
    assert.equal(a.storage.get(SAVE), before);
  }
});

test('tiny-wallet presets scale down, impossible amounts disable, and steps stay integer and clamped', () => {
  const a = app(); start(a);
  const before = a.storage.get(SAVE);
  // Isolate presentation math; do not alter the real engine state or save to manufacture wallets.
  for (const wallet of [0, 1, 4, 5, 9, 10, 99, 100, 9999, 10000, 99999]) {
    a.run(`view = {...view, wallet: ${wallet}}; bidDraft = ''; renderGame()`);
    const base = Math.min(100000, 10 ** Math.floor(Math.log10(Math.max(wallet, 1))));
    const presets = a.document.querySelectorAll('[data-bid-amount]');
    assert.deepEqual(presets.map(button => Number(button.dataset.bidAmount)), [base, 3 * base, 5 * base]);
    for (const button of presets) assert.equal(button.disabled, Number(button.dataset.bidAmount) > wallet);
    const steps = a.document.querySelectorAll('[data-bid-adjust]');
    assert.ok(steps.every(button => Number.isInteger(Number(button.dataset.bidAdjust))));
    const largest = steps.at(-1);
    a.click({bidAdjust: largest.dataset.bidAdjust});
    assert.equal(a.run('Number(bidDraft)'), Math.min(wallet, Number(largest.dataset.bidAdjust)));
    a.run('setBidDraft(0)');
    assert.equal(a.document.querySelector('#bid-submit').disabled, false);
    assert.equal(a.storage.get(SAVE), before);
  }
});

test('confirmed tools preserve the draft and revalidate it against the reduced wallet', () => {
  const a = app(); start(a); a.click({bidAmount: '300000'});
  const before = a.storage.get(SAVE);
  const wallet = a.run('view.wallet'), cost = a.run("view.tools.find(tool => tool.id === 'scan').cost");
  a.click({panel: 'tools'}); a.click({tool: 'scan'});
  assert.equal(a.storage.get(SAVE), before);
  a.click({buyTool: 'scan'});
  assert.equal(a.run('view.wallet'), wallet - cost);
  assert.equal(a.run('bidDraft'), '300000');
  assert.equal(a.run('game.actions.length'), 1);
  assert.equal(a.modal.open, true);
  assert.ok(a.modalContent.innerHTML.includes('本仓情报'));
  a.click({action: 'close'});
  a.run('setBidDraft(view.wallet)');
  const tool = a.run('view.tools.find(tool => tool.available).id');
  a.click({tool}); a.click({buyTool: tool});
  assert.equal(a.document.querySelector('#bid-submit').disabled, true, 'a now-overbudget draft cannot be submitted');
  assert.ok(a.run('Number(bidDraft) > view.wallet'));
  a.click({action: 'close'});
  const state = a.storage.get(SAVE);
  a.submit();
  assert.ok(a.error.textContent);
  assert.equal(a.storage.get(SAVE), state);
  a.click({bidAmount: '100000'});
  assert.equal(a.error.textContent, '');
  assert.equal(a.document.querySelector('#bid-submit').disabled, false);
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
  assert.equal(a.body.classList.contains('low-view'), true);
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
