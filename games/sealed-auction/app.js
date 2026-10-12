import {CONSTANTS,RARITIES,ROLES,CATALOG,createGame,publicView,submitBid,useTool,nextRound,nextLot,serialize,restore} from './engine.js';
import {art,avatar} from './art.js';
const $=s=>document.querySelector(s), root=$('#app'), modal=$('#modal');
const SAVE='5400-sealed-auction-v1', RECORD='5400-sealed-auction-record-v1';
let game=null, view=null, chosenRole='appraiser', screen='welcome', audioOn=false, audioContext=null, saveOkay=true, toastTimer, lastFocus=null;
let boardObserver=null, bidDraft='', draftKey='', activeDrawer='';
let bestProfit=null;try{const record=JSON.parse(localStorage.getItem(RECORD));if(record&&Number.isSafeInteger(record.bestProfit)&&Math.abs(record.bestProfit)<1e9)bestProfit=record.bestProfit}catch{}
let saved=null;try{const raw=localStorage.getItem(SAVE);if(raw){const loaded=restore(raw);if(loaded.ok)saved=loaded.state;else setTimeout(()=>toast('旧存档无法读取。可以安全地开始新一局。'),100)}}catch{saveOkay=false}
const money=n=>Number(n||0).toLocaleString('zh-CN');
const signed=n=>(n>=0?'+':'−')+money(Math.abs(n));
const compact=n=>n>=10000?(n/10000).toFixed(n>=100000?1:2).replace(/\.0+$|(?<=\.[0-9])0$/,'')+'万':money(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rarity=n=>RARITIES[n]||{name:'未知品质',color:'#97a7aa'};
function tone(type='click'){if(!audioOn)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const notes=type==='win'?[440,554,659]:type==='reveal'?[330,440]:[310];notes.forEach((freq,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,audioContext.currentTime+i*.09);g.gain.linearRampToValueAtTime(.05,audioContext.currentTime+i*.09+.015);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+i*.09+.22);o.connect(g).connect(audioContext.destination);o.start(audioContext.currentTime+i*.09);o.stop(audioContext.currentTime+i*.09+.25)})}catch{}}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
function persist(){saved=game;try{localStorage.setItem(SAVE,serialize(game));saveOkay=true;if(view.phase==='finished'&&(bestProfit===null||view.profit>bestProfit)){bestProfit=view.profit;localStorage.setItem(RECORD,JSON.stringify({bestProfit}))}}catch{saveOkay=false}}
function adopt(result){if(!result.ok){toast(result.error);return false}game=result.state;view=publicView(game);persist();renderGame();return true}
function openModal(title,body,actions='',side=false){modal.classList.toggle('side-drawer',side);activeDrawer=side?title:'';if(!modal.open)lastFocus=document.activeElement;$('#modal-content').innerHTML=`<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="modal-close" data-action="close" aria-label="关闭">×</button></div>${body}${actions}`;if(!modal.open)modal.showModal();$('#modal-content').querySelector('button')?.focus()}
function closeModal(){modal.close();activeDrawer='';if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true})}
modal.addEventListener('cancel',e=>{e.preventDefault();closeModal()});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal()}});
function showHelp(){openModal('先看线索，再出价',`<div class="modal-copy"><ol><li><strong>估一整仓。</strong>仓库里藏着一批拍品。描边格子是公开轮廓，颜色代表品质；你能看到的私人鉴定只有你知道。点击拍品查看详情。</li><li><strong>各报各的价。</strong>你与 3 位 AI 同时密封报价，提交后才开标。主画面的金额和加减按钮只修改草稿；按“密封出价”才提交。每轮可以改价，也可以填 0 或选择不跟。未成交前不扣报价。</li><li><strong>五轮见分晓。</strong>最高报价严格超过第二名的 1.4 倍，立即成交；否则进入下一轮，补充公开线索。第 5 轮最高价拍得整仓。同价时由种子随机抽签；全员报价 0 则流拍。</li><li><strong>赚的是差价。</strong>赢家获得整仓价值，支付自己的成交价；其他人不用付报价。鉴定工具费用无论中标与否都不退。</li></ol><p>本局共 5 仓，每仓 12–18 件，初始 120 万虚拟币。藏品成交后自动变现。目标是结束时比开局赚得更多。AI 只根据自己的线索和公开历史估价，不读取你的本轮出价。</p><p>这是参考视频中盲拍核心玩法的原创单机实现。人物、藏品、美术和数值为本作设计；没有真人联网、充值或兑换。无需抢倒计时，可慢慢思考。</p><div class="rarity-key">${RARITIES.map(r=>`<span style="color:${r.color}">${r.name}</span>`).join('')}</div><a href="https://www.bilibili.com/video/BV1XWeg6KEgk/" target="_blank" rel="noopener noreferrer">查看玩法参考视频 ↗</a></div>`,`<div class="modal-actions"><button class="primary" data-action="close">明白了</button></div>`)}
function toggleSound(){audioOn=!audioOn;$('#sound').textContent=audioOn?'♪':'♫';$('#sound').setAttribute('aria-label',audioOn?'关闭音效':'开启音效');$('#sound').title=audioOn?'关闭音效':'开启音效';tone();toast(audioOn?'音效已开启':'音效已关闭')}
$('#help').addEventListener('click',showHelp);$('#sound').addEventListener('click',toggleSound);
function renderWelcome(){
  screen='welcome';document.body.classList.remove('in-game');boardObserver?.disconnect();updateViewport();
  root.innerHTML=`<section class="lobby"><div class="lobby-intro"><div><div class="eyebrow">四人暗标 · 五轮博弈</div><h1>看得见线索，<br><em>看不透底价。</em></h1></div><div class="lobby-art" aria-hidden="true">${art('vase')}${art('gem')}</div></div><section class="lobby-roles"><div class="section-head"><h2>选择入场身份</h2><p>不同线索，同一仓秘密</p></div><div class="roles">${ROLES.map((r,i)=>`<button class="role-card ${chosenRole===r.id?'selected':''}" data-role="${r.id}" aria-pressed="${chosenRole===r.id}"><span class="role-icon">${art(['gem','chart','eye'][i])}</span><span><strong>${r.name}</strong><p>${r.description}</p></span></button>`).join('')}</div></section><div class="lobby-start"><div class="start-actions">${saved?'<button data-action="continue">继续上局</button>':''}<button class="primary" data-action="start">${saved?'开启新一局':'入场竞拍'}　→</button></div><p>120万虚拟币 · 五仓一局 · 自动保存</p></div></section>`;
}
function startNew(){const seed=(crypto.getRandomValues(new Uint32Array(1))[0]);game=createGame({seed,role:chosenRole});view=publicView(game);screen='game';persist();renderGame();window.scrollTo({top:0,behavior:'instant'});tone();}
function confirmStart(){if(saved&&publicView(saved).phase!=='finished'){openModal('开启新一局？',`<div class="modal-copy"><p>当前这局会被新局替换。你也可以关闭窗口，选择“继续上局”。</p></div>`,`<div class="modal-actions"><button data-action="close">保留当前局</button><button class="primary" data-action="new-confirm">开始新局</button></div>`)}else{startNew();showBrief()}}
function showBrief(){openModal('欢迎来到暗标拍卖局',`<div class="modal-copy"><p>你选择了<strong>${ROLES.find(r=>r.id===chosenRole).name}</strong>。先点右侧“情报”查看私人线索，再点底部的金额和加减按钮选择整仓报价，最后按“密封出价”。</p><p>前几轮会继续揭开线索。<strong>出价超过第二名 1.4 倍会提前成交</strong>，别为了领先而盲目抬价。第 5 轮最高价得仓，赢家才支付报价。</p><p>主画面不用上下滑动。情报、鉴定、记录、图鉴和设置都在右侧；只有展开的侧栏内部可能滚动。</p></div>`,`<div class="modal-actions"><button class="primary" data-action="close">开始看货</button></div>`)}
function knownFloor(){const totals={};view.items.filter(x=>x.visibility==='appraised').forEach(x=>totals[x.rarity]=(totals[x.rarity]||0)+x.value);view.clues.filter(c=>Number.isInteger(c.rarity)&&Number.isFinite(c.value)).forEach(c=>totals[c.rarity]=Math.max(totals[c.rarity]||0,c.value));return Object.values(totals).reduce((a,b)=>a+b,0)}
function historyAmount(id,h){return h?.bids.find(b=>b.id===id)?.amount??null}
function renderBidders(){return [{id:'player',name:'你',role:view.role},...view.rivals].map((p,i)=>{const last=view.history.at(-1),bid=historyAmount(p.id,last);return `<div class="bidder ${i===0?'you':''}"><div class="portrait">${avatar(i)}</div><div class="bidder-copy"><div class="bidder-name">${esc(p.name)}</div><div class="bidder-status">${bid===null?(i===0?'待报价':'估价中'):(bid===0?'未跟':compact(bid))}</div></div></div>`}).join('')}
function renderWarehouse(){const revealed=['lot-result','finished'].includes(view.phase);return `<div class="warehouse ${revealed?'reveal-all':''}" aria-label="封存仓库中的可见拍品">${view.items.map((item,i)=>`<button class="lot-item ${item.visibility}" data-item="${esc(item.id)}" style="left:calc(${item.x/8*100}% + 3px);top:calc(${item.y/8*100}% + 3px);width:calc(${item.w/8*100}% - 6px);height:calc(${item.h/8*100}% - 6px);--item-color:${rarity(item.rarity).color};animation-delay:${Math.min(i*.025,.35)}s" aria-label="${esc(item.visibility==='appraised'?`${item.name}，价值 ${money(item.value)}`:`${rarity(item.rarity).name}轮廓，${item.w}乘${item.h}格`)}">${art(item.kind||'unknown')}${item.visibility==='appraised'?`<span class="item-price">${compact(item.value)}</span>`:''}${view.clues.some(c=>c.type==='private'&&c.itemId===item.id)?'<span class="item-corner">私</span>':''}</button>`).join('')}</div>`}
function bidOptions(){const base=Math.min(100000,10**Math.floor(Math.log10(Math.max(view.wallet,1))));return {presets:[base,base*3,base*5],small:Math.max(1,base/10),large:Math.max(5,base/2)}}
function bidWan(n){return (n/10000).toFixed(4).replace(/\.?0+$/,'')+' 万'}
function bidError(raw){if(raw===''||raw===undefined||!/^[0-9]+$/.test(String(raw)))return '请输入 0 到余额之间的整数报价。';const n=Number(raw);return !Number.isSafeInteger(n)||n>view.wallet?'报价不能超过可用余额 '+money(view.wallet)+'。':''}
function refreshBidDraft(){
  const n=Number(bidDraft),valid=bidDraft!==''&&!bidError(bidDraft);
  const amount=$('#bid-amount'),wan=$('#bid-wan'),submit=$('#bid-submit');
  if(amount)amount.textContent=bidDraft===''?'选择金额':money(n);
  if(wan)wan.textContent=bidDraft===''?'点金额或加减即可':bidWan(n)+' · 虚拟币';
  if(submit){submit.disabled=!valid;submit.setAttribute('aria-label',valid?'密封出价 '+money(n)+' 虚拟币':'请先选择报价金额')}
  document.querySelectorAll('[data-bid-adjust]').forEach(button=>{const delta=Number(button.dataset.bidAdjust);button.disabled=delta<0?(n||0)<=0:(n||0)>=view.wallet});
  const error=$('#bid-error');if(error)error.textContent=bidDraft===''?'':bidError(bidDraft);
}
function setBidDraft(n){if(!view||view.phase!=='bidding'||!Number.isFinite(n))return;bidDraft=String(Math.max(0,Math.min(view.wallet,Math.round(n))));refreshBidDraft()}
function openExactBid(){
  if(view?.phase!=='bidding')return;
  openModal('精确金额',`<form id="exact-form" novalidate><label class="exact-label" for="bid">虚拟币整数 · 1万 = 10,000</label><input class="exact-input" id="bid" aria-label="本轮报价，虚拟币整数" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="10" placeholder="例如 235000" value="${esc(bidDraft)}"><p class="exact-hint">可用 ${money(view.wallet)}。这里只填金额，不会直接出价。</p><p id="exact-error" class="exact-error" role="alert"></p><button type="button" class="exact-all" data-quick="all">填入全部余额 · ${compact(view.wallet)}</button><div class="modal-actions"><button type="button" data-action="close">取消</button><button type="submit" class="primary">填入报价</button></div></form>`);
  $('#exact-form')?.addEventListener('submit',e=>{e.preventDefault();const raw=$('#bid').value.trim(),error=bidError(raw);if(error){$('#exact-error').textContent=error;return}setBidDraft(Number(raw));closeModal()});
  $('#bid')?.addEventListener('input',()=>{$('#exact-error').textContent=''});
  $('#bid')?.addEventListener('focus',()=>requestAnimationFrame(updateViewport));
  $('#bid')?.focus({preventScroll:true});
}
function renderBidPanel(){
  if(view.phase!=='bidding')return renderDockResult();
  const key=`${view.seed}:${view.lotIndex}:${view.round}`;
  if(key!==draftKey){draftKey=key;const previous=historyAmount('player',view.history.at(-1));bidDraft=previous===null?'':String(previous)}
  const options=bidOptions(),previous=historyAmount('player',view.history.at(-1));
  return `<section class="bid-dock fast-bid-dock" aria-label="密封报价"><form id="bid-form" novalidate><div class="bid-draft"><div class="bid-amount-copy" aria-live="polite" aria-atomic="true"><strong id="bid-amount">${bidDraft===''?'选择金额':money(Number(bidDraft))}</strong><small id="bid-wan">${bidDraft===''?'点金额或加减即可':bidWan(Number(bidDraft))+' · 虚拟币'}</small></div><button type="button" class="exact-open" data-action="exact-bid" aria-label="精确金额">精确</button></div><div class="fast-presets" aria-label="常用金额，仅填入">${options.presets.map(n=>`<button type="button" data-bid-amount="${n}" ${n>view.wallet?'disabled':''}>${compact(n)}</button>`).join('')}<button type="button" data-quick="own" ${previous===null?'disabled':''} title="${previous===null?'本仓尚无你的上一轮报价':'填入你上一轮的 '+money(previous)}">上次</button></div><div class="fast-adjust" aria-label="调整报价，仅填入">${[-options.large,-options.small,options.small,options.large].map(n=>`<button type="button" data-bid-adjust="${n}" aria-label="${n<0?'减少':'增加'}${compact(Math.abs(n))}">${n<0?'−':'＋'}${compact(Math.abs(n))}</button>`).join('')}</div><div class="bid-actions"><button type="button" data-action="pass" class="subtle">不跟</button><button id="bid-submit" type="submit" class="primary">密封出价 →</button></div><p id="bid-error" class="bid-error" role="alert"></p></form></section>`;
}
function renderDockResult(){
  if(view.phase==='round-result'){const h=view.history.at(-1),winner=[...h.bids].sort((a,b)=>b.amount-a.amount)[0];return `<section class="bid-dock result-dock"><div class="dock-result-head"><strong>第 ${view.round} 轮已开标</strong><span>${winner.amount?esc(winner.name)+' · '+money(winner.amount):'全员未跟'}</span></div><p>本轮未成交，不扣报价。完整出价见侧边“记录”。</p><button class="primary dock-next" data-action="next-round">查看第 ${view.round+1} 轮线索 →</button></section>`}
  const r=view.result;return `<section class="bid-dock result-dock"><div class="dock-result-head"><strong>${r.unsold?'本仓流拍':r.playerWon?'你拍得这一仓':esc(r.winnerName)+'拍得'}</strong><span class="${r.netProfit>=0?'positive':'negative'}">净收益 ${signed(r.netProfit)}</span></div><div class="dock-values"><span>价值 ${compact(r.lotValue)}</span><span>成交 ${compact(r.winningBid)}</span><button data-panel="settlement">结算明细</button></div><button class="primary dock-next" data-action="${game.phase==='finished'?'show-ending':'next-lot'}">${view.lotIndex===view.totalLots-1?'查看本局成绩':'进入下一仓'} →</button></section>`;
}
function renderResult(){if(view.phase==='round-result'){const h=view.history.at(-1), sorted=[...h.bids].sort((a,b)=>b.amount-a.amount);return `<section class="panel result-panel"><div class="eyebrow">BIDS REVEALED</div><h2>第 ${view.round} 轮 · 开标</h2><p>尚未触发提前成交，本轮不扣报价。</p><div class="round-result">${sorted.map((b,i)=>`<div class="rank-row"><b>${i+1}</b><span>${b.id==='player'?'你':esc(b.name)}</span><strong>${b.amount?money(b.amount):'未跟'}</strong></div>`).join('')}</div><p class="info-hint">下一轮会增加公开线索。可以提高，也可以降低报价，重新判断整仓价值。</p><button class="primary" data-action="next-round">查看第 ${view.round+1} 轮线索 →</button></section>`}
const r=view.result;if(!r)return '';const winner=r.playerWon?'你':esc(r.winnerName||'无人');return `<section class="panel result-panel"><div class="eyebrow">${r.playerWon?'AUCTION WON':r.unsold?'NO SALE':'AUCTION CLOSED'}</div><h2>${r.unsold?'全员未出价 · 流拍':r.playerWon?'落槌！这一仓归你':winner+' 拍得这一仓'}</h2><p>${r.early?'最高价超过第二名 1.4 倍，提前成交。':r.tie?'最终最高价相同，由种子随机抽签决定。':'五轮出价结束，最终最高价成交。'}</p><div class="result-numbers"><div><span>整仓真实价值</span><strong>${money(r.lotValue)}</strong></div><div><span>最终成交价</span><strong>${money(r.winningBid)}</strong></div><div><span>${r.playerWon?'拍卖差价':'你的报价支出'}</span><strong class="${r.playerWon?(r.profit>=0?'positive':'negative'):''}">${r.playerWon?signed(r.profit):'0'}</strong></div><div><span>本仓工具费用</span><strong>−${money(r.toolCost||0)}</strong></div><div><span>你的本仓净盈亏</span><strong class="${r.netProfit>=0?'positive':'negative'}">${signed(r.netProfit)}</strong></div></div><p class="info-hint">${r.playerWon?(r.profit>=0?'眼光不错。收益已计入余额，点仓库拍品查看明细。':'得仓也可能亏损。成交价高于拍品总值，下次多留一点估值余地。'):'没中标不扣报价。看一看实际价值，校准下一仓的判断。'}</p><button class="primary" data-action="${game.phase==='finished'?'show-ending':'next-lot'}">${view.lotIndex===view.totalLots-1?'查看本局成绩':'进入下一仓'} →</button></section>`}
function renderHistory(){const bidders=[{id:'player',name:'你'},...view.rivals];return `<section class="panel history-panel"><div class="history-header"><h2>公开报价簿</h2><span>本轮密封 · 开标后可见</span></div><div class="history-grid" role="table" aria-label="各轮公开报价"><div class="h-head h-name" role="columnheader">买家</div>${[1,2,3,4,5].map(r=>`<div class="h-head" role="columnheader">R${r}</div>`).join('')}${bidders.map(b=>`<div class="h-name" role="rowheader">${esc(b.name)}</div>${[1,2,3,4,5].map(r=>{const h=view.history.find(x=>x.round===r),n=historyAmount(b.id,h);return `<div role="cell" class="${h&&n===h.highest&&n>0?'leading':''}" title="${n===null?'尚未公开':money(n)}">${n===null?'—':n===0?'未跟':compact(n)}</div>`}).join('')}`).join('')}</div></section>`}
function renderGame(){
  screen='game';document.body.classList.add('in-game');updateViewport();
  if(view.phase==='finished'){renderEnding();return}
  const revealed=view.phase==='lot-result';
  root.innerHTML=`<section class="play-shell"><header class="game-hud"><div class="hud-title"><span class="eyebrow">第 ${view.lotIndex+1} / 5 仓</span><h1>${esc(view.lotName)}</h1></div><div class="hud-round">${revealed?'已结算':'第 '+view.round+' / 5 轮'}</div><div class="hud-money"><small>可用虚拟币</small><strong>${money(view.wallet)}</strong></div></header><div class="play-layout"><div class="play-main"><div class="bidder-strip">${renderBidders()}</div><div class="warehouse-stage">${renderWarehouse()}</div><div class="value-strip"><span>${revealed?'整仓实际价值':'已知价值下限'} <strong>${money(revealed?view.result.lotValue:knownFloor())}</strong></span><span class="stage-hint">${revealed?'点击拍品查看价值':'未知物品仍在暗处'}</span></div>${renderBidPanel()}</div>${renderRail()}</div></section>`;
  $('#bid-form')?.addEventListener('submit',e=>{e.preventDefault();placeBid()});
  refreshBidDraft();
  fitBoard();
}
function renderRail(){return `<nav class="side-rail" aria-label="侧边功能"><button data-panel="clues" aria-label="情报"><span aria-hidden="true">◉</span><small>情报</small></button><button data-panel="tools" aria-label="鉴定"><span aria-hidden="true">⌕</span><small>鉴定</small></button><button data-panel="history" aria-label="记录"><span aria-hidden="true">▤</span><small>记录</small></button><button data-action="catalog" aria-label="图鉴"><span aria-hidden="true">◇</span><small>图鉴</small></button><button data-panel="settings" aria-label="设置"><span aria-hidden="true">⚙</span><small>设置</small></button></nav>`}
function renderClues(){return `<div class="drawer-intro">${ROLES.find(r=>r.id===view.role).name}视角 · 已知价值下限 <strong>${money(knownFloor())}</strong></div><div class="clues">${view.clues.map(c=>`<div class="clue ${c.type==='public'?'':'private'}"><span class="badge">${c.type==='public'?'公开':c.type==='tool'?'工具':'私人'}</span><p>${esc(c.text.replace(/^公共线索[：:]\s*/,''))}</p></div>`).join('')}</div><p class="drawer-note">下限只统计明确鉴定过的价值，不等于整仓估值。</p><div class="drawer-items"><h3>可见拍品</h3>${view.items.map(i=>`<button data-item="${esc(i.id)}"><span style="color:${rarity(i.rarity).color}">${art(i.kind||'unknown')}</span><span>${i.name?esc(i.name):esc(i.category||'未知')+'轮廓'}<small>${i.w}×${i.h}格 · ${rarity(i.rarity).name}</small></span><strong>${i.value===undefined?'待鉴定':money(i.value)}</strong></button>`).join('')}</div>`}
function openPanel(which){
  if(!view)return;
  $('#bid')?.blur();
  if(!modal.open)document.querySelector('[data-panel="'+which+'"]')?.focus({preventScroll:true});
  if(which==='clues')openModal('本仓情报',renderClues(),'',true);
  if(which==='tools')openModal('额外鉴定',`<div class="modal-copy"><p>每种工具每仓可用一次，费用立即扣除，未拍中也不退。</p></div><div class="drawer-tools">${view.tools.map(t=>`<button class="tool-button" data-tool="${t.id}" ${!t.available?'disabled':''}>${art(t.id==='scan'?'eye':'chart')}<strong>${t.name}</strong><p>${t.description}</p><small>${t.used?'本仓已使用':money(t.cost)+' 虚拟币'}</small></button>`).join('')}</div><p class="drawer-note">当前可用 ${money(view.wallet)} 虚拟币${view.phase!=='bidding'?'；开标后不可使用工具。':'。'}</p>`,'',true);
  if(which==='history')openModal('公开记录',`${renderHistory()}<div class="modal-copy"><p>只有已开标的报价可见。未成交前不扣报价，下一轮可升价、降价或报0。</p></div>${view.completedLots.length?`<h3 class="drawer-section-title">本局账本</h3><div class="lot-ledger">${view.completedLots.map(r=>`<div class="ledger-row"><span>${r.lotIndex+1}. ${esc(r.lotName)}</span><strong class="${r.netProfit>=0?'positive':'negative'}">${signed(r.netProfit)}</strong></div>`).join('')}</div>`:''}`,'',true);
  if(which==='settlement')openModal('本仓结算',renderResult(),'',true);
  if(which==='settings')openModal('设置与帮助',`<div class="settings-list"><button data-action="toggle-sound">${audioOn?'关闭':'开启'}音效</button><button data-action="help">玩法说明</button><button data-action="home">返回入场页</button><a href="../../index.html">返回小游戏合集 ↗</a></div><p class="drawer-note">${saveOkay?'当前进度已保存在此浏览器。':'浏览器未允许保存，当前进度仅保留在本页内存，请勿关闭页面。'}</p><p class="drawer-note">本局盈亏 <span class="${view.profit>=0?'positive':'negative'}">${signed(view.profit)}</span>。仅限本地虚拟币，无充值或兑换。</p>`,'',true);
}
function updateViewport(){
  const vv=window.visualViewport, h=Math.round(vv&&vv.scale===1?vv.height:window.innerHeight), top=vv&&vv.scale===1?vv.offsetTop:0;
  document.documentElement.style.setProperty('--screen-height',`${h}px`);
  document.documentElement.style.setProperty('--screen-top',`${top}px`);
  document.body.classList.toggle('compact-view',h<580);
  document.body.classList.toggle('short-view',h<440);
  document.body.classList.toggle('low-view',h<520);
  fitBoardSize();
}
function fitBoardSize(){const stage=$('.warehouse-stage');if(!stage)return;const r=stage.getBoundingClientRect();stage.style.setProperty('--board-size',`${Math.max(0,Math.floor(Math.min(r.width,r.height)))}px`)}
function fitBoard(){boardObserver?.disconnect();const stage=$('.warehouse-stage');if(stage&&typeof ResizeObserver!=='undefined'){boardObserver=new ResizeObserver(fitBoardSize);boardObserver.observe(stage)}fitBoardSize()}
window.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('scroll',updateViewport);
function renderEnding(){
  document.body.classList.add('in-game');boardObserver?.disconnect();updateViewport();const win=view.profit>0;
  root.innerHTML=`<section class="play-shell"><header class="game-hud"><div class="hud-title"><span class="eyebrow">五仓已结束</span><h1>本局成绩</h1></div><div class="hud-money"><small>最终虚拟币</small><strong>${money(view.wallet)}</strong></div></header><div class="play-layout"><section class="end-screen"><div class="ending-symbol">${art('gavel')}</div><h2>${win?'好眼光，好买卖。':view.profit===0?'不亏，也是判断。':'下一次，留点余地。'}</h2><p>本局净收益</p><div class="end-profit ${win?'positive':'negative'}">${signed(view.profit)}</div><div class="ending-stats"><div><strong>${view.stats.lotsWon}/5</strong><small>成功拍得</small></div><div><strong>${compact(view.stats.toolCost)}</strong><small>鉴定花费</small></div></div><button class="primary" data-action="replay">再开一局 →</button><button data-action="inspect-last">回看最后一仓</button><p class="drawer-note">逐仓账本在侧边“记录”中。</p></section>${renderRail()}</div></section>`;
}
function placeBid(amount){const raw=amount??bidDraft,error=bidError(raw);if(error){$('#bid-error').textContent=error;return}const n=Number(raw);if(n===view.wallet&&n>0){openModal('确认使用全部余额报价？',`<div class="modal-copy"><p>本轮将报出 <strong>${money(n)} 虚拟币</strong>，相当于全部可用余额。若中标，会按此价格买下整仓；可能亏损。</p><p>只有中标才支付报价。你可以返回修改。</p></div>`,`<div class="modal-actions"><button data-action="close">再想想</button><button class="primary" data-submit="${n}">确认密封出价</button></div>`);return}executeBid(n)}
function executeBid(n){$('#bid')?.blur();if(modal.open)closeModal();if(adopt(submitBid(game,n))){tone(view.phase==='lot-result'&&view.result.playerWon?'win':'reveal')}}
function itemDetail(id){const item=view.items.find(x=>x.id===id);if(!item)return;const full=item.visibility==='appraised',r=rarity(item.rarity);openModal(full?item.name:'尚未鉴定的拍品',`<div class="item-detail" style="color:${r.color}">${art(full?item.kind:'unknown')}<h3>${full?esc(item.name):r.name+'轮廓'}</h3><p>${item.w} × ${item.h} 格 · ${r.name}</p>${full?`<div class="detail-price">${money(item.value)} <small>虚拟币</small></div><p>这是已鉴定的准确价值，已计入已知价值下限。</p>`:`<div class="detail-price">？</div><p>目前只知道外形尺寸${item.category?'、'+esc(item.category)+'类别':''}${item.rarity===undefined?'':'与品质'}。身份和价值仍未知，不能把相同尺寸当作相同拍品。</p>`}</div>`,`<div class="modal-actions"><button class="primary" data-action="close">继续估价</button></div>`)}
function showCatalog(){openModal('拍品图鉴',`<div class="modal-copy"><p>每仓 12–18 件，普通、优良、稀有较常见。以下是本作藏品的准确价格，结合类别和品质缩小范围。<strong>没看见的东西，不要当成一定存在。</strong></p></div><div class="catalog-grid">${RARITIES.map(r=>`<details class="catalog-group"><summary style="color:${r.color}">${r.name}<span>${compact(Math.min(...CATALOG.filter(i=>i.rarity===r.id).map(i=>i.value)))}–${compact(Math.max(...CATALOG.filter(i=>i.rarity===r.id).map(i=>i.value)))}</span></summary>${CATALOG.filter(i=>i.rarity===r.id).map(i=>`<div class="catalog-row"><span>${esc(i.name)}<small>${i.category} · ${i.w}×${i.h}</small></span><strong>${money(i.value)}</strong></div>`).join('')}</details>`).join('')}</div>`,`<div class="modal-actions"><button class="primary" data-action="close">返回竞拍</button></div>`,true)}
function confirmTool(id){const t=view.tools.find(x=>x.id===id);if(!t?.available)return;openModal(t.name,`<div class="modal-copy"><p>${t.description}</p><p>花费 <strong>${money(t.cost)} 虚拟币</strong>，立即扣除。未拍中也不退费；本仓只能使用一次。</p></div>`,`<div class="modal-actions"><button data-action="close">暂时不用</button><button class="primary" data-buy-tool="${id}">使用 · ${money(t.cost)}</button></div>`)}
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.role){chosenRole=el.dataset.role;renderWelcome();tone();return}
  if(el.dataset.panel){openPanel(el.dataset.panel);return}
  if(el.dataset.item){itemDetail(el.dataset.item);return}
  if(el.dataset.tool){confirmTool(el.dataset.tool);return}
  if(el.dataset.buyTool){closeModal();if(adopt(useTool(game,el.dataset.buyTool))){tone('reveal');toast('鉴定完成，情报已更新');openPanel('clues')}return}
  if(el.dataset.submit){executeBid(Number(el.dataset.submit));return}
  if(el.dataset.bidAmount){setBidDraft(Number(el.dataset.bidAmount));return}
  if(el.dataset.bidAdjust){setBidDraft((Number(bidDraft)||0)+Number(el.dataset.bidAdjust));return}
  if(el.dataset.quick){const n=el.dataset.quick==='all'?view.wallet:historyAmount('player',view.history.at(-1));if(n!==null){setBidDraft(n);if(modal.open)closeModal()}return}
  switch(el.dataset.action){
    case'close':closeModal();break;
    case'exact-bid':openExactBid();break;
    case'catalog':showCatalog();break;
    case'help':showHelp();break;
    case'toggle-sound':toggleSound();openPanel('settings');break;
    case'start':confirmStart();break;
    case'new-confirm':closeModal();startNew();showBrief();break;
    case'continue':game=saved;view=publicView(game);chosenRole=view.role;renderGame();break;
    case'pass':placeBid(0);break;
    case'next-round':if(modal.open)closeModal();if(adopt(nextRound(game)))tone('reveal');break;
    case'next-lot':if(modal.open)closeModal();if(adopt(nextLot(game)))tone('reveal');break;
    case'home':if(modal.open)closeModal();renderWelcome();break;
    case'replay':startNew();break;
    case'show-ending':if(modal.open)closeModal();view=publicView(game);renderGame();break;
    case'inspect-last':view={...view,phase:'lot-result'};renderGame();break;
  }
});
updateViewport();renderWelcome();
