import type { Config } from './config';
import { scanSources, formattedInput } from './chunks';
import { embed } from './embedding';
import { requireCredential } from './credentials';
import { withIndexLock } from './lock';
import { ensureIndex, readSnapshot, cacheReceipts, readVector, saveVector, profileFor, publish, type Receipt, type Snapshot } from './store';

export async function prepare(root: string, config: Config, embedding = embed, credential = requireCredential) {
  return withIndexLock(root, async () => {
    ensureIndex(root);
    const sources = scanSources(root,config.project);
    let dimensions: number | null = null; let old: Snapshot | undefined;
    try { old = readSnapshot(root,config); dimensions = old.profile.dimensions; } catch { /* Explicit prepare repairs invalid/incompatible data. */ }
    const candidates = [...(old?.chunks.map(chunk=>({ ...chunk,profile:old!.profile })) ?? []),...cacheReceipts(root,config)];
    const wanted = new Map(sources.chunks.map(chunk=>[chunk.chunkHash,chunk]));
    const reused = new Map<string,Receipt>();
    for (const receipt of candidates) {
      if (!wanted.has(receipt.chunkHash) || reused.has(receipt.chunkHash) || dimensions !== null && dimensions !== receipt.profile.dimensions) continue;
      try { readVector(root,receipt); dimensions ??= receipt.profile.dimensions; reused.set(receipt.chunkHash,receipt); } catch { /* Re-embed missing/corrupt cache files. */ }
    }
    const pending = [...wanted.values()].filter(chunk=>!reused.has(chunk.chunkHash));
    const receipts = new Map(reused); let embeddedVectors = 0;
    // Resolve credentials only when there is actual remote work.
    const key = pending.length ? credential() : '';
    for (let start=0;start<pending.length;start+=64) {
      const batch=pending.slice(start,start+64);
      const values=await embedding(batch.map(chunk=>formattedInput(config.project,chunk)),config.embedding.model,key,dimensions ?? undefined);
      dimensions ??= values[0]!.length;
      const profile=profileFor(config.embedding.model,dimensions);
      batch.forEach((chunk,index)=>receipts.set(chunk.chunkHash,saveVector(root,profile,chunk.chunkHash,values[index]!)));
      embeddedVectors+=batch.length;
    }
    const profile=profileFor(config.embedding.model,dimensions);
    const snapshot:Snapshot={ schemaVersion:1, project:config.project, preparedAt:new Date().toISOString(),profile,documents:sources.documents,
      chunks:sources.chunks.map(chunk=>{const receipt=receipts.get(chunk.chunkHash)!; return {...chunk,vector:receipt.vector,vectorHash:receipt.vectorHash};}) };
    publish(root,snapshot,config);
    return {project:config.project,preparedAt:snapshot.preparedAt,documents:snapshot.documents,chunks:snapshot.chunks.length,reusedVectors:reused.size,embeddedVectors};
  });
}
