/* Same-origin, read-only browser geometry audit. This does not change game state. */
const TOLERANCE = 1;
const round = number => Math.round(number * 100) / 100;
export const viewportPresets = Object.freeze([
  {width: 320, height: 568, label: '小屏 320 × 568'},
  {width: 390, height: 844, label: '手机 390 × 844'},
  {width: 410, height: 820, label: '手机 410 × 820'},
  {width: 568, height: 320, label: '横屏 568 × 320'},
  {width: 390, height: 480, label: '键盘高度 390 × 480'},
  {width: 1280, height: 720, label: '桌面 1280 × 720'}
]);
export function rectOf(rect) {
  return Object.fromEntries(['x', 'y', 'left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, round(rect[key] ?? 0)]));
}
export function intersects(a, b, tolerance = TOLERANCE) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
}
export function outside(inner, outer, tolerance = TOLERANCE) {
  return {
    left: inner.left < outer.left - tolerance,
    right: inner.right > outer.right + tolerance,
    top: inner.top < outer.top - tolerance,
    bottom: inner.bottom > outer.bottom + tolerance
  };
}
const anySide = sides => Object.values(sides).some(Boolean);
const elementName = element => element.id ? `#${element.id}` : element.dataset.action ? `[data-action="${element.dataset.action}"]` : `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`;
const metrics = element => ({
  clientWidth: element.clientWidth, clientHeight: element.clientHeight,
  scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
  scrollLeft: element.scrollLeft, scrollTop: element.scrollTop
});
export function auditWindow(window, requestedViewport) {
  const document = window.document, html = document.documentElement, body = document.body;
  const visible = element => {
    if (!element) return false;
    const style = window.getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const issues = [], warnings = [];
  const inGame = body.classList.contains('in-game');
  const ending = visible(document.querySelector('.end-screen'));
  const visual = window.visualViewport;
  const viewport = {
    left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
    right: (visual?.offsetLeft || 0) + (visual?.width || window.innerWidth),
    bottom: (visual?.offsetTop || 0) + (visual?.height || window.innerHeight)
  };
  const report = {
    status: inGame ? 'PASS' : 'NOT_IN_GAME', mode: ending ? 'ending' : inGame ? 'auction' : 'welcome',
    note: inGame ? '只读几何检查；仍需目视确认文字、焦点、抽屉和实际软键盘。' : '请先入场并关闭欢迎抽屉，再检查游戏布局。入场页不适用单屏断言。',
    requestedViewport,
    actualViewport: {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      visualViewport: visual ? {width: round(visual.width), height: round(visual.height), offsetTop: round(visual.offsetTop), offsetLeft: round(visual.offsetLeft), scale: visual.scale} : null,
      document: metrics(html), body: metrics(body),
      overflowX: Math.max(html.scrollWidth, body.scrollWidth) > html.clientWidth + TOLERANCE,
      overflowY: Math.max(html.scrollHeight, body.scrollHeight) > html.clientHeight + TOLERANCE,
      scrollX: window.scrollX, scrollY: window.scrollY
    },
    regions: {}, hudParts: {}, hudOverlaps: [], overlaps: [], sidebarButtons: [], bidControls: [], endingControls: [], warehouseItems: [], dialogs: [], issues, warnings
  };
  if (requestedViewport && (window.innerWidth !== requestedViewport.width || window.innerHeight !== requestedViewport.height)) {
    issues.push('实际 iframe 视口不等于所选尺寸；本次不能代表所选设备。');
  }
  if (inGame && (report.actualViewport.overflowX || report.actualViewport.overflowY)) issues.push('主文档存在横向或纵向溢出。');
  if (inGame && (Math.abs(window.scrollX) > TOLERANCE || Math.abs(window.scrollY) > TOLERANCE)) issues.push('游戏中的主文档滚动位置不是原点。');
  const selectors = {
    shell: '.play-shell', layout: '.play-layout', main: '.play-main', hud: '.game-hud',
    stage: '.warehouse-stage', warehouse: '.warehouse', rail: '.side-rail', bid: '.bid-dock', ending: '.end-screen'
  };
  const regions = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, document.querySelector(selector)]));
  for (const [name, element] of Object.entries(regions)) {
    report.regions[name] = visible(element) ? rectOf(element.getBoundingClientRect()) : null;
    const required = ending ? ['shell', 'layout', 'hud', 'rail', 'ending'].includes(name) : name !== 'ending';
    if (inGame && required && !report.regions[name]) issues.push(`缺少可见区域：${selectors[name]}`);
    if (inGame && report.regions[name] && anySide(outside(report.regions[name], viewport))) issues.push(`区域超出可见视口：${selectors[name]}`);
  }
  const mainPairs = [['hud', 'warehouse'], ['hud', 'rail'], ['hud', 'bid'], ['warehouse', 'rail'], ['warehouse', 'bid'], ['rail', 'bid'], ['ending', 'rail'], ['ending', 'hud']];
  for (const [a, b] of mainPairs) {
    const first = report.regions[a], second = report.regions[b];
    if (first && second && intersects(first, second)) {
      report.overlaps.push([a, b]);
      if (inGame) issues.push(`主要区域重叠：${a} / ${b}`);
    }
  }
  // The round badge is intentionally optional at short heights; title and balance must not collide.
  const hudSelectors = {title: '.hud-title', money: '.hud-money', amount: '.hud-money strong', round: '.hud-round'};
  for (const [name, selector] of Object.entries(hudSelectors)) {
    const element = document.querySelector(selector);
    report.hudParts[name] = visible(element) ? rectOf(element.getBoundingClientRect()) : null;
    if (inGame && ['title', 'money'].includes(name) && !report.hudParts[name]) issues.push(`HUD 缺少可见内容：${selector}`);
    if (inGame && report.hudParts[name] && anySide(outside(report.hudParts[name], viewport))) issues.push(`HUD 内容超出可见视口：${selector}`);
  }
  for (const [a, b] of [['title', 'money'], ['title', 'amount'], ['title', 'round'], ['round', 'money'], ['round', 'amount']]) {
    if (report.hudParts[a] && report.hudParts[b] && intersects(report.hudParts[a], report.hudParts[b])) {
      report.hudOverlaps.push([a, b]);
      if (inGame) issues.push(`HUD 标题、轮次或余额重叠：${a} / ${b}`);
    }
  }
  // Trace clipping ancestors as well as the viewport; overflow:hidden alone is not proof of a usable UI.
  const controlBounds = element => {
    const rect = rectOf(element.getBoundingClientRect()), viewportOverflow = outside(rect, viewport), clippedBy = [];
    let clippedBottom = false;
    for (let ancestor = element.parentElement; ancestor && ancestor !== body; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
      const sides = outside(rect, bounds);
      if ((/(hidden|clip|auto|scroll)/.test(style.overflowX) && (sides.left || sides.right)) ||
          (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (sides.top || sides.bottom))) {
        clippedBy.push(elementName(ancestor));
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && sides.bottom) clippedBottom = true;
      }
    }
    return {name: elementName(element), text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 60), rect, viewportOverflow, clippedBy, unreachableBottom: viewportOverflow.bottom || clippedBottom};
  };
  for (const button of document.querySelectorAll('.side-rail button, .side-rail a')) {
    if (!visible(button)) continue;
    const info = controlBounds(button);
    info.minimum44 = info.rect.width >= 44 && info.rect.height >= 44;
    report.sidebarButtons.push(info);
    if (inGame && !info.minimum44) issues.push(`侧栏触控目标小于 44×44：${info.name}`);
    if (inGame && (anySide(info.viewportOverflow) || info.clippedBy.length)) issues.push(`侧栏控件不可完整触达：${info.name}`);
  }
  if (inGame && !report.sidebarButtons.length) issues.push('没有可见的侧栏操作按钮。');
  for (const control of document.querySelectorAll('.bid-dock input, .bid-dock button, .bid-dock select, .bid-dock a')) {
    if (!visible(control)) continue;
    const info = controlBounds(control);
    report.bidControls.push(info);
    if (inGame && (anySide(info.viewportOverflow) || info.clippedBy.length)) issues.push(`报价区控件不可完整触达：${info.name}`);
  }
  if (inGame && !ending && !report.bidControls.length) issues.push('报价区没有可见的操作控件。');
  for (const control of document.querySelectorAll('.end-screen button, .end-screen a')) {
    if (!visible(control)) continue;
    const info = controlBounds(control);
    report.endingControls.push(info);
    if (inGame && (anySide(info.viewportOverflow) || info.clippedBy.length)) issues.push(`终局控件不可完整触达：${info.name}`);
  }
  if (inGame && ending && !report.endingControls.length) issues.push('终局画面没有可见的操作控件。');
  const warehouse = report.regions.warehouse;
  for (const item of document.querySelectorAll('.warehouse .lot-item')) {
    if (!visible(item)) continue;
    const rect = rectOf(item.getBoundingClientRect()), bounds = warehouse ? outside(rect, warehouse) : null;
    report.warehouseItems.push({id: item.dataset.item, rect, outsideWarehouse: bounds});
    if (inGame && (!bounds || anySide(bounds))) issues.push(`拍品超出仓库：${item.dataset.item}`);
  }
  // Dialog content is allowed to scroll internally. It is deliberately excluded from main-content scans.
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    const rect = rectOf(dialog.getBoundingClientRect()), style = window.getComputedStyle(dialog);
    const scrollContainers = [dialog, ...dialog.querySelectorAll('*')].filter(element => {
      const s = window.getComputedStyle(element);
      return /(auto|scroll)/.test(s.overflowY) && element.scrollHeight > element.clientHeight + TOLERANCE;
    }).map(element => ({name: elementName(element), ...metrics(element)}));
    const viewportOverflow = outside(rect, viewport);
    report.dialogs.push({rect, ...metrics(dialog), overflowY: style.overflowY, viewportOverflow, internalScrollContainers: scrollContainers, closeButtons: [...dialog.querySelectorAll('[data-action="close"], .modal-close')].filter(visible).map(element => ({name: elementName(element), rect: rectOf(element.getBoundingClientRect())}))});
    if (anySide(viewportOverflow)) issues.push('打开的抽屉外框超出可见视口。');
    warnings.push('抽屉已打开：游戏控件当前被模态层遮挡属于正常行为；关闭后再检查实际点击与焦点恢复。');
  }
  const mainOverflow = [...document.querySelectorAll('.play-shell *')].filter(element => visible(element) && !element.closest('dialog') && !element.closest('.warehouse')).map(element => ({element, rect: rectOf(element.getBoundingClientRect())})).filter(({rect}) => anySide(outside(rect, viewport))).map(({element, rect}) => ({name: elementName(element), rect}));
  report.mainElementsOutsideViewport = mainOverflow;
  if (inGame && mainOverflow.length) issues.push(`主界面有 ${mainOverflow.length} 个元素超出可见视口。`);
  if (inGame) report.status = issues.length ? 'FAIL' : 'PASS';
  return report;
}
