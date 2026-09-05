import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveCredential } from '../src/credentials';
import { prepare } from '../src/prepare';
import { cleanup, fixture, repository } from './helpers';
import type { Config } from '../src/config';
afterEach(cleanup);

test('failed credential save retains old bytes and leaves no temporary file',()=>{
  const home=fixture();saveCredential('old-dummy',home);const dir=join(home,'.config/iglo.mem');const path=join(dir,'credentials.json');const old=readFileSync(path);
  chmodSync(dir,0o500);
  try{expect(()=>saveCredential('new-dummy',home)).toThrow('Could not save credentials');expect(readFileSync(path)).toEqual(old);expect(readdirSync(dir)).toEqual(['credentials.json']);}
  finally{chmodSync(dir,0o700);}
});

test('failed snapshot publication preserves previous bytes and orphan data can be reused',async()=>{
  const root=repository();mkdirSync(join(root,'.agent/knowledge'),{recursive:true});const path=join(root,'.agent/knowledge/a.md');writeFileSync(path,'original');
  const config:Config={project:'p',embedding:{model:'test'}};const embed=async(inputs:string[])=>inputs.map(()=>[1,0]);
  await prepare(root,config,embed,()=> 'dummy');const index=join(root,'.agent/memory-index');const snapshot=join(index,'snapshot.json');const old=readFileSync(snapshot);
  writeFileSync(path,'changed');chmodSync(index,0o555);
  try{await expect(prepare(root,config,embed,()=> 'dummy')).rejects.toThrow('Could not update the index');expect(readFileSync(snapshot)).toEqual(old);}
  finally{chmodSync(index,0o755);}
  expect((await prepare(root,config,embed,()=>{throw new Error('unexpected credential');})).reusedVectors).toBe(1);
});
