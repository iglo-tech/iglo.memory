import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureTokenizerAsset } from '@/scripts/tokenizer-assets';

const upstream = '{\n  "vocabulary": ["word", "😀"]\n}\n';
const compact = JSON.stringify(JSON.parse(upstream)) + '\n';
const hash = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
const asset = {
  name: 'tokenizer.json',
  upstreamHash: hash(upstream),
  compactHash: hash(compact),
  upstreamBytes: Buffer.byteLength(upstream),
  compactBytes: Buffer.byteLength(compact),
};
async function temporary(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'iglo-tokenizer-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('verified tokenizer cache needs no network and corrupt bytes trigger pinned replacement', async () => {
  await temporary(async (directory) => {
    const path = join(directory, asset.name);
    await Bun.write(path, compact);
    expect(
      await ensureTokenizerAsset(directory, asset, async () => {
        throw new Error('Network forbidden');
      }),
    ).toBe('cached');
    // Same-size corruption must still be detected by the compact digest.
    await Bun.write(path, compact.replace('word', 'fake'));
    expect(
      await ensureTokenizerAsset(directory, asset, async (url, init) => {
        expect(url).toBe(
          'https://huggingface.co/Qwen/Qwen3-Embedding-8B/resolve/1d8ad4ca9b3dd8059ad90a75d4983776a23d44af/tokenizer.json',
        );
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return new Response(upstream);
      }),
    ).toBe('downloaded');
    expect(await Bun.file(path).text()).toBe(compact);
    expect(await readdir(directory)).toEqual([asset.name]);
  });
});

test('wrong upstream or compact hashes never publish a tokenizer', async () => {
  await temporary(async (directory) => {
    await expect(
      ensureTokenizerAsset(
        directory,
        asset,
        async () => new Response(upstream.replace('word', 'fake')),
      ),
    ).rejects.toThrow('upstream hash/size mismatch');
    await expect(
      ensureTokenizerAsset(
        directory,
        { ...asset, compactHash: hash('wrong') },
        async () => new Response(upstream),
      ),
    ).rejects.toThrow('compact hash/size mismatch');
    expect(await readdir(directory)).toEqual([]);
  });
});

test('oversized, truncated, and interrupted downloads leave existing cache bytes intact', async () => {
  await temporary(async (directory) => {
    const path = join(directory, asset.name);
    await Bun.write(path, 'old corrupt cache');
    for (const fetcher of [
      async () => new Response(upstream + 'extra'),
      async () => new Response(upstream.slice(0, -3)),
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{'));
            },
            pull(controller) {
              controller.error(new Error('Connection interrupted'));
            },
          }),
        ),
      async () => new Response('unavailable', { status: 503 }),
    ]) {
      await expect(ensureTokenizerAsset(directory, asset, fetcher)).rejects.toThrow();
      expect(await Bun.file(path).text()).toBe('old corrupt cache');
      expect(await readdir(directory)).toEqual([asset.name]);
    }
  });
});
