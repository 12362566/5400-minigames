import assert from 'node:assert/strict';
import fs from 'node:fs';
const elements=new Map();
class Element {
 constructor(id='',dataset={}){this.id=id;this.dataset=dataset;this.style={};this.hidden=false;this.open=false;this.disabled=false;this.listeners={};this.classList={add(){},remove(){},toggle(){}};this.tagName='DIV';this.children=[];this._html='';}
 set innerHTML(html){this._html=html;this.children=[];for(const m of html.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=m[2],id=attrs.match(/\bid="([^"]+)"/)?.[1]||'',dataset={};for(const d of attrs.matchAll(/data-([a-z]+)="([^"]*)"/g))dataset[d[1]]=d[2];if(/data-close\b/.test(attrs))dataset.close='';if(id||Object.keys(dataset).length){const child=new Element(id,dataset);child.tagName=m[1].toUpperCase();this.children.push(child);if(id)elements.set(id,child)}}}
 get innerHTML(){return this._html}
 querySelectorAll(selector){const key=selector.match(/\[data-([a-z]+)\]/)?.[1];return key?this.children.filter(e=>key in e.dataset):[]}
 setAttribute(){} addEventListener(name,fn){this.listeners[name]=fn} getBoundingClientRect(){return {left:0,top:0,width:360,height:440}} showModal(){this.open=true}close(){this.open=false}
}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const id of html.matchAll(/id="([^"]+)"/g))elements.set(id[1],new Element(id[1]));
let draws=0;const ctx=new Proxy({setTransform(){draws++}}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});elements.get('board').getContext=()=>ctx;
const storage=new Map([['woodland-seen','1']]);globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
globalThis.document={getElementById:id=>elements.get(id),querySelectorAll:selector=>[...elements.values()].flatMap(e=>e.querySelectorAll(selector)),addEventListener(){},activeElement:{tagName:'BODY'}};
globalThis.window={addEventListener(){}};globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;let frame;globalThis.requestAnimationFrame=fn=>{frame=fn};
await import('../app.js');const get=id=>elements.get(id),game=window.__game();
assert.equal(game.state.phase,'build');assert.equal(get('startBtn').disabled,true);
const cards=document.querySelectorAll('[data-type]');assert.equal(cards.length,4);cards[0].onclick();assert.match(get('contextPanel').innerHTML,/部署预览/);
get('board').listeners.pointerdown({clientX:2.5/9*360,clientY:2.5/11*440});get('board').listeners.pointerup({clientX:2.5/9*360,clientY:2.5/11*440});assert.equal(game.state.heroes.length,1);assert.equal(game.state.gold,130);assert.equal(get('startBtn').disabled,false);
cards[0].onclick();get('board').listeners.pointerdown({clientX:100,clientY:100});get('board').listeners.pointerup({clientX:100,clientY:145});assert.equal(game.state.heroes.length,1,'swipe must not deploy');get('board').listeners.pointerdown({clientX:100,clientY:100});get('board').listeners.pointercancel();get('board').listeners.pointerup({clientX:100,clientY:100});assert.equal(game.state.heroes.length,1,'cancel must not deploy');
get('clearBtn').onclick();assert.equal(game.buy('blade',6,4),true);window.__ui.refresh(true);
get('board').listeners.pointerdown({clientX:2.5/9*360,clientY:2.5/11*440});get('board').listeners.pointerup({clientX:2.5/9*360,clientY:2.5/11*440});assert.equal(get('mergeBtn').hidden,false);assert.match(get('boardHint').textContent,/1 位可合成/);
get('mergeBtn').onclick();assert.match(get('modalContent').innerHTML,/14 → 23/);assert.match(get('modalContent').innerHTML,/保留的位置/);get('modalContent').querySelectorAll('[data-merge]')[0].onclick();assert.equal(game.state.heroes.length,1);assert.equal(game.state.heroes[0].level,2);assert.equal(game.state.heroes[0].x,6);assert.equal(game.state.gold,80);assert.equal(get('mergeBtn').hidden,true);
get('waveLabel').onclick();assert.match(get('modalContent').innerHTML,/16 位初始来敌/);assert.match(get('modalContent').innerHTML,/疾跑者/);get('modalContent').querySelectorAll('[data-close]')[0].onclick();assert.equal(get('modal').open,false);
get('startBtn').onclick();assert.equal(game.state.phase,'battle');const battleSave=game.serialize();frame(16);const firstDraws=draws;frame(32);assert.equal(draws,firstDraws,'30fps cap must skip unnecessary render');assert.match(get('waveLabel').textContent,/1 \/ 8/);
get('pauseBtn').onclick();assert.equal(get('pauseVeil').hidden,false);get('resumeBtn').onclick();assert.equal(get('pauseVeil').hidden,true);
get('helpBtn').onclick();assert.equal(get('modal').open,true);assert.match(get('modalContent').innerHTML,/同种同级/);get('tutorialDone').onclick();assert.equal(get('modal').open,false);
get('settingsBtn').onclick();get('soundToggle').onclick();get('motionToggle').onclick();assert.ok(storage.has('woodland-guardians-prefs'));get('restartBtn').onclick();assert.match(get('modalContent').innerHTML,/无法撤销/);
get('confirmRestart').onclick();assert.ok(get('classicMode'));get('classicMode').onclick();assert.equal(window.__game().state.mode,'classic');assert.equal(window.__game().state.wave,0);
const s=window.__game().state;s.phase='reward';s.choices=['sharp','haste','reach'];frame(64);assert.match(get('modalContent').innerHTML,/磨刀石/);get('modalContent').querySelectorAll('[data-choice]')[0].onclick();assert.ok(s.relics.includes('sharp'));assert.equal(get('modal').open,false);
s.phase='route';s.choices=['0','1','2'];frame(80);assert.match(get('modalContent').innerHTML,/琥珀矿道/);get('modalContent').querySelectorAll('[data-route]')[1].onclick();assert.equal(s.mapIndex,1);
s.phase='won';s.wave=8;frame(96);assert.match(get('modalContent').innerHTML,/守住了/);get('reviewBtn').onclick();assert.equal(get('modal').open,false);frame(112);assert.equal(get('modal').open,false);
window.innerWidth=390;get('boardWrap').clientWidth=366;get('boardWrap').clientHeight=474;window.__ui.draw();assert.equal(get('board').style.width,'366px');assert.equal(get('board').style.height,(366*11/9)+'px');window.innerWidth=320;get('boardWrap').clientWidth=296;get('boardWrap').clientHeight=274;window.__ui.draw();assert.equal(Number.parseFloat(get('board').style.height),274);
const beforeHidden=s.time,hiddenDraws=draws;document.hidden=true;frame(250);assert.equal(s.time,beforeHidden);assert.equal(draws,hiddenDraws);document.hidden=false;
window.__ui.save();assert.ok(storage.has('woodland-guardians-v1'));storage.set('woodland-guardians-v1',JSON.stringify(battleSave));await import('../app.js?restore-check=1');assert.equal(window.__game().state.phase,'battle');assert.equal(get('pauseVeil').hidden,false,'restored battle must wait for explicit resume');
console.log('UI smoke passed: shop, placement, swipe guards, merge upgrade/destination preview, wave scouting, 30fps cap/offscreen suspension, start, pause, tutorial, settings, restart safeguards, modes, rewards/routes, endings, save and proportional canvas. This is mocked DOM/canvas, not real browser layout QA.');
