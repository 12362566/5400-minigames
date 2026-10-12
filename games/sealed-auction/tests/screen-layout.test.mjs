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
    '.warehouse-stage': element('warehouse-stage', box(0, 70, 330, 505)),
    '.warehouse': element('warehouse', box(5, 140, 320, 320)),
    '.side-rail': element('side-rail', box(338, 76, 48, 650)),
    '.bid-dock': element('bid-dock fast-bid-dock', box(0, 590, 330, 244))
  };
  regions['.play-shell'].parentElement = body;
  regions['.play-layout'].parentElement = regions['.play-shell'];
  regions['.play-main'].parentElement = regions['.play-layout'];
  for (const selector of ['.warehouse-stage', '.bid-dock']) regions[selector].parentElement = regions['.play-main'];
  regions['.warehouse'].parentElement = regions['.warehouse-stage'];
  const railButton = element('rail-button', box(340, 80, 44, 44), {tagName: 'BUTTON', dataset: {action: 'clues'}, parentElement: regions['.side-rail']});
  const control = (name, rect, dataset = {}, options = {}) => element(name, rect, {tagName: 'BUTTON', dataset, parentElement: regions['.bid-dock'], ...options});
  const bidControl = control('exact-open', box(274, 604, 44, 44), {action: 'exact-bid'});
  const presets = [100000, 300000, 500000].map((amount, index) => control('preset', box(8 + 80 * index, 654, 70, 44), {bidAmount: String(amount)}));
  const previous = control('previous', box(248, 654, 70, 44), {quick: 'own'});
  const adjustments = [-50000, -10000, 10000, 50000].map((adjustment, index) => control('adjust', box(8 + 80 * index, 704, 70, 44), {bidAdjust: String(adjustment)}));
  const pass = control('subtle', box(8, 754, 80, 44), {action: 'pass'});
  const submit = control('primary', box(96, 754, 222, 44), {}, {id: 'bid-submit'});
  const amount = element('amount', box(8, 604, 250, 27), {tagName: 'STRONG', id: 'bid-amount', parentElement: regions['.bid-dock']});
  const wan = element('wan', box(8, 632, 250, 13), {tagName: 'SMALL', id: 'bid-wan', parentElement: regions['.bid-dock']});
  const form = element('bid-form', box(8, 604, 310, 194), {tagName: 'FORM', id: 'bid-form', parentElement: regions['.bid-dock']});
  const controls = [bidControl, ...presets, previous, ...adjustments, pass, submit];
  const lotItem = element('lot-item', box(9, 144, 32, 32), {tagName: 'BUTTON', dataset: {item: 'item-1'}, parentElement: regions['.warehouse']});
  Object.assign(regions, {'#bid-form': form, '#bid-amount': amount, '#bid-wan': wan, '.bid-dock .primary': submit});
  const mainElements = [regions['.warehouse-stage'], regions['.warehouse'], regions['.bid-dock'], form, amount, wan, ...controls, lotItem];
  const arrays = {
    '.side-rail button, .side-rail a': [railButton],
    '.bid-dock input, .bid-dock button, .bid-dock select, .bid-dock a': controls,
    '.bid-dock [data-bid-amount]': presets, '.bid-dock [data-bid-adjust]': adjustments,
    '.bid-dock [data-quick="own"]': [previous], '.bid-dock [data-action="exact-bid"]': [bidControl],
    '.bid-dock #bid-submit': [submit], '.bid-dock [data-action="pass"]': [pass],
    '.warehouse .lot-item': [lotItem], 'dialog[open]': [],
    '.play-main *': mainElements,
    '.play-shell *': [regions['.game-hud'], regions['.side-rail'], railButton, ...mainElements]
  };
  const document = {documentElement: html, body, querySelector: selector => regions[selector] || null, querySelectorAll: selector => arrays[selector] || []};
  const window = {document, innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0, getComputedStyle: target => target.style};
  return {window, html, body, regions, arrays, railButton, bidControl, lotItem, presets, previous, adjustments, pass, submit, amount, wan, form};
}

test('the six exact-size presets cover narrow, tall, landscape, keyboard-sized and desktop viewports', () => {
  assert.deepEqual(viewportPresets.map(({width, height}) => [width, height]), [[320, 568], [390, 844], [410, 820], [568, 320], [390, 480], [1280, 720]]);
});

test('authored preview uses same-origin v1.2.0 game without shrinking the iframe to its parent', async () => {
  const html = await file('tests/mobile-preview.html');
  assert.match(html, /src="\.\.\/index\.html\?v=1\.2\.0"/);
  assert.match(html, /frame\.style\.width/);
  assert.match(html, /frame\.style\.height/);
  const iframeRule = html.match(/iframe\s*\{([^}]+)\}/)?.[1];
  assert.ok(iframeRule);
  assert.doesNotMatch(iframeRule, /max-width|transform|zoom/);
  assert.doesNotMatch(html, /resizeTo\(|resizeBy\(/);
});

test('engine and original artwork remain byte-for-byte unchanged', async () => {
  for (const [name, expected] of [
    ['engine.js', '31c92cc2a3adb78ddeb15026104b0d897ec03775e8d7baf6a5a38631df3cf3c5'],
    ['art.js', 'e31e47371c775ed7a3d31227a6bc2376a1fa65dfea97cd7c89ac79b20a4c2d81']
  ]) {
    const bytes = await readFile(new URL(`../${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
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
  f.bidControl.getBoundingClientRect = () => box(8, 826, 310, 44);
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
  f.bidControl.getBoundingClientRect = () => box(8, 810, 310, 30);
  const result = auditWindow(f.window);
  assert.equal(result.actualViewport.overflowY, false);
  assert.equal(result.bidControls[0].unreachableBottom, true);
  assert.deepEqual(result.bidControls[0].clippedBy, ['div.bid-dock.fast-bid-dock']);
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

test('fast-bid audit requires all three presets, four adjustments, previous, exact, pass, and submit', () => {
  for (const [selector, category] of [
    ['.bid-dock [data-bid-amount]', 'presets'], ['.bid-dock [data-bid-adjust]', 'adjustments'],
    ['.bid-dock [data-quick="own"]', 'ownPrevious'], ['.bid-dock [data-action="exact-bid"]', 'exact'],
    ['.bid-dock #bid-submit', 'submit'], ['.bid-dock [data-action="pass"]', 'pass']
  ]) {
    const f = fixture();
    f.arrays[selector][0].style.display = 'none';
    const result = auditWindow(f.window);
    assert.equal(result.status, 'FAIL', category);
    assert.ok(result.issues.some(issue => issue.includes(`控件：${category}`)), category);
  }
  const result = auditWindow(fixture().window);
  assert.deepEqual(Object.fromEntries(Object.entries(result.fastBidControls).map(([key, controls]) => [key, controls.length])), {
    presets: 3, adjustments: 4, ownPrevious: 1, exact: 1, submit: 1, pass: 1
  });
  assert.equal(result.bidControls.length, 11);
  assert.ok(result.bidControls.every(control => control.minimum44));
});

test('every quick target must be at least 44 by 44 even when the viewport and document do not overflow', () => {
  for (const category of ['presets', 'adjustments', 'previous', 'bidControl', 'pass', 'submit']) {
    for (const dimension of ['width', 'height']) {
      const f = fixture(), control = Array.isArray(f[category]) ? f[category][0] : f[category];
      const rect = control.getBoundingClientRect();
      control.getBoundingClientRect = () => box(rect.left, rect.top, dimension === 'width' ? 43 : rect.width, dimension === 'height' ? 43 : rect.height);
      const result = auditWindow(f.window);
      assert.equal(result.actualViewport.overflowX, false);
      assert.equal(result.actualViewport.overflowY, false);
      assert.equal(result.status, 'FAIL', `${category} ${dimension}`);
      assert.ok(result.issues.some(issue => issue.includes('快捷报价触控目标小于 44×44')));
    }
  }
});

test('fast controls cannot overlap one another or be replaced by an invisible primary action', () => {
  const overlap = fixture();
  overlap.presets[1].getBoundingClientRect = overlap.presets[0].getBoundingClientRect;
  const overlapped = auditWindow(overlap.window);
  assert.equal(overlapped.status, 'FAIL');
  assert.ok(overlapped.bidControlOverlaps.some(pair => pair.includes('[data-bid-amount="100000"]')));
  const hidden = fixture();
  hidden.submit.style.visibility = 'hidden';
  const missing = auditWindow(hidden.window);
  assert.equal(missing.primaryAction, null);
  assert.ok(missing.issues.some(issue => issue.includes('缺少可见的主要操作按钮')));
});

test('whole main containment catches elements inside the viewport that escape .play-main', () => {
  const f = fixture();
  f.regions['.play-main'].getBoundingClientRect = () => box(0, 70, 330, 700);
  f.regions['.play-main'].style.overflowY = 'hidden';
  const result = auditWindow(f.window);
  assert.equal(result.actualViewport.overflowY, false);
  assert.equal(result.regionContainment.bid.bottom, true);
  assert.ok(result.mainElementsOutsideMain.some(item => item.name === '#bid-submit'));
  assert.equal(result.primaryAction.viewportOverflow.bottom, false);
  assert.ok(result.primaryAction.clippedBy.includes('div.play-main'));
  assert.equal(result.status, 'FAIL');
});

test('draft number and 万 readout must both be visible and fully contained', () => {
  for (const key of ['amount', 'wan']) {
    const hidden = fixture(); hidden[key].style.display = 'none';
    assert.ok(auditWindow(hidden.window).issues.some(issue => issue.includes('缺少可见的报价金额读数')));
    const clipped = fixture();
    clipped.regions['.bid-dock'].style.overflowX = 'hidden';
    clipped[key].getBoundingClientRect = () => box(320, 604, 30, 20);
    const result = auditWindow(clipped.window);
    assert.equal(result.actualViewport.overflowX, false);
    assert.ok(result.issues.some(issue => issue.includes('报价金额读数被裁切或超出主内容区')));
    assert.equal(result.status, 'FAIL');
  }
});

function landscapeFixture() {
  const f = fixture();
  f.window.innerWidth = 568; f.window.innerHeight = 320;
  for (const element of [f.html, f.body]) {
    element.clientWidth = element.scrollWidth = 568; element.clientHeight = element.scrollHeight = 320;
    element.getBoundingClientRect = () => box(0, 0, 568, 320);
  }
  const positions = {
    '.play-shell': box(0, 0, 568, 320), '.play-layout': box(8, 48, 552, 264), '.play-main': box(8, 48, 454, 264),
    '.game-hud': box(8, 5, 552, 37), '.hud-title': box(8, 5, 210, 37), '.hud-money': box(340, 5, 220, 37),
    '.hud-money strong': box(340, 18, 220, 22), '.hud-round': box(240, 5, 80, 37),
    '.warehouse-stage': box(14, 54, 191, 252), '.warehouse': box(14, 80, 191, 191),
    '.side-rail': box(468, 48, 92, 140), '.bid-dock': box(212, 74, 244, 212),
    '#bid-form': box(220, 84, 228, 192)
  };
  for (const [selector, rect] of Object.entries(positions)) f.regions[selector].getBoundingClientRect = () => rect;
  f.railButton.getBoundingClientRect = () => box(468, 48, 44, 44);
  f.lotItem.getBoundingClientRect = () => box(20, 86, 24, 24);
  f.bidControl.getBoundingClientRect = () => box(404, 84, 44, 44);
  f.amount.getBoundingClientRect = () => box(220, 84, 176, 27);
  f.wan.getBoundingClientRect = () => box(220, 113, 176, 13);
  [...f.presets, f.previous].forEach((control, i) => {control.getBoundingClientRect = () => box(220 + 58 * i, 133, 54, 44);});
  f.adjustments.forEach((control, i) => {control.getBoundingClientRect = () => box(220 + 58 * i, 182, 54, 44);});
  f.pass.getBoundingClientRect = () => box(220, 231, 54, 44);
  f.submit.getBoundingClientRect = () => box(280, 231, 168, 44);
  return f;
}

test('568 by 320 audit accepts side-by-side warehouse and fast dock, and rejects stacked or escaping regions', () => {
  const f = landscapeFixture(), result = auditWindow(f.window, {width: 568, height: 320});
  assert.equal(result.status, 'PASS', JSON.stringify(result.issues));
  assert.equal(result.landscapeSideBySide, true);
  assert.equal(result.mainElementsOutsideMain.length, 0);
  f.regions['.warehouse-stage'].getBoundingClientRect = () => box(14, 48, 191, 20);
  f.regions['.warehouse'].getBoundingClientRect = () => box(14, 48, 20, 20);
  const stacked = auditWindow(f.window);
  assert.equal(stacked.landscapeSideBySide, false);
  assert.ok(stacked.issues.some(issue => issue.includes('没有并排显示')));
  f.regions['.bid-dock'].getBoundingClientRect = () => box(212, 74, 258, 212);
  const escaped = auditWindow(f.window);
  assert.equal(escaped.regionContainment.bid.right, true);
  assert.equal(escaped.status, 'FAIL');
});
