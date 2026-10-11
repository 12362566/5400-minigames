// A focused source-level CSS cascade regression, NOT a browser layout renderer.
// Optional stylesheet argument allows testing the actual previous release:
// node tests/mobile-layout.mjs /tmp/spin-guardians-9031a45.css
import assert from 'node:assert/strict';
import fs from 'node:fs';
const stylesheet=process.argv[2]||new URL('../style.css',import.meta.url);
const css=fs.readFileSync(stylesheet,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');

// Parse balanced blocks (including quoted strings), retaining source order.
function blocks(source){
 const result=[];let start=0;
 while(start<source.length){
  const open=source.indexOf('{',start);if(open<0)break;
  let depth=1,end=open+1,quote='';
  for(;end<source.length&&depth;end++){
   const c=source[end];
   if(quote){if(c==='\\')end++;else if(c===quote)quote='';continue;}
   if(c==='"'||c==="'")quote=c;else if(c==='{')depth++;else if(c==='}')depth--;
  }
  assert.equal(depth,0,'CSS braces must balance');
  result.push({head:source.slice(start,open).trim(),body:source.slice(open+1,end-1)});start=end;
 }
 return result;
}
function mediaMatches(query,width,height){
 return query.split(',').some(branch=>{
  let remaining=branch.replace(/^@media\s*/,'').trim(),matches=true;
  remaining=remaining.replace(/\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)/g,(_,bound,axis,n)=>{
   const value=axis==='width'?width:height;matches&&=bound==='min'?value>=+n:value<=+n;return '';
  }).replace(/\band\b|\bonly\b|\bscreen\b|\ball\b/g,'').trim();
  assert.equal(remaining,'',`Unsupported media condition in this focused regression: ${query}`);
  return matches;
 });
}
function activeRules(source,width,height){
 const result=[];
 for(const {head,body}of blocks(source)){
  if(head.startsWith('@media')){if(mediaMatches(head,width,height))result.push(...activeRules(body,width,height));}
  else if(!head.startsWith('@'))result.push({selectors:head.split(',').map(s=>s.trim()),body});
 }
 return result;
}
function cascade(selector,width,height){
 const values={},priorities={};let order=0;
 for(const rule of activeRules(css,width,height)){
  order++;
  // Our audited layout properties are declared directly on simple class selectors
  // or *. Fail closed if a new shorthand could invalidate the explicit properties.
  const matched=rule.selectors.filter(s=>s===selector||s==='*'||(selector==='.hero-card.selected'&&s==='.hero-card'));if(!matched.length)continue;
  const specificity=Math.max(...matched.map(s=>(s.match(/\./g)||[]).length*10));
  for(const declaration of rule.body.split(';')){
   const colon=declaration.indexOf(':');if(colon<0)continue;
   const name=declaration.slice(0,colon).trim();let value=declaration.slice(colon+1).trim();
   assert.ok(!['grid','grid-template','place-items','place-self','all'].includes(name),`Extend regression for CSS shorthand ${name}`);
   const important=/!important\s*$/.test(value);value=value.replace(/!important\s*$/,'').trim();
   const priority=(important?1000000:0)+specificity*1000+order;
   if(priority>=(priorities[name]??-1)){values[name]=value;priorities[name]=priority;}
  }
 }
 return values;
}
const failures=[];
function check(label,fn){try{fn();}catch(error){failures.push(`${label}: ${error.message}`);}}
const mobile=[[320,568],[390,844],[410,810],[430,932],[760,1000]];
for(const[w,h]of mobile){
 const layout=cascade('.game-layout',w,h),battle=cascade('.battle-column',w,h),command=cascade('.command-column',w,h),board=cascade('.board-wrap',w,h);
 check(`${w}×${h} mobile grid`,()=>{
  assert.equal(layout.display,'grid');
  assert.equal(layout['grid-template-columns'],'minmax(0,1fr)','desktop columns must not survive mobile cascade');
  assert.equal(layout['grid-template-rows'],'minmax(0,1fr) auto');
  assert.equal(layout['align-items'],'stretch','battlefield must fill its allocated row');
 });
 check(`${w}×${h} explicit child placement`,()=>{
  assert.equal(battle['grid-column'],'1');assert.equal(battle['grid-row'],'1');
  assert.equal(command['grid-column'],'1');assert.equal(command['grid-row'],'2');
  for(const item of[battle,command]){assert.equal(item['align-self'],'stretch');assert.equal(item['min-width'],'0');}
  assert.equal(battle['min-height'],'0');assert.equal(board['min-height'],'0');assert.equal(board.flex,'1');
 });
 check(`${w}×${h} hero card shared label/price row`,()=>{
  const card=cascade('.hero-card',w,h),selected=cascade('.hero-card.selected',w,h);
  const portrait=cascade('.hero-card .hero-portrait',w,h),name=cascade('.hero-card .hero-name',w,h),cost=cascade('.hero-card .cost',w,h);
  assert.equal(card.display,'grid','cards must not wrap the floated cost beneath the label');
  assert.equal(card['grid-template-columns'],'minmax(0,1fr) auto');
  assert.equal(card['grid-template-rows'],'1fr 16px');assert.equal(card['column-gap'],'1px');
  assert.equal(card.padding,'5px 4px');assert.equal(selected.padding,'4px 3px');
  assert.equal(card.height,h<=650?'61px':'67px','fixed cockpit card height must remain stable');
  assert.equal(selected.height,card.height);assert.equal(selected.display,'grid');
  assert.equal(portrait['grid-column'],'1/-1');assert.equal(portrait['grid-row'],'1');
  assert.equal(name['grid-column'],'1');assert.equal(name['grid-row'],'2');assert.equal(name['white-space'],'nowrap');assert.equal(name['min-width'],'0');
  assert.equal(cost['grid-column'],'2');assert.equal(cost['grid-row'],'2');assert.equal(cost.float,'none');assert.equal(cost['justify-self'],'end');assert.equal(cost['white-space'],'nowrap');
 });
 console.log(`${w}×${h} cascade: columns=${layout['grid-template-columns']}; align=${layout['align-items']}; child rows=${battle['grid-row']||'auto'}/${command['grid-row']||'auto'}`);
}
for(const[w,h,columns]of[[761,1000,'minmax(0,530px) minmax(270px,1fr)'],[1280,900,'490px 1fr']])check(`${w}px desktop preserved`,()=>{
 const layout=cascade('.game-layout',w,h);assert.equal(layout['grid-template-columns'],columns);assert.equal(layout.display,'grid');
});
check('safe-area declarations',()=>{
 assert.match(css,/padding-top:env\(safe-area-inset-top,0px\)/);
 assert.match(css,/height:calc\(100dvh - var\(--cockpit-header\) - env\(safe-area-inset-top,0px\)\)/);
 assert.match(css,/max\(7px,env\(safe-area-inset-bottom\)\)/);
});
// Arithmetic is secondary to the actual cascade assertions above. These budgets
// are explicit UI assumptions, not measured browser geometry or touch-target QA.
function dimensions(width,height,top=0,bottom=0){
 const short=height<=650,header=short?44:52,padTop=short?4:8,padBottom=Math.max(7,bottom),gap=short?5:9;
 const command=short?157:193,battleOther=short?91:113;
 const boardHeight=height-top-header-padTop-padBottom-gap-command-battleOther;
 const canvasWidth=Math.min(width-24,boardHeight*9/11);
 return {boardHeight,canvasWidth,canvasHeight:canvasWidth*11/9,total:top+header+padTop+padBottom+gap+command+battleOther+boardHeight};
}
for(const[w,h]of mobile.slice(0,4))for(const[top,bottom]of[[0,0],[44,34]])check(`${w}×${h} safe-area ${top}/${bottom}`,()=>{
 const d=dimensions(w,h,top,bottom);assert.equal(d.total,h);assert.ok(d.boardHeight>=180);assert.ok(d.canvasWidth<=w-24);assert.ok(Math.abs(d.canvasWidth/d.canvasHeight-9/11)<1e-9);
});
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('CSS cascade regression and secondary safe-area arithmetic passed. No browser pixels or real touch behavior were tested.');
