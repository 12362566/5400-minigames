// Static CSS arithmetic checks, not a rendered-browser or touch test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
assert.match(css,/padding-top:env\(safe-area-inset-top,0px\)/);
assert.match(css,/height:calc\(100dvh - var\(--cockpit-header\) - env\(safe-area-inset-top,0px\)\)/);
assert.match(css,/max\(7px,env\(safe-area-inset-bottom\)\)/);
function dimensions(width,height,top=0,bottom=0){
 const short=height<=650,header=short?44:52,padTop=short?4:8,padBottom=Math.max(7,bottom),gap=short?5:9;
 const command=short?157:193,battleOther=short?91:113;
 const boardHeight=height-top-header-padTop-padBottom-gap-command-battleOther;
 const canvasWidth=Math.min(width-24,boardHeight*9/11);
 return {boardHeight,canvasWidth,canvasHeight:canvasWidth*11/9,total:top+header+padTop+padBottom+gap+command+battleOther+boardHeight};
}
for(const [w,h] of [[320,568],[390,844],[430,932]])for(const [top,bottom] of [[0,0],[44,34]]){
 const d=dimensions(w,h,top,bottom);assert.equal(d.total,h);assert.ok(d.boardHeight>=180);assert.ok(d.canvasWidth<=w-24);assert.ok(Math.abs(d.canvasWidth/d.canvasHeight-9/11)<1e-9);console.log(`${w}×${h}, safe ${top}/${bottom}: canvas ${Math.round(d.canvasWidth)}×${Math.round(d.canvasHeight)}, cockpit total ${d.total}`);
}
console.log('Static notch/home-indicator layout arithmetic passed; real browser layout remains unverified.');
