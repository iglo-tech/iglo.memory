// Controlled transport fixture through the real CLI entry point. Never installed
// in the product launcher; the production endpoint remains fixed to OpenRouter.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256 } from '../src/chunks';
const temp=mkdtempSync('/tmp/iglo-cli-qa-');
try {
  const root=join(temp,'repo');const home=join(temp,'home');mkdirSync(home);mkdirSync(join(root,'.git/objects'),{recursive:true});mkdirSync(join(root,'.git/refs'));writeFileSync(join(root,'.git/HEAD'),'ref: refs/heads/main\n');
  const log=join(temp,'requests.jsonl');const preload=join(temp,'transport.ts');const config=join(temp,'trusted.toml');writeFileSync(config,'');
  writeFileSync(preload,`import {appendFileSync} from 'node:fs';
  globalThis.fetch=Object.assign(async(url,init)=>{
    if(String(url)!=='https://openrouter.ai/api/v1/embeddings')throw new Error('unexpected endpoint');
    const body=JSON.parse(init.body);appendFileSync(${JSON.stringify(log)},JSON.stringify({model:body.model,inputs:body.input.length,kind:body.input[0].startsWith('Project: ')?'documents':'query'})+'\\n');
    if(body.input.some(text=>text.includes('FAIL_PROVIDER')))return new Response('DUMMY_PROVIDER_SECRET',{status:400});
    return Response.json({data:body.input.map((text,index)=>({index,embedding:text.toLowerCase().includes('token')?[1,0,0]:[0,1,0]})).reverse()});
  },{preconnect:()=>{}});`);
  const cli=resolve('src/cli.ts');
  async function run(args:string[],success=true) {
    const child=Bun.spawn([process.execPath,'--no-env-file','--no-install',`--config=${config}`,'--preload',preload,cli,...args],{cwd:root,env:{...process.env,HOME:home,OPENROUTER_API_KEY:'dummy-key',PATH:'/nonexistent'},stdin:'ignore',stdout:'pipe',stderr:'pipe'});
    const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
    if((exit===0)!==success || (stdout+stderr).includes('DUMMY_PROVIDER_SECRET') || (stdout+stderr).includes('dummy-key'))throw new Error('CLI result mismatch '+JSON.stringify({args,exit,stdout,stderr}));
    return JSON.parse(stdout);
  }
  await run(['init']);
  const file=join(root,'.agent/knowledge/auth.md');writeFileSync(file,'# Authentication\nRefresh token rotation.\n\n# Delivery\nDeploy via CI.');const sourceHash=sha256(readFileSync(file));
  const first=await run(['prepare']);if(first.embeddedVectors!==2)throw new Error('initial batch');
  const repeat=await run(['prepare']);if(repeat.embeddedVectors!==0)throw new Error('unexpected document request');
  const query=await run(['search','token renewal']);if(query.results[0]?.heading!=='Authentication')throw new Error('ranking');
  if(sha256(readFileSync(file))!==sourceHash)throw new Error('source mutation');
  const snapshot=join(root,'.agent/memory-index/snapshot.json');const prior=sha256(readFileSync(snapshot));
  writeFileSync(file,'# Authentication\nFAIL_PROVIDER token');await run(['prepare'],false);
  if(sha256(readFileSync(snapshot))!==prior)throw new Error('failed publication');
  rmSync(file);
  const stored=await run(['search','token']);if(!stored.results[0]?.snippet.includes('rotation'))throw new Error('source-only search');
  const status=await run(['status']);if(status.documents!==1)throw new Error('freshness changed');
  const beforeGc=await run(['gc']);if(beforeGc.removedVectors!==0)throw new Error('active deletion');
  const empty=await run(['prepare']);if(empty.chunks!==0)throw new Error('empty refresh');
  const garbage=await run(['gc']);if(garbage.removedVectors!==2)throw new Error('orphan cleanup');
  const emptySearch=await run(['search','token']);if(emptySearch.results.length!==0)throw new Error('empty search');
  console.log(JSON.stringify({scenario:'real source CLI with trusted controlled transport',result:'PASS',requests:readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)),sourcePreservation:'PASS',failedRefreshPreservation:'PASS',sourceIndependentSearch:'PASS',gcAuthority:'PASS',remainingVectors:readdirSync(join(root,'.agent/memory-index/vectors')).length,cleanup:'fixtures removed on exit'}));
}finally{rmSync(temp,{recursive:true,force:true});}
