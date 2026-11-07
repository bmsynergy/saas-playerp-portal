// Full generated PNG, including text bounds, decoded QR and physical resolution. Synthetic values only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const out='docs/evidence/pe602';await mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const results=[];
try {
 const p=await b.newPage();await p.route(url=>!url.href.startsWith('http://127.0.0.1:18799'),r=>r.abort());await p.goto('http://127.0.0.1:18799');
 for(const ssid of ['PlayERP-Setup-TEST602A','W'.repeat(27)+'\\;,:"','é'.repeat(16)]){
  const input={deviceId:'fixture',serial:'PS-TEST602A',ssid,password:'0123456789',appliedAt:'2026-01-01T00:00:00Z'};
  const result=await p.evaluate(async input=>{
   const m=await import('/src/lib/psLabel.ts');const texts=[],original=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(value,x,y){texts.push({value,x,y,width:this.measureText(value).width});return original.call(this,value,x,y);};
   let blob;try{blob=await m.generateLabelPng(input);}finally{CanvasRenderingContext2D.prototype.fillText=original;}
   return {texts,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
  },input);
  const bytes=Buffer.from(result.bytes);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const png=PNG.sync.read(bytes);assert.equal(png.width,590);assert.equal(png.height,354);
  let at=8,phys=[];while(at<bytes.length){const n=bytes.readUInt32BE(at);if(bytes.toString('ascii',at+4,at+8)==='pHYs')phys.push([bytes.readUInt32BE(at+8),bytes.readUInt32BE(at+12),bytes[at+16]]);at+=12+n;}
  assert.deepEqual(phys,[[11811,11811,1]]);
  const esc=s=>s.replace(/([\\;,:"])/g,'\\$1'),payload=`WIFI:T:WPA;S:${esc(ssid)};P:0123456789;;`;
  assert.equal(jsQR(new Uint8ClampedArray(png.data),590,354)?.data,payload);
  const qr=QRCode.create(payload,{errorCorrectionLevel:'M'}),scale=Math.floor(277/(qr.modules.size+8)),size=(qr.modules.size+8)*scale,x0=295+Math.floor((277-size)/2),y0=Math.floor((354-size)/2);
  for(let row=0;row<qr.modules.size+8;row++)for(let col=0;col<qr.modules.size+8;col++){
   const black=row>=4&&col>=4&&row<qr.modules.size+4&&col<qr.modules.size+4&&qr.modules.get(row-4,col-4);
   for(let y=0;y<scale;y++)for(let x=0;x<scale;x++)assert.equal(png.data[((y0+row*scale+y)*590+x0+col*scale+x)*4],black?0:255);
  }
  assert(result.texts.every(t=>t.x>=18&&t.x+t.width<=283&&t.y<=335));
  assert.equal(result.texts.filter(t=>t.y===134||t.y===158).map(t=>t.value).join(''),ssid);
  assert(result.texts.some(t=>t.value===input.serial));assert(result.texts.some(t=>t.value===input.password));
  for(let i=0;i<png.data.length;i+=4)assert((png.data[i]===0||png.data[i]===255)&&png.data[i]===png.data[i+1]&&png.data[i]===png.data[i+2]&&png.data[i+3]===255);
  const file=`label-${results.length}.png`;await writeFile(`${out}/${file}`,bytes);results.push({file,signature:'89504e470d0a1a0a',width:590,height:354,pHYs:phys[0],decoded:payload,integerScale:scale,textLeft:true,quietZone:4});
 }
 await writeFile(`${out}/label-report.json`,JSON.stringify({pass:true,physicalCamera:'Pending Beny',results},null,2));console.log('PASS full PNG '+results.length+' fixtures: dimensions, pHYs, QR exact decode, integer modules, quiet zone and left text bounds.');
}finally{await b.close();}
