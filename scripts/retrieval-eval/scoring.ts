import { check, object } from '@/scripts/retrieval-eval/corpus';
import type { Question } from '@/scripts/retrieval-eval/labels';

export type Excerpt = {
  source: string;
  text: string;
  start: number | null;
  end: number | null;
  mapping: 'exact' | 'adjudication';
  misleading: boolean | null;
};
// Exact unique matching only. Repeated/rewritten snippets stay unresolved.
export function mapExcerpt(source: string, text: string, body: string | undefined): Excerpt {
  const base = {
    source,
    text,
    start: null,
    end: null,
    mapping: 'adjudication' as const,
    misleading: null,
  };
  if (!body || !text) return base;
  const offset = body.indexOf(text);
  if (offset < 0 || body.indexOf(text, offset + 1) >= 0) return base;
  const start = Array.from(body.slice(0, offset)).length;
  return { ...base, start, end: start + Array.from(text).length, mapping: 'exact' };
}
export function baselineExcerpts(
  value: unknown,
  project: string,
  sources: Map<string, string>,
): Excerpt[] {
  const root = object(value);
  check(Array.isArray(root.results) && root.results.length <= 8, 'Invalid baseline response');
  return root.results.map((value) => {
    const r = object(value);
    check(typeof r.source === 'string' && typeof r.snippet === 'string', 'Invalid result');
    // At this pin a clipped snippet is exactly 400 code points plus one ellipsis.
    const chars = Array.from(r.snippet);
    const text =
      chars.length === 401 && chars[400] === '…' ? chars.slice(0, 400).join('') : r.snippet;
    return mapExcerpt(r.source, text, sources.get(`${project}/${r.source}`));
  });
}
export function qmdExcerpts(
  value: unknown,
  project: string,
  sources: Map<string, string>,
): Excerpt[] {
  check(Array.isArray(value) && value.length <= 8, 'Invalid QMD response');
  return value.map((value) => {
    const r = object(value);
    check(typeof r.file === 'string' && typeof r.snippet === 'string', 'Invalid QMD result');
    const prefix = `qmd://${project}/`;
    check(r.file.startsWith(prefix), 'QMD returned another collection');
    const url = new URL(r.file);
    check(url.search === '' || url.search === `?index=${project}`, 'QMD returned another index');
    const source = `.agent/knowledge/${decodeURIComponent(url.pathname.slice(1))}`;
    // Pinned extractSnippet prepends a diff-style location header, not source.
    let text = r.snippet.replace(/^@@ -\d+,\d+ @@[^\n]*\n/, '');
    const body = sources.get(`${project}/${source}`);
    // Stock query JSON clips to 300 UTF-16 units, appending three periods.
    // Keep genuine source ellipses (and ambiguous full matches) intact.
    if (text.length === 300 && text.endsWith('...') && !body?.includes(text))
      text = text.slice(0, -3);
    return mapExcerpt(source, text, body);
  });
}
export function score(question: Question, excerpts: Excerpt[], failed: boolean) {
  const seen = new Set<string>();
  const facets = new Set<string>();
  let unresolved = false;
  const grades = (failed ? [] : excerpts).slice(0, 8).map((r) => {
    if (r.mapping !== 'exact') {
      unresolved = true;
      return 0;
    }
    const covered = question.evidence.filter(
      (e) => e.source === r.source && r.start! <= e.start && r.end! >= e.end,
    );
    if (!covered.length) unresolved = true; // novel pooled evidence needs a judge
    const fresh = covered.filter((e) => !seen.has(e.id));
    for (const e of covered) {
      if (e.grade > 0) {
        seen.add(e.id);
        for (const f of e.facets) facets.add(f);
      }
    }
    return Math.max(0, ...fresh.map((e) => e.grade));
  });
  const dcg = (g: number[]) =>
    g.slice(0, 8).reduce((sum, grade, i) => sum + (grade === 2 ? 3 : grade) / Math.log2(i + 2), 0);
  const ideal = dcg(question.evidence.map((e) => e.grade).sort((a, b) => b - a));
  const positive = question.evidence.filter((e) => e.grade > 0).length;
  return {
    failed,
    unresolved,
    useful: question.answerable
      ? [1, 3, 5, 8].map((k) => (unresolved ? null : Number(grades.slice(0, k).includes(2))))
      : null,
    supporting: question.answerable && !unresolved ? Number(grades.some((g) => g >= 1)) : null,
    ndcg8: question.answerable && !unresolved ? (ideal ? dcg(grades) / ideal : 0) : null,
    facetRecall8:
      question.answerable && !unresolved && question.facets.length
        ? facets.size / question.facets.length
        : null,
    spanRecall8: question.answerable && !unresolved && positive ? seen.size / positive : null,
    nonempty: !question.answerable && !failed ? Number(excerpts.length > 0) : null,
    misleading:
      !question.answerable && !failed
        ? excerpts.some((e) => e.misleading === true)
          ? 1
          : excerpts.some((e) => e.misleading === null)
            ? null
            : 0
        : null,
  };
}
// Inputs are query means: repetitions never become independent bootstrap units.
export function pairedBootstrap(pairs: [number, number][], seed = 20260905, samples = 2000) {
  check(pairs.length > 0 && pairs.every((p) => p.every(Number.isFinite)), 'Invalid paired values');
  check(Number.isSafeInteger(samples) && samples > 0, 'Invalid bootstrap count');
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const deltas = pairs.map(([a, b]) => b - a);
  const means = Array.from(
    { length: samples },
    () =>
      deltas.reduce((sum) => sum + deltas[Math.floor(random() * deltas.length)]!, 0) /
      deltas.length,
  ).sort((a, b) => a - b);
  return {
    seed,
    queries: pairs.length,
    meanDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    interval95: [
      means[Math.floor(samples * 0.025)],
      means[Math.min(samples - 1, Math.floor(samples * 0.975))],
    ],
    wins: deltas.filter((v) => v > 0).length,
    ties: deltas.filter((v) => v === 0).length,
    losses: deltas.filter((v) => v < 0).length,
  };
}
