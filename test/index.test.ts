import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from '../src/prepare';
import { search, status, gc } from '../src/search';
import { readSnapshot, indexPath, parseSnapshot } from '../src/store';
import { fixture, repository, cleanup, cli } from './helpers';
import type { Config } from '../src/config';
const config:Config={project:'fixture',embedding:{model:'test-model'}};
function setup() {const root=repository();mkdirSync(join(root,'.agent/knowledge'),{recursive:true});writeFileSync(join(root,'.agent/memory.json'),JSON.stringify(config));return root;}
const noCredential=()=>{throw new Error('CREDENTIAL_READ');};
afterEach(cleanup);

test('real offline empty prepare/search/status/gc CLI and no implicit refresh', async()=>{
  const root=setup();const home=fixture();
  expect((await cli(root,home,['search','hello'])).value.error.code).toBe('INDEX_NOT_READY');
  const prepared=await cli(root,home,['prepare']);expect(prepared.exit).toBe(0);expect(prepared.value.chunks).toBe(0);
  const bytes=readFileSync(join(indexPath(root),'snapshot.json'));
  writeFileSync(join(root,'.agent/knowledge/new.md'),'not prepared');
  expect((await cli(root,home,['search','hello'])).value.results).toEqual([]);
  expect((await cli(root,home,['status'])).value.documents).toBe(0);
  expect((await cli(root,home,['gc'])).value.removedVectors).toBe(0);
  expect(readFileSync(join(indexPath(root),'snapshot.json'))).toEqual(bytes);
});

test('prepare/reuse/edit/failure/delete/GC with snapshot-only search and orphan reuse',async()=>{
  const root=setup();const path=join(root,'.agent/knowledge/auth.md');writeFileSync(path,'# Tokens\nRotate the refresh token.\n\n# Cookies\nStore cookies securely.');
  const calls:string[][]=[];const embedding=async(inputs:string[])=>{calls.push(inputs);return inputs.map(input=>input.includes('Cookies')?[0,1]:[1,0]);};
  const first=await prepare(root,config,embedding,()=> 'dummy');expect(first.embeddedVectors).toBe(2);expect(calls).toHaveLength(1);
  const old=readFileSync(join(indexPath(root),'snapshot.json')); const second=await prepare(root,config,embedding,noCredential);expect(second.reusedVectors).toBe(2);expect(calls).toHaveLength(1);
  const before=readFileSync(path); writeFileSync(path,before.toString().replace('Rotate','Renew'));
  const changed=await prepare(root,config,embedding,()=> 'dummy');expect(changed.embeddedVectors).toBe(1);expect(changed.reusedVectors).toBe(1);
  const current=readFileSync(join(indexPath(root),'snapshot.json'));
  writeFileSync(path,'# Changed\nDifferent content');
  await expect(prepare(root,config,async()=>{throw new Error('API_FAILURE');},()=> 'dummy')).rejects.toThrow();
  expect(readFileSync(join(indexPath(root),'snapshot.json'))).toEqual(current);
  // Remove canonical source directory entirely: search still uses stored text/locations.
  renameSync(join(root,'.agent/knowledge'),join(root,'.agent/sources-unavailable'));
  const result=await search(root,config,'refresh token',async(inputs)=>{expect(inputs).toEqual(['refresh token']);return [[1,0]];},()=> 'dummy');
  expect(result.results[0]!.heading).toBe('Tokens');expect(result.results[0]!.snippet).toContain('Renew');
  const collected=await gc(root,config);expect(collected.removedVectors).toBe(1);expect(collected.retainedVectors).toBe(2);
  expect((await status(root,config)).documents).toBe(1);
  expect(old.equals(current)).toBe(false);
  // Rebuild from compatible receipts after snapshot loss without another request.
  renameSync(join(root,'.agent/sources-unavailable'),join(root,'.agent/knowledge'));
  writeFileSync(path,before.toString().replace('Rotate','Renew'));rmSync(join(indexPath(root),'snapshot.json'));
  expect((await prepare(root,config,embedding,noCredential)).reusedVectors).toBe(2);
  rmSync(path);expect((await prepare(root,config,embedding,noCredential)).chunks).toBe(0);
  expect((await gc(root,config)).removedVectors).toBe(2);
});

test('missing vector status, corrupt vector failure, profile mismatch and safe GC authority',async()=>{
  const root=setup();writeFileSync(join(root,'.agent/knowledge/a.md'),'alpha');
  const embedding=async()=>[[1,0]];await prepare(root,config,embedding,()=> 'dummy');
  const snapshot=readSnapshot(root,config);const vector=join(indexPath(root),'vectors',snapshot.chunks[0]!.vector);
  rmSync(vector);expect((await status(root,config)).missingVectors).toBe(1);
  await expect(search(root,config,'a',embedding,noCredential)).rejects.toThrow('index is invalid');
  await expect(gc(root,config)).rejects.toThrow('index is invalid');
  await prepare(root,config,embedding,()=> 'dummy');writeFileSync(vector,Buffer.alloc(8));
  await expect(status(root,config)).rejects.toThrow('index is invalid');
  expect(()=>readSnapshot(root,{...config,embedding:{model:'changed'}})).toThrow('incompatible');
  const files=readdirSync(join(indexPath(root),'vectors'));writeFileSync(join(indexPath(root),'snapshot.json'),'{');
  await expect(gc(root,config)).rejects.toThrow('index is invalid');expect(readdirSync(join(indexPath(root),'vectors'))).toEqual(files);
  for(const field of [{source:'../../escape.md'},{startLine:0},{text:'tampered'},{vector:'../escape.f32'}]) {
    expect(()=>parseSnapshot({...snapshot,chunks:[{...snapshot.chunks[0],...field}]},config)).toThrow();
  }
});

test('65 unique inputs use 64+1 batches and a failed later batch leaves reusable orphans',async()=>{
  const root=setup();for(let i=0;i<65;i++)writeFileSync(join(root,'.agent/knowledge',`${i}.md`),'entry '+i);
  const calls:number[]=[];
  await expect(prepare(root,config,async inputs=>{calls.push(inputs.length);if(calls.length===2)throw new Error('FAIL');return inputs.map(()=>[1,0]);},()=> 'dummy')).rejects.toThrow('FAIL');
  expect(calls).toEqual([64,1]);expect(()=>readSnapshot(root,config)).toThrow('No prepared index');
  const result=await prepare(root,config,async inputs=>{expect(inputs.length).toBe(1);return [[1,0]];},()=> 'dummy');
  expect(result.reusedVectors).toBe(64);expect(result.embeddedVectors).toBe(1);
});

test('simultaneous real command processes publish and read complete worktree-local snapshots',async()=>{
  const first=setup();const second=setup();const home=fixture();
  await cli(first,home,['prepare']);await cli(second,home,['prepare']);
  const before=readFileSync(join(indexPath(second),'snapshot.json'));
  for(let round=0;round<3;round++) {
    const results=await Promise.all([cli(first,home,['prepare']),cli(first,home,['search','query']),cli(first,home,['status']),cli(first,home,['gc'])]);
    for(const result of results)expect(result.exit).toBe(0);
    expect(readSnapshot(first,config).chunks).toEqual([]);
  }
  expect(readFileSync(join(indexPath(second),'snapshot.json'))).toEqual(before);
});

test('binary loader retains float32 values and rejects zero/nonfinite data even with matching digest',async()=>{
  const {readVector,vectorBytes}=await import('../src/store');const {sha256}=await import('../src/chunks');
  const root=setup();writeFileSync(join(root,'.agent/knowledge/a.md'),'alpha');
  await prepare(root,config,async()=>[[Math.fround(.1),Math.fround(.2)]],()=> 'dummy');
  const snapshot=readSnapshot(root,config);const chunk=snapshot.chunks[0]!;const receipt={...chunk,profile:snapshot.profile};
  const vector=readVector(root,receipt);expect(Array.from(vector)).toEqual([Math.fround(.1),Math.fround(.2)]);
  const path=join(indexPath(root),'vectors',receipt.vector);
  for(const values of [[0,0],[NaN,1],[Infinity,1]]) {
    const bytes=vectorBytes(values);writeFileSync(path,bytes);
    expect(()=>readVector(root,{...receipt,vectorHash:'sha256:'+sha256(bytes)})).toThrow('index is invalid');
  }
});
