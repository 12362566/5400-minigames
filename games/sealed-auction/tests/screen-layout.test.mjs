import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditWindow, viewportPresets, rectOf, intersects, outside} from './layout-audit.mjs';

const file = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const box = (x, y, width, height) => ({x, y, left: x, top: y, right: x + width, bottom: y + height, width, height});
function element(className, rect, options = {}) {
  const classes = new Set(className.split(' ').filter(Boolean));
  classes.contains = classes.has.bind(classes);
  return {
    tagName: 'DIV', id: '', dataset: {}, classList: classes, parentElement: null, textContent: '',
    clientWidth: rect.width, clientHeight: rect.height, scrollWidth: rect.width, scrollHeight: rect.height,
    scrollLeft: 0, scrollTop: 0, style: {display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible'},
    getBoundingClientRect: () => rect, getAttribute: () => null, closest: () => null, querySelectorAll: () => [],
    ...options
  };
}
function fixture() {
  const html = element('', box(0, 0, 390, 844));
  const body = element('in-game', box(0, 0, 390, 844));
  const regions = {
    '.play-shell': element('play-shell', box(0, 0, 390, 844)),
    '.play-layout': element('play-layout', box(0, 70, 390, 774)),
    '.play-main': element('play-main', box(0, 70, 330, 774)),
    '.game-hud': element('game-hud', box(0, 0, 390, 70)),
    '.hud-title': element('hud-title', box(0, 0, 155, 70)),
    '.hud-money': element('hud-money', box(235, 0, 155, 70)),
    '.hud-money strong': element('', box(235, 34, 155, 32)),
    '.hud-round': element('hud-round', box(163, 12, 64, 44)),
    '.warehouse-stage': element('warehouse-stage', box(0, 70, 330, 580)),
    '.warehouse': element('warehouse', box(5, 140, 320, 320)),
    '.side-rail': element('side-rail', box(338, 76, 48, 650)),
    '.bid-dock': element('bid-dock', box(0, 680, 330, 154))
  };
  const railButton = element('rail-button', box(340, 80, 44, 44), {tagName: 'BUTTON', dataset: {action: 'clues'}, parentElement: regions['.side-rail']});
  const bidInput = element('bid-input', box(8, 704, 310, 44), {tagName: 'INPUT', id: 'bid', parentElement: regions['.bid-dock']});
  const lotItem = element('lot-item', box(9, 144, 32, 32), {tagName: 'BUTTON', dataset: {item: 'item-1'}, parentElement: regions['.warehouse']});
  const arrays = {
    '.side-rail button, .side-rail a': [railButton],
    '.bid-dock input, .bid-dock button, .bid-dock select, .bid-dock a': [bidInput],
    '.warehouse .lot-item': [lotItem], 'dialog[open]': [],
    '.play-shell *': [regions['.game-hud'], regions['.warehouse'], regions['.side-rail'], regions['.bid-dock'], railButton, bidInput]
  };
  const document = {documentElement: html, body, querySelector: selector => regions[selector] || null, querySelectorAll: selector => arrays[selector] || []};
  const window = {document, innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0, getComputedStyle: target => target.style};
  return {window, html, body, regions, arrays, railButton, bidInput, lotItem};
}

test('the six exact-size presets cover narrow, tall, landscape, keyboard-sized and desktop viewports', () => {
  assert.deepEqual(viewportPresets.map(({width, height}) => [width, height]), [[320, 568], [390, 844], [410, 820], [568, 320], [390, 480], [1280, 720]]);
});

test('authored preview uses same-origin v1.1.0 game without shrinking the iframe to its parent', async () => {
  const html = await file('tests/mobile-preview.html');
  assert.match(html, /src="\.\.\/index\.html\?v=1\.1\.0"/);
  assert.match(html, /frame\.style\.width/);
  assert.match(html, /frame\.style\.height/);
  const iframeRule = html.match(/iframe\s*\{([^}]+)\}/)?.[1];
  assert.ok(iframeRule);
  assert.doesNotMatch(iframeRule, /max-width|transform|zoom/);
  assert.doesNotMatch(html, /resizeTo\(|resizeBy\(/);
});

test('engine implementation remains byte-for-byte unchanged', async () => {
  const bytes = await readFile(new URL('../engine.js', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '31c92cc2a3adb78ddeb15026104b0d897ec03775e8d7baf6a5a38631df3cf3c5');
});

test('geometry detects actual overlap, permits touching edges, and tolerates subpixel boundaries', () => {
  assert.equal(intersects(box(0, 0, 44, 44), box(44, 0, 44, 44)), false);
  assert.equal(intersects(box(0, 0, 44, 44), box(40, 0, 44, 44)), true);
  assert.deepEqual(outside(box(0, 0, 390, 844), box(0, 0, 390, 844)), {left: false, right: false, top: false, bottom: false});
  assert.equal(outside(box(0, 800, 390, 46), box(0, 0, 390, 844)).bottom, true);
  assert.equal(rectOf(box(0, 0, 43.9999, 44)).width, 44);
});

test('audit reports actual document dimensions and passes a contained one-screen layout', () => {
  const f = fixture(), result = auditWindow(f.window, {width: 390, height: 844});
  assert.equal(result.status, 'PASS', JSON.stringify(result.issues));
  assert.equal(result.actualViewport.innerWidth, 390);
  assert.equal(result.actualViewport.innerHeight, 844);
  assert.deepEqual(result.actualViewport.document, {clientWidth: 390, clientHeight: 844, scrollWidth: 390, scrollHeight: 844, scrollLeft: 0, scrollTop: 0});
  assert.equal(result.sidebarButtons[0].minimum44, true);
  assert.equal(result.bidControls[0].unreachableBottom, false);
  assert.equal(result.warehouseItems.length, 1);
});

test('audit fails overflow, offscreen bid controls, and undersized sidebar buttons', () => {
  const f = fixture();
  f.html.scrollWidth = 450;
  f.body.scrollHeight = 900;
  f.bidInput.getBoundingClientRect = () => box(8, 826, 310, 44);
  f.railButton.getBoundingClientRect = () => box(340, 80, 43, 44);
  const result = auditWindow(f.window, {width: 390, height: 844});
  assert.equal(result.status, 'FAIL');
  assert.equal(result.actualViewport.overflowX, true);
  assert.equal(result.actualViewport.overflowY, true);
  assert.equal(result.sidebarButtons[0].minimum44, false);
  assert.equal(result.bidControls[0].unreachableBottom, true);
});

test('overflow hidden cannot conceal a clipped bid control from the audit', () => {
  const f = fixture();
  f.regions['.bid-dock'].style.overflowY = 'hidden';
  f.bidInput.getBoundingClientRect = () => box(8, 810, 310, 30);
  const result = auditWindow(f.window);
  assert.equal(result.actualViewport.overflowY, false);
  assert.equal(result.bidControls[0].unreachableBottom, true);
  assert.deepEqual(result.bidControls[0].clippedBy, ['div.bid-dock']);
  assert.equal(result.status, 'FAIL');
});

test('audit catches region overlap and warehouse items leaving their warehouse', () => {
  const f = fixture();
  f.regions['.warehouse'].getBoundingClientRect = () => box(5, 450, 340, 320);
  f.lotItem.getBoundingClientRect = () => box(337, 500, 30, 32);
  const result = auditWindow(f.window);
  assert.ok(result.overlaps.some(pair => pair.join('/') === 'warehouse/bid'));
  assert.equal(result.warehouseItems[0].outsideWarehouse.right, true);
  assert.equal(result.status, 'FAIL');
});

test('dialog internal scrolling is reported separately and does not fail the main screen', () => {
  const f = fixture();
  const dialog = element('side-drawer', box(50, 0, 340, 844), {tagName: 'DIALOG', id: 'modal', scrollHeight: 1600});
  dialog.style.overflowY = 'auto';
  f.arrays['dialog[open]'] = [dialog];
  const result = auditWindow(f.window);
  assert.equal(result.status, 'PASS', JSON.stringify(result.issues));
  assert.equal(result.actualViewport.overflowY, false);
  assert.equal(result.dialogs[0].internalScrollContainers[0].scrollHeight, 1600);
  assert.equal(result.warnings.length, 1);
});

test('visual viewport compression detects controls hidden behind a keyboard', () => {
  const f = fixture();
  f.window.visualViewport = {width: 390, height: 480, offsetLeft: 0, offsetTop: 0, scale: 1};
  const result = auditWindow(f.window);
  assert.equal(result.actualViewport.innerHeight, 844);
  assert.equal(result.actualViewport.visualViewport.height, 480);
  assert.equal(result.bidControls[0].unreachableBottom, true);
  assert.equal(result.status, 'FAIL');
});

test('welcome screen and mismatched requested viewport are never a false game-layout pass', () => {
  const f = fixture();
  f.body.classList.delete('in-game');
  assert.equal(auditWindow(f.window).status, 'NOT_IN_GAME');
  f.body.classList.add('in-game');
  const result = auditWindow(f.window, {width: 320, height: 568});
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some(issue => issue.includes('iframe')));
});

test('completed-game summary checks its own actions instead of requiring an auction warehouse', () => {
  const f = fixture();
  for (const selector of ['.play-main', '.warehouse-stage', '.warehouse', '.bid-dock']) delete f.regions[selector];
  f.regions['.end-screen'] = element('end-screen', box(0, 70, 330, 774));
  const replay = element('primary', box(12, 610, 305, 44), {tagName: 'BUTTON', dataset: {action: 'replay'}, parentElement: f.regions['.end-screen']});
  f.arrays['.bid-dock input, .bid-dock button, .bid-dock select, .bid-dock a'] = [];
  f.arrays['.warehouse .lot-item'] = [];
  f.arrays['.end-screen button, .end-screen a'] = [replay];
  f.arrays['.play-shell *'] = [f.regions['.game-hud'], f.regions['.end-screen'], f.regions['.side-rail'], replay, f.railButton];
  const result = auditWindow(f.window);
  assert.equal(result.mode, 'ending');
  assert.equal(result.status, 'PASS', JSON.stringify(result.issues));
  assert.equal(result.endingControls.length, 1);
  replay.getBoundingClientRect = () => box(12, 820, 305, 44);
  assert.equal(auditWindow(f.window).status, 'FAIL');
});


test('HUD title and actual amount rectangles cannot collide; intentionally hidden round badges are optional', () => {
  const f = fixture();
  f.regions['.hud-round'].style.display = 'none';
  assert.equal(auditWindow(f.window).status, 'PASS');
  f.regions['.hud-money strong'].getBoundingClientRect = () => box(130, 34, 250, 32);
  const result = auditWindow(f.window);
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.hudOverlaps, [['title', 'amount']]);
});
