import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '@/src/errors';
import { directory, exists, readBytes } from '@/src/files';
import { budgetFor, QWEN_MODEL } from '@/src/token-budget';

export const CHUNKER = 'markdown-lossless-v2';
export const sha256 = (value: string | Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(value).digest('hex');
export type Chunk = {
  source: string;
  heading: string;
  headings: string[];
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  text: string;
  chunkHash: string;
  passageId: string;
};
export type SourceDocument = {
  source: string;
  sourceHash: string;
  length: number;
  lineStarts: number[];
  spans: (
    | { start: number; end: number; passageId: string }
    | { start: number; end: number; text: string }
  )[];
};
export function formattedInput(
  project: string,
  chunk: Pick<Chunk, 'source' | 'headings' | 'text'>,
  model = QWEN_MODEL,
): string {
  return budgetFor(model).context(project, chunk.source, chunk.headings) + chunk.text;
}

export function chunkSource(
  project: string,
  source: string,
  markdown: string,
  model = QWEN_MODEL,
): { document: SourceDocument; chunks: Chunk[] } {
  if (!markdown.isWellFormed()) throw new AppError('SOURCE_INVALID');
  const text = markdown.replace(/\r\n?/g, '\n');
  const chars = Array.from(text);
  const lines = text.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < chars.length; i++) if (chars[i] === '\n') lineStarts.push(i + 1);
  const document: SourceDocument = {
    source,
    sourceHash: 'sha256:' + sha256(text),
    length: chars.length,
    lineStarts,
    spans: [],
  };
  const chunks: Chunk[] = [];
  const budget = budgetFor(model);
  const softBudget = budgetFor();
  type Section = { start: number; end: number; headings: string[] };
  const sections: Section[] = [];
  const ancestry: { level: number; title: string }[] = [];
  let sectionStart = 0,
    headings: string[] = [],
    fence = '',
    fenceSize = 0;
  const markerOf = (line: string) => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  const opens = (marker: RegExpExecArray | null) =>
    marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!,
      marker = markerOf(line);
    if (fence) {
      if (marker && marker[1]![0] === fence && marker[1]!.length >= fenceSize && !marker[2]!.trim())
        fence = '';
      continue;
    }
    if (opens(marker)) {
      fence = marker![1]![0]!;
      fenceSize = marker![1]!.length;
      continue;
    }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line);
    const setext =
      line.trim() && !/^(?: {4}|\t)/.test(line)
        ? /^ {0,3}(=+|-+)\s*$/.exec(lines[i + 1] ?? '')
        : null;
    if (!atx && !setext) continue;
    const level = atx ? atx[1]!.length : setext![1]![0] === '=' ? 1 : 2;
    const title = atx ? (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim() : line.trim();
    sections.push({ start: sectionStart, end: i, headings });
    while (ancestry.length && ancestry.at(-1)!.level >= level) ancestry.pop();
    ancestry.push({ level, title });
    headings = ancestry.map((item) => item.title);
    sectionStart = i;
    if (setext) i++;
  }
  sections.push({ start: sectionStart, end: lines.length, headings });
  const offset = (line: number) => lineStarts[line] ?? chars.length;
  const lineAt = (position: number) => {
    let low = 0,
      high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (lineStarts[mid]! <= position) low = mid + 1;
      else high = mid - 1;
    }
    return high + 1;
  };
  function emit(start: number, end: number, chain: string[]) {
    if (end <= start) return;
    const body = chars.slice(start, end).join('');
    if (!body.trim()) {
      document.spans.push({ start, end, text: body });
      return;
    }
    const passageId = 'sha256:' + sha256(JSON.stringify([source, start, end, sha256(body)]));
    const chunk: Chunk = {
      source,
      heading: chain.at(-1) ?? '',
      headings: [...chain],
      start,
      end,
      startLine: lineAt(start),
      endLine: lineAt(end - 1),
      text: body,
      passageId,
      chunkHash: '',
    };
    chunk.chunkHash = 'sha256:' + sha256(formattedInput(project, chunk, model));
    chunks.push(chunk);
    document.spans.push({ start, end, passageId });
  }
  for (const section of sections) {
    const prefix = budget.context(project, source, section.headings);
    const fits = (start: number, end: number) =>
      budget.fitsDocument(prefix, chars.slice(start, end).join(''));
    const blocks: { start: number; end: number; code: boolean }[] = [];
    let blockStart = section.start;
    let code = false;
    fence = '';
    fenceSize = 0;
    for (let i = section.start; i < section.end; i++) {
      const line = lines[i]!,
        marker = markerOf(line);
      if (opens(marker) || /^(?: {4}|\t)/.test(line)) code = true;
      if (fence) {
        if (
          marker &&
          marker[1]![0] === fence &&
          marker[1]!.length >= fenceSize &&
          !marker[2]!.trim()
        )
          fence = '';
      } else if (opens(marker)) {
        fence = marker![1]![0]!;
        fenceSize = marker![1]!.length;
      } else if (!line.trim()) {
        let next = i + 1;
        while (next < section.end && !lines[next]!.trim()) next++;
        if (/^(?: {4}|\t)/.test(lines[blockStart] ?? '') && /^(?: {4}|\t)/.test(lines[next] ?? ''))
          continue;
        blocks.push({ start: offset(blockStart), end: offset(i + 1), code });
        code = false;
        blockStart = i + 1;
      }
    }
    if (blockStart < section.end)
      blocks.push({ start: offset(blockStart), end: offset(section.end), code });
    let pending: { start: number; end: number } | undefined;
    const flush = () => {
      if (pending) emit(pending.start, pending.end, section.headings);
      pending = undefined;
    };
    for (const block of blocks) {
      if (
        pending &&
        softBudget.count(chars.slice(pending.start, block.end).join('')) <= 500 &&
        fits(pending.start, block.end)
      ) {
        pending.end = block.end;
        continue;
      }
      flush();
      if (
        fits(block.start, block.end) &&
        (block.code || softBudget.count(chars.slice(block.start, block.end).join('')) <= 500)
      ) {
        pending = block;
        continue;
      }
      let start = block.start;
      while (start < block.end) {
        if (
          fits(start, block.end) &&
          softBudget.count(chars.slice(start, block.end).join('')) <= 500
        ) {
          emit(start, block.end, section.headings);
          break;
        }
        let low = 1,
          high = Math.min(block.end - start, 16000),
          length = 0;
        while (low <= high) {
          const mid = (low + high) >>> 1;
          const body = chars.slice(start, start + mid).join('');
          if (softBudget.count(body) <= 500 && budget.fitsDocument(prefix, body)) {
            length = mid;
            low = mid + 1;
          } else high = mid - 1;
        }
        // A soft-target miss is not evidence of an impossible hard budget.
        // The bounded context leaves ample room for one Unicode code point.
        if (!length) {
          length = 1;
          if (!fits(start, start + length)) throw new AppError('SOURCE_INVALID');
        }
        let end = start + length;
        for (const boundary of [
          (char: string) => char === '\n',
          (char: string) => /\s/u.test(char),
        ]) {
          let found = false;
          for (let i = end - 1; i >= start; i--)
            if (boundary(chars[i]!) && fits(start, i + 1)) {
              end = i + 1;
              found = true;
              break;
            }
          if (found) break;
        }
        if (!fits(start, end)) throw new AppError('SOURCE_INVALID');
        emit(start, end, section.headings);
        start = end;
      }
    }
    flush();
  }
  return { document, chunks };
}
export function chunkMarkdown(
  project: string,
  source: string,
  markdown: string,
  model = QWEN_MODEL,
): Chunk[] {
  return chunkSource(project, source, markdown, model).chunks;
}
export function scanSources(
  root: string,
  project: string,
  model = QWEN_MODEL,
): { documents: number; sources: SourceDocument[]; chunks: Chunk[] } {
  const sources: SourceDocument[] = [];
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
        const text = new TextDecoder('utf-8', { fatal: true }).decode(readBytes(join(root, next)));
        const parsed = chunkSource(project, next, text, model);
        sources.push(parsed.document);
        chunks.push(...parsed.chunks);
      }
    }
  }
  try {
    directory(join(root, '.agent'));
    for (const relative of ['.agent/knowledge', '.agent/decisions'])
      if (exists(join(root, relative))) scan(relative);
    return { documents: sources.length, sources, chunks };
  } catch {
    throw new AppError('SOURCE_INVALID');
  }
}
