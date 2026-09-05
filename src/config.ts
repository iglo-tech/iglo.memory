import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from './errors';
import { readRegularFile } from './repository';

export const DEFAULT_MODEL = 'openai/text-embedding-3-small';
export type Config = { project: string; embedding: { model: string } };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\r\n\x00]/.test(value);
}

export function validateConfig(value: unknown): Config {
  if (!record(value) || !validText(value.project) || !record(value.embedding) || !validText(value.embedding.model)) {
    throw new AppError('CONFIG_INVALID');
  }
  // Return only supported settings. Reading never rewrites the user-owned bytes.
  return { project: value.project, embedding: { model: value.embedding.model } };
}

export function readConfig(root: string): Config {
  try {
    if (!lstatSync(join(root, '.agent')).isDirectory()) throw new AppError('CONFIG_INVALID');
    return validateConfig(JSON.parse(readRegularFile(join(root, '.agent', 'memory.json'))));
  } catch {
    throw new AppError('CONFIG_INVALID');
  }
}
