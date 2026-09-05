import type { Config } from './config';
import { embed } from './embedding';
import { requireCredential } from './credentials';
import { withIndexLock } from './lock';
import { collect, loadVectors, readSnapshot, type Snapshot } from './store';

const normalized = (text:string)=>text.toLowerCase().replace(/\s+/g,' ').trim();
const tokens = (text:string)=>new Set(normalized(text).match(/[\p{L}\p{N}_]+(?:[./:@-][\p{L}\p{N}_]+)*/gu) ?? []);
const norm = (values:number[])=>Math.sqrt(values.reduce((sum,value)=>sum+value*value,0));
export function rank(snapshot:Snapshot,vectors:Map<string,number[]>,query:string,queryVector:number[]) {
  const queryNorm=norm(queryVector); const queryTokens=tokens(query); const phrase=normalized(query);
  const coverage=(text:string)=>{const present=tokens(text);return queryTokens.size ? [...queryTokens].filter(token=>present.has(token)).length/queryTokens.size : 0;};
  const candidates=snapshot.chunks.map(chunk=>{
    const vector=vectors.get(chunk.vector)!;
    const cosine=vector.reduce((sum,value,i)=>sum+value*queryVector[i]!,0)/(norm(vector)*queryNorm);
    const text=normalized(chunk.text);
    const score=cosine*.80+(phrase && text.includes(phrase) ? .10 : 0)+coverage(chunk.text)*.06+coverage(chunk.heading)*.03+coverage(chunk.source)*.01;
    return {chunk,score};
  }).filter(item=>item.score>=.25).sort((a,b)=>b.score-a.score || Buffer.compare(Buffer.from(a.chunk.source),Buffer.from(b.chunk.source)) || a.chunk.startLine-b.chunk.startLine || a.chunk.endLine-b.chunk.endLine || a.chunk.chunkHash.localeCompare(b.chunk.chunkHash));
  const seen=new Set<string>(); const results=[];
  for(const {chunk,score} of candidates) {
    if(seen.has(chunk.source))continue; seen.add(chunk.source);
    const chars=Array.from(chunk.text);
    results.push({score:Math.round(score*1e6)/1e6,source:chunk.source,heading:chunk.heading,startLine:chunk.startLine,endLine:chunk.endLine,snippet:chars.slice(0,400).join('')+(chars.length>400?'…':'')});
    if(results.length===8)break;
  }
  return results;
}
export async function search(root:string,config:Config,query:string,embedding=embed,credential=requireCredential) {
  const loaded=await withIndexLock(root,()=>{const snapshot=readSnapshot(root,config);return {snapshot,...loadVectors(root,snapshot)};});
  const {snapshot,vectors}=loaded;
  if(!snapshot.chunks.length)return {query,preparedAt:snapshot.preparedAt,results:[]};
  const [queryVector]=await embedding([query],config.embedding.model,credential(),snapshot.profile.dimensions!);
  return {query,preparedAt:snapshot.preparedAt,results:rank(snapshot,vectors,query,queryVector!)};
}
export async function status(root:string,config:Config) {
  return withIndexLock(root,()=>{const snapshot=readSnapshot(root,config);const loaded=loadVectors(root,snapshot,true);
    return {project:config.project,preparedAt:snapshot.preparedAt,documents:snapshot.documents,chunks:snapshot.chunks.length,vectors:loaded.vectors.size,missingVectors:loaded.missingVectors,profile:snapshot.profile.profile};});
}
export async function gc(root:string,config:Config) {return withIndexLock(root,()=>collect(root,readSnapshot(root,config)));}
