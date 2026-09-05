import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '@/src/errors';
import { directory, exists, readBytes } from '@/src/files';

export const CHUNKER = 'markdown-blocks-v1';
export const sha256 = (value: string | Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(value).digest('hex');
export type Chunk = {
  source: string;
  heading: string;
  startLine: number;
  endLine: number;
  text: string;
  chunkHash: string;
};
export function formattedInput(
  project: string,
  chunk: Pick<Chunk, 'source' | 'heading' | 'text'>,
): string {
  return `Project: ${project}\nFile: ${chunk.source}\nSection: ${chunk.heading}\n\n${chunk.text}`;
}
const count = (text: string) => Array.from(text).length;

/** Same parser and soft grouping rule for every input. Never reject or truncate by length. */
export function chunkMarkdown(project: string, source: string, markdown: string): Chunk[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const sections: { heading: string; start: number; end: number }[] = [];
  let heading = '';
  let start = 0;
  let fence = '';
  let fenceSize = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1]![0] === fence && marker[1]!.length >= fenceSize && !marker[2]!.trim())
        fence = '';
      continue;
    }
    if (marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'))) {
      fence = marker[1]![0]!;
      fenceSize = marker[1]!.length;
      continue;
    }
    const atx = /^ {0,3}#{1,6}(?:[ \t]+(.*?)|[ \t]*)$/.exec(line);
    const setext =
      line.trim() && !/^(?: {4}|\t)/.test(line) && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1] ?? '');
    if (atx || setext) {
      sections.push({ heading, start, end: i });
      heading = atx ? (atx[1] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim() : line.trim();
      if (setext) i++;
      start = i + 1;
    }
  }
  sections.push({ heading, start, end: lines.length });
  const chunks: Chunk[] = [];
  for (const section of sections) {
    const blocks: { start: number; end: number }[] = [];
    let blockStart = -1;
    fence = '';
    fenceSize = 0;
    for (let i = section.start; i < section.end; i++) {
      const line = lines[i]!;
      if (blockStart < 0 && line.trim()) blockStart = i;
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1]![0] === fence &&
          marker[1]!.length >= fenceSize &&
          !marker[2]!.trim()
        )
          fence = '';
      } else if (marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'))) {
        fence = marker[1]![0]!;
        fenceSize = marker[1]!.length;
      } else if (!line.trim() && blockStart >= 0) {
        // Blank lines inside an indented code block do not split it.
        let next = i + 1;
        while (next < section.end && !lines[next]!.trim()) next++;
        if (/^(?: {4}|\t)/.test(lines[blockStart]!) && /^(?: {4}|\t)/.test(lines[next] ?? ''))
          continue;
        blocks.push({ start: blockStart, end: i });
        blockStart = -1;
      }
    }
    if (blockStart >= 0) blocks.push({ start: blockStart, end: section.end });
    let groupStart = -1;
    let groupEnd = -1;
    const emit = () => {
      if (groupStart < 0) return;
      while (groupEnd > groupStart && !lines[groupEnd - 1]!.trim()) groupEnd--;
      const partial = {
        source,
        heading: section.heading,
        startLine: groupStart + 1,
        endLine: groupEnd,
        text: lines.slice(groupStart, groupEnd).join('\n'),
      };
      chunks.push({ ...partial, chunkHash: 'sha256:' + sha256(formattedInput(project, partial)) });
    };
    for (const block of blocks) {
      if (groupStart >= 0 && count(lines.slice(groupStart, block.end).join('\n')) > 5000) {
        emit();
        groupStart = -1;
      }
      if (groupStart < 0) groupStart = block.start;
      groupEnd = block.end;
    }
    emit();
  }
  return chunks;
}
export function scanSources(root: string, project: string): { documents: number; chunks: Chunk[] } {
  let documents = 0;
  const chunks: Chunk[] = [];
  const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.env']);
  function scan(relative: string) {
    const path = join(root, relative);
    directory(path);
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)),
    )) {
      if (excluded.has(entry.name) || entry.name.startsWith('.env.')) continue;
      const next = relative + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new AppError('SOURCE_INVALID');
      if (entry.isDirectory()) scan(next);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        documents++;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(readBytes(join(root, next)));
        chunks.push(...chunkMarkdown(project, next, text));
      }
    }
  }
  try {
    directory(join(root, '.agent'));
    for (const relative of ['.agent/knowledge', '.agent/decisions'])
      if (exists(join(root, relative))) scan(relative);
    return { documents, chunks };
  } catch {
    throw new AppError('SOURCE_INVALID');
  }
}
