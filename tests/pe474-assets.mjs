import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://playerp.dev.bmore.app';
const sha=b=>createHash('sha256').update(b).digest('hex');
const local=await readFile('dist/index.html');const response=await fetch(origin+'/',{cache:'no-store'});assert.equal(response.status,200);const remote=Buffer.from(await response.arrayBuffer());assert.equal(sha(remote),sha(local));
const assets=[...remote.toString().matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);assert.ok(assets.length>=2);
const checks=[];for(const path of assets){const r=await fetch(origin+path,{cache:'no-store'});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer()),expected=await readFile('dist'+path);assert.equal(sha(bytes),sha(expected));checks.push({path,status:r.status,bytes:bytes.length,sha256:sha(bytes),matchesLocal:true});}
const report={at:new Date().toISOString(),origin,commit:process.env.DEPLOYED_COMMIT,release:process.env.DEPLOYED_RELEASE,index:{status:response.status,sha256:sha(remote),matchesLocal:true},assets:checks,pass:true};await writeFile('docs/evidence/pe474/assets.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
