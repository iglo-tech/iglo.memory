import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(import.meta.path), '..');
const archive = '005b7a2771c7f756ea652a45cb59e7bca8cc26e7';
const components = [
  [
    'Qwen tokenizer 1d8ad4ca9b3dd8059ad90a75d4983776a23d44af',
    'assets/tokenizers/qwen3-embedding/LICENSE',
  ],
  ['@huggingface/tokenizers 0.1.3', 'assets/tokenizers/LICENSE.tokenizers-js'],
  ['js-tiktoken 1.0.21', 'docs/evaluation/licenses/js-tiktoken-LICENSE.txt'],
  ['base64-js 1.5.1', 'docs/evaluation/licenses/base64-js-LICENSE.txt'],
];
const sections = [
  'Third-party tokenizer notices\n\nQwen JSON is compacted without changing parsed data; the Voyage counting profile uses a different postprocessor.',
];
for (const [name, path] of components) {
  const child = Bun.spawn(['git', 'show', `${archive}:${path}`], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [text, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit !== 0 || !text.trim())
    throw new Error(
      `Cannot restore ${name} notice. Fetch pinned repository history (${archive}). ${error.trim()}`,
    );
  sections.push(`${name}\n\n${text}`);
}
await Bun.write(join(root, 'dist/THIRD_PARTY_NOTICES.txt'), sections.join('\n\n---\n\n') + '\n');
