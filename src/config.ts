import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '@/src/errors';
import { readRegularFile } from '@/src/repository';

export const DEFAULT_MODEL = 'qwen/qwen3-embedding-8b';
export const DEFAULT_RERANK_MODEL = 'voyageai/rerank-2.5';
export type Config = {
  project: string;
  embedding: { model: string };
  retrieval?: { model: string };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.isWellFormed() &&
    value.trim().length > 0 &&
    !value.includes('\r') &&
    !value.includes('\n') &&
    !value.includes('\0')
  );
}

export function validateConfig(value: unknown): Config {
  if (
    !record(value) ||
    !validText(value.project) ||
    !record(value.embedding) ||
    !validText(value.embedding.model)
  ) {
    throw new AppError('CONFIG_INVALID');
  }
  if (
    value.retrieval !== undefined &&
    (!record(value.retrieval) || !validText(value.retrieval.model))
  )
    throw new AppError('CONFIG_INVALID');
  // Return only supported settings. Reading never rewrites the user-owned bytes.
  return {
    project: value.project,
    embedding: { model: value.embedding.model },
    ...(record(value.retrieval) ? { retrieval: { model: value.retrieval.model as string } } : {}),
  };
}

export function readConfig(root: string): Config {
  try {
    if (!lstatSync(join(root, '.agent')).isDirectory()) throw new AppError('CONFIG_INVALID');
    return validateConfig(JSON.parse(readRegularFile(join(root, '.agent', 'memory.json'))));
  } catch {
    throw new AppError('CONFIG_INVALID');
  }
}
