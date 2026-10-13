import { createGame, deploy, tick, exposedTargets, serialize, restore } from './engine.js';
import { LEVELS } from './levels.js';
import { VoxelRenderer, PALETTE, cannonSVG } from './renderer.js';

const $=id=>document.getElementById(id);
const SAVE_KEY='cube-salvo-v1';
const query=new URLSearchParams(location.search);
const qaMode=query.has('qa');
let state,unlocked=1,best={},sound=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,userPaused=false,saveError=false;
let dirty=false,lastSave=0,lastFrame=0,lastHUD=0,toastUntil=0,lastUI='',lastQueues='',lastStatus='',resultShown=false;
let audioContext=null,lastAudio=0,confirmAction=null;
function safeLoad(){
  if(qaMode)return;
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return;
    const data=JSON.parse(raw);if(data.version!==1)throw new Error('save version');
    state=restore(data.game);unlocked=Math.max(1,Math.min(LEVELS.length,Math.floor(Number(data.unlocked)||1)));
    if(state.levelIndex>=unlocked)unlocked=state.levelIndex+1;
    if(data.best&&typeof data.best==='object')for(const [k,v] of Object.entries(data.best)){if(/^\d+$/.test(k)&&Number.isFinite(v)&&v>=0)best[k]=v;}
    sound=data.sound===true;reduced=data.reduced===true||reduced;
    userPaused=state.status==='playing'&&state.slots.some(Boolean);
  }catch(e){state=null;toastUntil=-1;}
}
safeLoad();
state=state||createGame(0);
const renderer=new VoxelRenderer($('game-canvas'));
renderer.setState(state,LEVELS[state.levelIndex]);renderer.reduced=reduced;
const pauseCard=document.createElement('div');pauseCard.id='pause-card';pauseCard.className='pause-card';pauseCard.hidden=true;
pauseCard.innerHTML='<span class="pause-symbol" aria-hidden="true">Ⅱ</span><strong>歇一会儿</strong><span>进度在这里，随时接着打</span><button id="continue-game" class="button button-primary">继续游戏</button>';
$('stage').append(pauseCard);
const dialogIds=['menu-dialog','level-dialog','result-dialog','confirm-dialog'];
const dialogs=dialogIds.map($);
function anyDialog(){return dialogs.some(d=>d.open);}
function paused(){return userPaused||anyDialog()||document.hidden;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=performance.now()+2300;}
function save(force=false){
  if(qaMode)return;
  if(!force&&!dirty)return;
  lastSave=performance.now();
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:serialize(state),unlocked,best,sound,reduced}));dirty=false;saveError=false;lastSave=performance.now();}
  catch(e){if(!saveError){toast('浏览器暂时不能保存，当前游戏仍可继续');saveError=true;}}
}
function soundInit(){if(!sound)return;try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}catch(e){sound=false;}}
function ping(color){
  if(!sound||!audioContext||performance.now()-lastAudio<65)return;
  lastAudio=performance.now();const a=audioContext,t=a.currentTime,o=a.createOscillator(),g=a.createGain();
  o.type='sine';const f={green:590,pink:740,cyan:880,ink:440}[color]||590;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.65,t+.055);
  g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.0001,t+.075);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.08);
}
function closeAll(){dialogs.forEach(d=>{if(d.open)d.close();});}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();renderHUD(true);save(true);}
function updateSettings(){
  $('sound-button').textContent=`音效：${sound?'开':'关'}`;$('sound-button').setAttribute('aria-pressed',String(sound));
  $('motion-button').textContent=`轻动效：${reduced?'开':'关'}`;$('motion-button').setAttribute('aria-pressed',String(reduced));
  document.body.classList.toggle('reduce-motion',reduced);renderer.reduced=reduced;
}
function theme(color){const p=PALETTE[color];return `--c:${p.hex};--dark:${p.dark};--light:${p.light}`;}
function updateQueues(){
  const signature=state.queues.map(q=>q.map(c=>`${c.id}:${c.ammo}`).join(',')).join('|');
  const disabled=paused()||state.status!=='playing'||state.slots.every(Boolean);
  let focusColumn=null;
  if(signature!==lastQueues){
    focusColumn=document.activeElement?.dataset?.column??null;
    lastQueues=signature;
    $('queue-buttons').innerHTML=state.queues.map((q,col)=>{
      const color=q[0]?.color||Object.keys(PALETTE)[col],p=PALETTE[color],head=q[0];
      return `<button class="queue-button ${head?'':'empty'}" data-column="${col}" style="${theme(color)}" aria-label="${head?`${p.name}炮手，${head.ammo}发，待命${q.length}个。按${col+1}上阵`:`${p.name}炮手已用完`}" ${head?'':'disabled'}><span class="queue-tail" style="--i:2" aria-hidden="true"></span><span class="queue-tail" style="--i:1" aria-hidden="true"></span><span class="queue-tail" style="--i:0" aria-hidden="true"></span><span class="queue-art">${head?cannonSVG(color,head.ammo):'<span class="queue-finished">✓</span>'}</span><span class="queue-label"><span class="color-label">${p.symbol} ${p.name}</span><span class="queue-count">${head?`×${q.length}`:'完成'}</span></span><span class="key-cap" aria-hidden="true">${col+1}</span></button>`;
    }).join('');
  }
  $('queue-buttons').querySelectorAll('button').forEach((b,i)=>b.disabled=disabled||!state.queues[i].length);
  if(focusColumn!==null){const replacement=$('queue-buttons').querySelector(`[data-column="${focusColumn}"]`);if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});else ($('queue-buttons').querySelector('button:not(:disabled)')||$('menu-button')).focus({preventScroll:true});}
}
function renderHUD(force=false){
  const active=state.slots.filter(Boolean).length,visible=exposedTargets(state);
  const signature=state.slots.map(c=>c?`${c.id}:${c.ammo}`:'_').join('|');
  if(signature!==lastUI||force){
    lastUI=signature;
    const targets=new Set(visible.map(v=>v.color));
    $('active-slots').innerHTML=state.slots.map((c,i)=>c?`<div role="group" class="slot occupied ${targets.has(c.color)?'firing':'blocked'}" style="${theme(c.color)}" aria-label="${PALETTE[c.color].name}炮手，剩${c.ammo}发，${targets.has(c.color)?'射击中':'等待同色方块'}"><span class="cannon">${cannonSVG(c.color,c.ammo)}</span><span class="slot-state">${targets.has(c.color)?'射击中':'等待同色'}</span></div>`:`<div role="group" class="slot empty" aria-label="空闲炮位 ${i+1}"><span class="slot-number">${i+1}</span><span class="slot-state">空位</span></div>`).join('');
  }
  const level=LEVELS[state.levelIndex],pct=Math.round(state.hits/state.total*100);
  $('level-label').textContent=`${String(state.levelIndex+1).padStart(2,'0')} / ${String(LEVELS.length).padStart(2,'0')} · ${level.name}`;
  $('progress-label').textContent=`${pct}%`;$('progress-fill').style.width=`${pct}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow',String(pct));
  if($('remaining-label'))$('remaining-label').textContent=`剩余 ${state.total-state.hits} 块`;
  const surface=Object.keys(PALETTE).map(color=>{const count=visible.filter(v=>v.color===color).length;return count?`${PALETTE[color].name}${count}块`:null;}).filter(Boolean).join('、');
  $('game-canvas').setAttribute('aria-label',`${level.name}，立体方块雕塑，剩余${state.total-state.hits}块。当前外层可命中：${surface||'已清空'}。下方选择同色炮手自动射击。`);
  let hint='点下方炮手上阵，自动击碎同色方块';
  if(active===5)hint='炮位已满，等弹药用完就会空出位置';
  else if(state.hits>0)hint='留意外层颜色，给新颜色留一个空位';
  if(state.status==='won')hint='所有方块已清空，漂亮！';
  if(state.status==='lost')hint='炮位被堵住了，换个上阵顺序再试';
  if(userPaused)hint='游戏已暂停，进度已保留';
  $('hint').textContent=hint;
  const status=paused()?'已暂停':active?`上阵 ${active} / 5`:'选一位炮手开始';
  if(status!==lastStatus){$('status-label').textContent=status;lastStatus=status;}
  pauseCard.hidden=!userPaused||anyDialog();
  updateQueues();
}
function selectColumn(col){
  if(paused()||state.status!=='playing')return;
  soundInit();
  const result=deploy(state,col);
  if(result.ok){dirty=true;renderHUD(true);save(true);}
  else if(result.reason==='slots-full')toast('5 个炮位已经满了，等一个空位');
}
$('queue-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-column]');if(b)selectColumn(Number(b.dataset.column));});
$('menu-button').addEventListener('click',()=>openDialog('menu-dialog'));
$('close-menu').addEventListener('click',()=>{$('menu-dialog').close();renderHUD(true);});
$('resume-button').addEventListener('click',()=>{closeAll();userPaused=false;soundInit();renderHUD(true);});
$('continue-game').addEventListener('click',()=>{userPaused=false;soundInit();renderHUD(true);});
function askRestart(){
  $('confirm-title').textContent='重新开始这一关？';$('confirm-copy').textContent='这一关的消除进度会重置，已经解锁的关卡会保留。';$('confirm-ok').textContent='重新开始';
  confirmAction=()=>startLevel(state.levelIndex);openDialog('confirm-dialog');
}
$('restart-button').addEventListener('click',askRestart);
$('confirm-cancel').addEventListener('click',()=>{$('confirm-dialog').close();confirmAction=null;renderHUD(true);});
$('confirm-ok').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();});
$('sound-button').addEventListener('click',()=>{sound=!sound;soundInit();updateSettings();dirty=true;save(true);});
$('motion-button').addEventListener('click',()=>{reduced=!reduced;updateSettings();dirty=true;save(true);});
function renderLevels(){
  $('level-grid').innerHTML=LEVELS.map((l,i)=>`<button class="level-button ${i===state.levelIndex?'current':''} ${best[i]!==undefined?'completed':''}" data-level="${i}" ${i>=unlocked?'disabled':''} aria-label="第${i+1}关 ${l.name}${i>=unlocked?'，未解锁':best[i]!==undefined?'，已通关':''}"><span class="level-number">${i>=unlocked?'锁定':String(i+1).padStart(2,'0')}</span><span>${l.name}</span><span class="level-mark">${best[i]!==undefined?'✓':i===state.levelIndex?'进行中':''}</span></button>`).join('');
}
$('levels-button').addEventListener('click',()=>{renderLevels();openDialog('level-dialog');});
$('close-levels').addEventListener('click',()=>{$('level-dialog').close();renderHUD(true);});
$('level-grid').addEventListener('click',e=>{
  const b=e.target.closest('[data-level]');if(!b||b.disabled)return;const n=Number(b.dataset.level);
  if(n===state.levelIndex){closeAll();renderHUD(true);return;}
  if(state.hits>0&&state.status==='playing'){
    $('confirm-title').textContent='切换关卡？';$('confirm-copy').textContent='当前关卡的消除进度会重置，已经解锁的关卡会保留。';$('confirm-ok').textContent='切换关卡';confirmAction=()=>startLevel(n);openDialog('confirm-dialog');
  }else startLevel(n);
});
function startLevel(index){
  if(index<0||index>=LEVELS.length||index>=unlocked)return;
  closeAll();state=createGame(index);userPaused=false;resultShown=false;lastQueues='';lastUI='';
  renderer.setState(state,LEVELS[index]);dirty=true;renderHUD(true);save(true);
}
function showResult(){
  if(resultShown)return;resultShown=true;
  const won=state.status==='won',final=won&&state.levelIndex===LEVELS.length-1;
  if(won){unlocked=Math.min(LEVELS.length,Math.max(unlocked,state.levelIndex+2));best[state.levelIndex]=Math.min(best[state.levelIndex]??Infinity,Math.round(state.elapsed));}
  $('result-eyebrow').textContent=won?(final?'ALL CLEAR · 全部通关':'LEVEL CLEAR · 清空成功'):'TRY AGAIN · 再来一次';
  $('result-title').textContent=won?(final?'12 座方块岛，全部清空！':'这一关，清得漂亮！'):'炮位有点挤';
  $('result-copy').textContent=won?`你用 ${state.shotCount} 发弹药清空了 ${state.total} 块方块。${final?'全部关卡已完成，可以回到第一关挑战新的上阵顺序。':'下一座雕塑已经解锁。'}`:'5 个炮位都在等待被挡住的颜色。先选能打到外层的炮手，给新颜色留一个空位。';
  $('next-button').hidden=!won;$('next-button').textContent=final?'从第一关再玩':'下一关';$('retry-button').textContent=won?'重玩这一关':'重新挑战';
  dirty=true;save(true);openDialog('result-dialog');
}
$('next-button').addEventListener('click',()=>startLevel(state.levelIndex===LEVELS.length-1?0:state.levelIndex+1));
$('retry-button').addEventListener('click',()=>startLevel(state.levelIndex));
for(const d of dialogs){
  d.addEventListener('close',()=>{if(d.id==='result-dialog'&&state.status!=='playing')resultShown=false;renderHUD(true);});
  d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(d.id!=='result-dialog')d.close();}});
}
$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(anyDialog())return;
  if(/^[1-4]$/.test(e.key)){e.preventDefault();selectColumn(Number(e.key)-1);}
  if(e.code==='Space'&&!e.target.closest?.('button,a,summary,[role=button]')){e.preventDefault();if(state.status==='playing'){userPaused=!userPaused;renderHUD(true);save(true);}}
  if(e.key==='Escape'){e.preventDefault();openDialog('menu-dialog');}
  if(e.key.toLowerCase()==='r'){e.preventDefault();askRestart();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save(true);if(state.status==='playing'&&state.slots.some(Boolean))userPaused=true;}lastFrame=0;renderHUD(true);});
window.addEventListener('pagehide',()=>save(true));
window.addEventListener('beforeunload',()=>save(true));
updateSettings();renderHUD(true);
if(toastUntil===-1)toast('旧进度无法读取，已为你开启新的一关');
function frame(now){
  const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
  if(!paused()&&state.status==='playing'){
    const events=tick(state,dt);
    if(events.length){renderer.events(events);dirty=true;const shot=events.find(e=>e.type==='shot');if(shot)ping(shot.color);}
  }
  renderer.render(paused()?0:dt);
  if(now-lastHUD>90){renderHUD();lastHUD=now;}
  if(state.status!=='playing'&&!resultShown&&!anyDialog())showResult();
  if(dirty&&now-lastSave>1800)save();
  if(toastUntil>0&&now>toastUntil){$('toast').classList.remove('show');toastUntil=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// A local, explicit test route. It is inert in the normal game and never contacts a service.
if(qaMode){window.cubeSalvoQA={get state(){return state;},get unlocked(){return unlocked;},get paused(){return paused();},get renderer(){return renderer;},createGame,deploy,tick,restore,serialize,LEVELS,exposedTargets,
  load(s){closeAll();state=s;unlocked=12;userPaused=false;resultShown=false;lastQueues='';renderer.setState(state,LEVELS[state.levelIndex]);renderHUD(true);},
  render(){renderHUD(true);renderer.render(0);},setPaused(value){userPaused=value;renderHUD(true);},startLevel,
  checkGeometry(){const items=['game-canvas','menu-button','queue-buttons','active-slots','hint','controls'];return Object.fromEntries(items.map(id=>{const r=$(id).getBoundingClientRect();return[id,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}]}));}};}
