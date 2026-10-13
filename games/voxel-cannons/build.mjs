import fs from 'node:fs';
import path from 'node:path';
const modules=['levels','engine','renderer','app'];
let output='/* Cube Salvo · original offline browser game · generated from src/ by node build.mjs */\n(()=>{\n\"use strict\";\n';
for(const name of modules){
  let source=fs.readFileSync(new URL(`./src/${name}.js`,import.meta.url),'utf8');
  const exports=[];
  source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)\.js['"];?\s*$/gm,(_,bindings,dep)=>`const {${bindings}} = __${dep};`);
  source=source.replace(/export\s*\{([^}]+)\};?/g,(_,bindings)=>{exports.push(...bindings.split(',').map(x=>x.trim()).filter(Boolean));return '';});
  source=source.replace(/export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/g,(_,kind,id)=>{exports.push(id);return `${kind} ${id}`;});
  if(/\b(?:import|export)\s+(?:\{|\*|default|const|function)/.test(source))throw new Error(`Unsupported module syntax in ${name}`);
  output+=`const __${name}=(()=>{\n${source}\nreturn {${[...new Set(exports)].join(',')}};\n})();\n`;
}
output+='})();\n';
fs.writeFileSync(new URL('./game.js',import.meta.url),output);
console.log(`Built game.js (${Buffer.byteLength(output)} bytes), no network dependencies.`);
