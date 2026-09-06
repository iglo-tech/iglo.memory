import type { Config } from '@/src/config';
import { scanSources, formattedInput } from '@/src/chunks';
import { embed, validVector } from '@/src/embedding';
import { budgetFor } from '@/src/token-budget';
import { buildLexical } from '@/src/lexical';
import { DEFAULT_MODEL } from '@/src/config';
import { requireCredential } from '@/src/credentials';
import { AppError } from '@/src/errors';
import { withIndexLock } from '@/src/lock';
import {
  ensureIndex,
  readSnapshot,
  cacheReceipts,
  readVector,
  saveVector,
  profileFor,
  publish,
  type Receipt,
  type Snapshot,
} from '@/src/store';

export async function prepare(
  root: string,
  config: Config,
  embedding = embed,
  credential = requireCredential,
) {
  return withIndexLock(root, async () => {
    ensureIndex(root);
    const sources = scanSources(root, config.project, config.embedding.model);
    let dimensions: number | null = null;
    let old: Snapshot | undefined;
    try {
      old = readSnapshot(root, config);
      dimensions = old.profile.dimensions;
    } catch {
      /* Explicit prepare repairs invalid/incompatible data. */
    }
    const candidates = [
      ...(old?.chunks.map((chunk) => ({ ...chunk, profile: old!.profile })) ?? []),
      ...cacheReceipts(root, config),
    ];
    const wanted = new Map(sources.chunks.map((chunk) => [chunk.chunkHash, chunk]));
    const reused = new Map<string, Receipt>();
    for (const receipt of candidates) {
      if (
        !wanted.has(receipt.chunkHash) ||
        reused.has(receipt.chunkHash) ||
        (dimensions !== null && dimensions !== receipt.profile.dimensions)
      )
        continue;
      try {
        readVector(root, receipt);
        dimensions ??= receipt.profile.dimensions;
        reused.set(receipt.chunkHash, receipt);
      } catch {
        /* Re-embed missing/corrupt cache files. */
      }
    }
    const pending = [...wanted.values()].filter((chunk) => !reused.has(chunk.chunkHash));
    const receipts = new Map(reused);
    let embeddedVectors = 0;
    // Resolve credentials only when there is actual remote work.
    const key = pending.length ? credential() : '';
    const inputs = new Map(
      pending.map((chunk) => [
        formattedInput(config.project, chunk, config.embedding.model),
        chunk,
      ]),
    );
    const budget = budgetFor(config.embedding.model);
    for (const inputBatch of budget.batches([...inputs.keys()])) {
      const batch = inputBatch.map((input) => inputs.get(input)!);
      const values = await embedding(
        inputBatch,
        config.embedding.model,
        key,
        dimensions ?? undefined,
      );
      if (values.length !== batch.length) throw new AppError('EMBEDDING_FAILED');
      const expected = config.embedding.model === DEFAULT_MODEL ? 4096 : (dimensions ?? undefined);
      const checked = values.map((value) => validVector(value, expected));
      dimensions ??= checked[0]!.length;
      for (const value of checked) validVector(value, dimensions);
      const profile = profileFor(config.embedding.model, dimensions);
      batch.forEach((chunk, index) =>
        receipts.set(chunk.chunkHash, saveVector(root, profile, chunk.chunkHash, checked[index]!)),
      );
      embeddedVectors += batch.length;
    }
    const profile = profileFor(config.embedding.model, dimensions);
    const snapshot: Snapshot = {
      schemaVersion: 2,
      project: config.project,
      preparedAt: new Date().toISOString(),
      profile,
      documents: sources.documents,
      sources: sources.sources,
      lexical: buildLexical(sources.chunks),
      chunks: sources.chunks.map((chunk) => {
        const receipt = receipts.get(chunk.chunkHash)!;
        return { ...chunk, vector: receipt.vector, vectorHash: receipt.vectorHash };
      }),
    };
    publish(root, snapshot, config);
    return {
      project: config.project,
      preparedAt: snapshot.preparedAt,
      documents: snapshot.documents,
      chunks: snapshot.chunks.length,
      reusedVectors: reused.size,
      embeddedVectors,
    };
  });
}
