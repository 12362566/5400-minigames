import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Culling/ray.js';

export const PALETTE = {
 green:{name:'青柠',hex:'#48ba30',light:'#9fe768',dark:'#287a26',symbol:'◆'},
 pink:{name:'莓果',hex:'#f26398',light:'#ffa8c6',dark:'#bd386a',symbol:'♥'},
 cyan:{name:'晴空',hex:'#25beda',light:'#87e8ef',dark:'#16899f',symbol:'●'},
 ink:{name:'墨蓝',hex:'#303944',light:'#718194',dark:'#1c242f',symbol:'✦'}
};
export function cannonSVG(color, ammo, options={}){
  const p=PALETTE[color]||PALETTE.green;
  return `<svg viewBox="0 0 80 76" aria-hidden="true" focusable="false"><ellipse cx="40" cy="66" rx="29" ry="6" fill="#243244" opacity=".13"/><path d="M15 50Q13 43 21 42H59Q67 43 65 50L62 61Q59 67 52 67H27Q20 66 18 61Z" fill="${p.dark}"/><path d="M17 44Q17 38 24 37H56Q64 39 64 45L61 57Q59 62 52 62H28Q21 62 19 56Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.4"/><path d="M23 40Q27 36 40 36Q56 36 59 41L55 48H27Z" fill="${p.light}"/><rect x="30" y="5" width="21" height="31" rx="8" fill="${p.dark}"/><rect x="33" y="4" width="17" height="30" rx="7" fill="${p.hex}"/><ellipse cx="41.5" cy="7" rx="8.5" ry="4.5" fill="${p.light}"/><ellipse cx="41.5" cy="7" rx="5.7" ry="2.7" fill="${p.dark}"/><path d="M24 33Q24 22 40 22Q56 22 57 34L55 44Q52 50 40 50Q28 50 25 44Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.3"/><path d="M29 28Q38 22 49 27" fill="none" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/><text x="40" y="41" text-anchor="middle" font-family="ui-rounded,system-ui,sans-serif" font-size="16" font-weight="900" fill="white" stroke="${p.dark}" stroke-width="3" paint-order="stroke">${ammo}</text><path d="M24 54H30M50 54H56" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/></svg>`;
}

const DEG=Math.PI/180;
export const CAMERA_CALIBRATION=Object.freeze({yaw:14,elevation:46,projection:'orthographic'});
const Y=Vector3.Up();
function roundedCube(scene,name){
 const mesh=new Mesh(name,scene),positions=[],normals=[],indices=[];
 const r=.065,inner=.5-r,grid=[-.5,-inner,0,inner,.5];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const u=(axis+1)%3,v=(axis+2)%3,start=positions.length/3;
  for(const b of grid)for(const a of grid){const p=[0,0,0];p[axis]=sign*.5;p[u]=a;p[v]=b;const q=p.map(n=>Math.max(-inner,Math.min(inner,n))),n=p.map((n,i)=>n-q[i]),len=Math.hypot(...n);for(let i=0;i<3;i++){normals.push(n[i]/len);positions.push(q[i]+n[i]/len*r);}}
  for(let j=0;j<4;j++)for(let i=0;i<4;i++){const a=start+j*5+i,b=a+1,c=a+5,d=c+1;indices.push(...(sign===1?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 }
 const data=new VertexData();data.positions=positions;data.normals=normals;data.indices=indices;data.applyToMesh(mesh);return mesh;
}
export class VoxelRenderer {
 constructor(canvas,{forceUnavailable=false}={}){
  this.canvas=canvas;this.calibration=CAMERA_CALIBRATION;this.state=null;this.available=false;this.blocked=false;this.ready=false;this.reduced=false;this.bullets=[];this.particles=[];this.time=0;this.cannons=new Map();this.voxelGroups=new Map();this.frame=0;this.stats={};
  this.message=document.createElement('div');this.message.id='webgl-message';this.message.hidden=true;this.message.setAttribute('role','alert');canvas.parentElement.append(this.message);
  try{
   if(forceUnavailable||!Engine.isSupported())throw Error('WebGL is unavailable');
   this.engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:false},false);
   this.engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio||1,1.5));
   this.scene=new Scene(this.engine);this.scene.clearColor=Color4.FromHexString('#f7a660ff');this.scene.ambientColor=new Color3(.24,.24,.24);
   this.camera=new ArcRotateCamera('fixed-reference-camera',(-90-CAMERA_CALIBRATION.yaw)*DEG,(90-CAMERA_CALIBRATION.elevation)*DEG,100,Vector3.Zero(),this.scene);
   this.camera.mode=Camera.ORTHOGRAPHIC_CAMERA;this.camera.minZ=.1;this.camera.maxZ=220;this.camera.inputs.clear();
   // StandardMaterial sums diffuse lights before clamping: keep total energy <= 1.
   const fill=new HemisphericLight('soft-sky',new Vector3(0,1,0),this.scene);fill.intensity=.65;fill.groundColor=new Color3(.38,.29,.26);
   const key=new DirectionalLight('sun',new Vector3(.4,-1,.65),this.scene);key.position=new Vector3(-25,40,-30);key.intensity=.35;
   this.shadow=new ShadowGenerator(1024,key);this.shadow.usePercentageCloserFiltering=true;this.shadow.filteringQuality=ShadowGenerator.QUALITY_LOW;this.shadow.bias=.003;this.shadow.normalBias=.02;this.shadow.darkness=.22;
   this.materials={};for(const [color,p]of Object.entries(PALETTE))this.materials[color]=this.material(color,p.hex,.22);
   this.groundMat=this.material('apricot-floor','#f8a459',.03);this.padMat=this.material('empty-slot','#ffe8c9',.1);this.plinthMat=this.material('violet-rim','#b940c1',.12);this.muzzleMat=this.material('muzzle','#19252b',.04);this.whiteMat=this.material('projectile','#fff8d8',.05);this.whiteMat.emissiveColor=new Color3(.6,.48,.28);
   this.cubeTemplate=roundedCube(this.scene,'rounded-cube-template');this.cubeTemplate.setEnabled(false);
   this.sphereTemplate=MeshBuilder.CreateSphere('sphere-template',{diameter:.26,segments:6},this.scene);this.sphereTemplate.material=this.whiteMat;this.sphereTemplate.setEnabled(false);
   this.ground=MeshBuilder.CreateGround('floor',{width:300,height:300},this.scene);this.ground.material=this.groundMat;this.ground.receiveShadows=true;this.ground.isPickable=false;
   this.available=true;canvas.dataset.engine='Babylon.js 9.30.0';canvas.dataset.webgl=String(this.engine.webGLVersion);
   this.engine.onContextLostObservable.add(()=>{this.blocked=true;this.notice('3D 画面暂时中断','进度已暂停。恢复后点“继续游戏”，也可以刷新页面。');this.onContextChange?.(true);});
   this.engine.onContextRestoredObservable.add(()=>{this.blocked=false;this.message.hidden=true;this.onContextChange?.(false);});
   this.scene.onPointerDown=(_event,pick)=>{const col=pick.pickedMesh?.metadata?.column;if(Number.isInteger(col))this.onSelectColumn?.(col);};
   this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  }catch(error){this.blocked=true;this.error=String(error);canvas.dataset.engine='unavailable';this.notice('需要启用 3D 图形','当前浏览器无法启动 WebGL。请开启硬件加速，或换用支持 WebGL 的浏览器。已保存的进度不会被删除。');}
 }
 material(name,hex,specular=.15){const m=new StandardMaterial(name,this.scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=new Color3(specular,specular,specular);m.specularPower=48;return m;}
 notice(title,copy){this.message.replaceChildren();const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=title;span.textContent=copy;this.message.append(strong,span);this.message.hidden=false;}
 world(v){return new Vector3(v.x-this.level.width/2+.5,v.y+.8,v.z+.5);}
 setState(state,level){
  this.state=state;this.level=level;if(!this.available)return;
  for(const g of this.voxelGroups.values())g.mesh.dispose();this.voxelGroups.clear();
  for(const c of this.cannons.values())this.disposeCannon(c);this.cannons.clear();
  for(const b of this.bullets){b.mesh.dispose();b.trail.dispose();}for(const p of this.particles)p.mesh.dispose();this.bullets=[];this.particles=[];
  for(const color of Object.keys(PALETTE)){
   const list=state.voxels.filter(v=>v.alive&&v.color===color),buffer=new Float32Array(Math.max(1,list.length)*16),mesh=this.cubeTemplate.clone('voxels-'+color);
   // Thin-instance matrix attributes belong to Geometry. Clones must not share
   // that geometry or the last color overwrites every batch's GPU bindings.
   mesh.makeGeometryUnique();mesh.setEnabled(list.length>0);mesh.material=this.materials[color];mesh.isPickable=false;mesh.receiveShadows=true;
   const ids=list.map(v=>v.id),index=new Map(ids.map((id,i)=>[id,i]));list.forEach((v,i)=>Matrix.Translation(...this.world(v).asArray()).copyToArray(buffer,i*16));
   mesh.thinInstanceSetBuffer('matrix',buffer,16,false);mesh.thinInstanceCount=list.length;mesh.thinInstanceRefreshBoundingInfo();this.shadow.addShadowCaster(mesh);this.voxelGroups.set(color,{mesh,buffer,ids,index,count:list.length});
  }
  this.plinth?.dispose();this.plinth=MeshBuilder.CreateBox('sculpture-rim',{width:level.width+.5,height:.24,depth:level.depth+.5},this.scene);this.plinth.position.set(0,.14,level.depth/2);this.plinth.material=this.plinthMat;this.plinth.receiveShadows=true;this.plinth.isPickable=false;
  this.pads?.forEach(p=>p.dispose());this.pads=Array.from({length:5},(_,i)=>{const p=MeshBuilder.CreateCylinder('active-pad-'+i,{diameter:1.55,height:.09,tessellation:24},this.scene);p.position.copyFrom(this.slotPosition(i));p.position.y=.08;p.material=this.padMat;p.isPickable=false;return p;});
  this.syncCannons();this.layout();this.ready=false;this.scene.executeWhenReady(()=>{this.ready=true;this.canvas.dataset.ready='true';});
 }
 setCameraPreset(name){this.calibration=name==='side'?{yaw:32,elevation:32,projection:'orthographic'}:CAMERA_CALIBRATION;if(!this.available)return;this.camera.alpha=(-90-this.calibration.yaw)*DEG;this.camera.beta=(90-this.calibration.elevation)*DEG;this.layout();}
 slotPosition(i){return new Vector3((i-2)*1.9,.15,-2.3);}
 queuePosition(col,row){return new Vector3((col-1.5)*1.9,.15,-4.8-row*1.7);}
 resize(){if(!this.available)return;const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;this.width=r.width;this.height=r.height;this.engine.resize();this.layout();}
 layout(){
  if(!this.level||!this.available)return;const {width:w,height:h,depth:d}=this.level,yaw=this.calibration.yaw*DEG,elev=this.calibration.elevation*DEG;
  const sx=p=>Math.cos(yaw)*p.x-Math.sin(yaw)*p.z,sy=p=>-Math.sin(elev)*(Math.sin(yaw)*p.x+Math.cos(yaw)*p.z)-Math.cos(elev)*p.y;
  const points=[];for(const x of [-w/2-.5,w/2+.5])for(const y of [0,h+.4])for(const z of [0,d+.3])points.push(new Vector3(x,y,z));for(const x of [-4.6,4.6])points.push(new Vector3(x,0,-10.5));
  const xs=points.map(sx),ys=points.map(sy),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const aspect=(this.width||1)/(this.height||1),half=Math.max((maxY-minY)/2,(maxX-minX)/2/aspect)*1.025;
  this.camera.target.set(cx*Math.cos(yaw),-cy/Math.cos(elev),-cx*Math.sin(yaw));this.camera.orthoLeft=-half*aspect;this.camera.orthoRight=half*aspect;this.camera.orthoTop=half;this.camera.orthoBottom=-half;
  this.camera.getViewMatrix(true);this.camera.getProjectionMatrix(true);this.stats.camera={...this.calibration,halfHeight:half};
 }
 createCannon(c,pos,column=null){
  const root=new TransformNode('cannon-'+c.id,this.scene);root.position.copyFrom(pos);const material=this.materials[c.color],parts=[];
  const body=this.cubeTemplate.clone('cannon-base');body.setEnabled(true);body.parent=root;body.scaling.set(1.28,.56,1.15);body.position.y=.3;body.material=material;parts.push(body);
  const turret=MeshBuilder.CreateSphere('turret',{diameter:1.16,segments:10},this.scene);turret.parent=root;turret.position.y=.7;turret.scaling.y=.76;turret.material=material;parts.push(turret);
  const barrel=MeshBuilder.CreateCylinder('barrel',{diameter:.46,height:1.2,tessellation:12},this.scene);barrel.parent=root;barrel.position.set(0,.92,.7);barrel.rotation.x=Math.PI/2;barrel.material=material;parts.push(barrel);
  const muzzle=MeshBuilder.CreateCylinder('bore',{diameter:.29,height:.015,tessellation:12},this.scene);muzzle.parent=root;muzzle.position.set(0,.92,1.31);muzzle.rotation.x=Math.PI/2;muzzle.material=this.muzzleMat;parts.push(muzzle);
  const label=MeshBuilder.CreatePlane('ammo-label',{width:1.05,height:.6},this.scene);label.parent=root;label.position.set(0,1.34,-.12);label.billboardMode=Mesh.BILLBOARDMODE_ALL;
  const texture=new DynamicTexture('ammo-text-'+c.id,{width:128,height:64},this.scene,false);texture.hasAlpha=true;const labelMat=new StandardMaterial('ammo-material-'+c.id,this.scene);labelMat.diffuseTexture=texture;labelMat.emissiveColor=Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;label.material=labelMat;label.isPickable=false;
  for(const p of parts){p.metadata=column===null?{}:{column};p.isPickable=column!==null;this.shadow.addShadowCaster(p);}
  const cannon={id:c.id,root,parts,barrel,muzzle,texture,labelMat,label,ammo:-1,position:pos.clone(),color:c.color,column};this.updateAmmo(cannon,c.ammo);return cannon;
 }
 updateAmmo(cannon,ammo){if(cannon.ammo===ammo)return;cannon.ammo=ammo;const ctx=cannon.texture.getContext();ctx.clearRect(0,0,128,64);ctx.font='900 46px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=6;ctx.strokeStyle=PALETTE[cannon.color].dark;ctx.strokeText(String(ammo),64,32);ctx.fillStyle='white';ctx.fillText(String(ammo),64,32);cannon.texture.update();}
 disposeCannon(c){c.texture.dispose();c.labelMat.dispose();c.root.dispose(false);}
 syncCannons(){
  const wanted=new Set();this.state.slots.forEach((c,i)=>{if(!c)return;const key='slot'+i;wanted.add(key);let item=this.cannons.get(key);if(item?.id!==c.id){if(item)this.disposeCannon(item);item=this.createCannon(c,this.slotPosition(i));this.cannons.set(key,item);}this.updateAmmo(item,c.ammo);});
  this.state.queues.forEach((q,col)=>q.slice(0,4).forEach((c,row)=>{const key='queue'+col+'-'+row;wanted.add(key);let item=this.cannons.get(key);if(item?.id!==c.id){if(item)this.disposeCannon(item);item=this.createCannon(c,this.queuePosition(col,row),row===0?col:null);this.cannons.set(key,item);}this.updateAmmo(item,c.ammo);}));
  for(const [key,c]of this.cannons)if(!wanted.has(key)){this.disposeCannon(c);this.cannons.delete(key);}
 }
 removeVoxel(v){const g=this.voxelGroups.get(v.color),i=g?.index.get(v.id);if(i===undefined)return;const last=--g.count,lastId=g.ids[last];if(i!==last){g.buffer.copyWithin(i*16,last*16,last*16+16);g.ids[i]=lastId;g.index.set(lastId,i);}g.ids.pop();g.index.delete(v.id);g.mesh.thinInstanceCount=g.count;g.mesh.thinInstanceBufferUpdated('matrix');if(!g.count)g.mesh.setEnabled(false);}
 events(events){if(!this.available)return;for(const e of events)if(e.type==='shot'){
  this.removeVoxel(e.target);const target=this.world(e.target);target.z-=.47;const c=this.cannons.get('slot'+e.slotIndex),start=(c?.position||this.slotPosition(e.slotIndex)).add(new Vector3(0,.92,1.3));
  if(c){const center=c.position.add(new Vector3(0,.92,.3));const aim=target.subtract(center).normalize();c.barrel.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Y,aim,new Quaternion());c.barrel.position.copyFrom(new Vector3(0,.92,.3).add(aim.scale(.6)));c.muzzle.rotationQuaternion=c.barrel.rotationQuaternion;c.muzzle.position.copyFrom(new Vector3(0,.92,.3).add(aim.scale(1.21)));start.copyFrom(c.position.add(c.muzzle.position));}
  const dir=target.subtract(start).normalize();const mesh=this.sphereTemplate.clone('shot');mesh.setEnabled(true);mesh.isPickable=false;mesh.position.copyFrom(start);const trail=MeshBuilder.CreateCylinder('shot-trail',{height:1,diameter:.09,tessellation:6},this.scene);trail.material=this.whiteMat;trail.isPickable=false;trail.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Y,dir,new Quaternion());this.bullets.push({mesh,trail,start,end:target,t:0,duration:.18+Vector3.Distance(start,target)/120,color:e.color});
 }this.syncCannons();}
 burst(pos,color){if(this.reduced)return;for(let i=0;i<4&&this.particles.length<100;i++){const mesh=this.cubeTemplate.clone('chip');mesh.setEnabled(true);mesh.scaling.setAll(.18);mesh.position.copyFrom(pos);mesh.material=this.materials[color];mesh.isPickable=false;this.particles.push({mesh,t:0,velocity:new Vector3(Math.sin(i*2.4+this.time)*3,2+i*.3,Math.cos(i*2.4)*3)});}}
 render(dt){
  if(!this.available||this.blocked||!this.state)return;this.time+=dt;this.frame++;if(this.frame%4===0)this.syncCannons();
  for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.t+=dt;const f=Math.min(1,b.t/b.duration);Vector3.LerpToRef(b.start,b.end,f,b.mesh.position);const tail=Vector3.Lerp(b.start,b.end,Math.max(0,f-.055));b.trail.position.copyFrom(Vector3.Center(tail,b.mesh.position));b.trail.scaling.y=Math.max(.01,Vector3.Distance(tail,b.mesh.position));if(f>=1){this.burst(b.end,b.color);b.mesh.dispose();b.trail.dispose();this.bullets.splice(i,1);}}
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.t+=dt;p.velocity.y-=dt*12;p.mesh.position.addInPlace(p.velocity.scale(dt));p.mesh.rotation.x+=dt*3;p.mesh.rotation.z+=dt*2;p.mesh.scaling.setAll(Math.max(0,.18*(1-p.t/.5)));if(p.t>.5){p.mesh.dispose();this.particles.splice(i,1);}}
  this.scene.render();if(this.frame%30===0){this.canvas.dataset.ready=String(this.ready);this.stats={...this.stats,engine:'Babylon.js 9.30.0',webgl:this.engine.webGLVersion,dpr:1/this.engine.getHardwareScalingLevel(),drawCalls:this.engine._drawCalls?.current??null,meshes:this.scene.meshes.length,activeMeshes:this.scene.getActiveMeshes().length,visibleVoxels:[...this.voxelGroups.values()].reduce((n,g)=>n+g.count,0),fps:Math.round(this.engine.getFps()),ready:this.ready};}
 }
 project(point){return Vector3.Project(point,Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(this.engine.getRenderWidth(),this.engine.getRenderHeight())).scale(this.engine.getHardwareScalingLevel());}
 pickQueue(column){const c=this.cannons.get('queue'+column+'-0');if(!c)return null;const p=this.project(c.position.add(new Vector3(0,.7,0)));const hit=this.scene.pick(p.x,p.y);return {x:p.x,y:p.y,column:hit?.pickedMesh?.metadata?.column??null};}
 batchDiagnostics(){const groups=[...this.voxelGroups.values()];return {geometryCount:new Set(groups.map(g=>g.mesh.geometry)).size,bufferCount:new Set(groups.map(g=>g.mesh.geometry.getVertexBuffer('world0')?.getBuffer())).size,boundMatricesCorrect:groups.length===4&&groups.every(g=>[0,1,2,3].every(i=>g.mesh.geometry.getVertexBuffer('world'+i)?.getData()===g.buffer)),colors:Object.fromEntries([...this.voxelGroups].map(([color,g])=>[color,{count:g.count,diffuse:g.mesh.material.diffuseColor.toHexString()}]))};}
 info(){return {...this.stats,build:'2.0.1',batches:this.batchDiagnostics(),engine:this.available?'Babylon.js 9.30.0':'unavailable',webgl:this.engine?.webGLVersion||0,dpr:this.engine?1/this.engine.getHardwareScalingLevel():0,visibleVoxels:[...this.voxelGroups.values()].reduce((n,g)=>n+g.count,0),meshes:this.scene?.meshes.length||0,fps:Math.round(this.engine?.getFps()||0),available:this.available,blocked:this.blocked,error:this.error||null,ready:this.ready,projectiles:this.bullets.length};}
 dispose(){this.observer?.disconnect();this.scene?.dispose();this.engine?.dispose();}
}
