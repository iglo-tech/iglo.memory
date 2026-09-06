import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const revision = '1d8ad4ca9b3dd8059ad90a75d4983776a23d44af';
export const tokenizerAssets = [
  {
    name: 'tokenizer.json',
    upstreamHash: '83cdf8c3a34f68862319cb1810ee7b1e2c0a44e0864ae930194ddb76bb7feb8d',
    compactHash: '662967645e3e0c65b1ce2109ed8fa6c758dbd468bcd0661c66fcce212e17a795',
    upstreamBytes: 11422947,
    compactBytes: 5362989,
  },
  {
    name: 'tokenizer_config.json',
    upstreamHash: '2f58f4bbd7bbce15d683f525954ef3a92cd82f5e06415a9c513859bf8ab72436',
    compactHash: '7f5d7c2892962c40495871da2b893f899b69a10d0322abc71e59c19cd0c62deb',
    upstreamBytes: 7256,
    compactBytes: 5826,
  },
] as const;
type Asset = {
  name: string;
  upstreamHash: string;
  compactHash: string;
  upstreamBytes: number;
  compactBytes: number;
};
const hash = (bytes: string | Uint8Array) =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

// Build-time only. The executable continues to import these generated files statically.
export async function ensureTokenizerAsset(
  directory: string,
  asset: Asset,
  fetchAsset: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const destination = join(directory, asset.name),
    cached = Bun.file(destination);
  if (
    (await cached.exists()) &&
    cached.size === asset.compactBytes &&
    hash(await cached.bytes()) === asset.compactHash
  )
    return 'cached';
  const response = await fetchAsset(
    `https://huggingface.co/Qwen/Qwen3-Embedding-8B/resolve/${revision}/${asset.name}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!response.ok || !response.body)
    throw new Error(`Tokenizer download failed: ${asset.name} (${response.status})`);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > asset.upstreamBytes)
        throw new Error(`Tokenizer download exceeds pinned size: ${asset.name}`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (size !== asset.upstreamBytes || hash(bytes) !== asset.upstreamHash)
    throw new Error(`Tokenizer upstream hash/size mismatch: ${asset.name}`);
  const compact =
    JSON.stringify(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) + '\n';
  if (Buffer.byteLength(compact) !== asset.compactBytes || hash(compact) !== asset.compactHash)
    throw new Error(`Tokenizer compact hash/size mismatch: ${asset.name}`);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${asset.name}.${crypto.randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o644);
  try {
    await Bun.write(Bun.file(file.fd), compact);
    await file.sync();
    await file.close();
    await rename(temporary, destination);
  } finally {
    await file.close();
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return 'downloaded';
}
if (import.meta.main) {
  const directory = resolve(dirname(import.meta.path), '../assets/tokenizers/qwen3-embedding');
  for (const asset of tokenizerAssets)
    console.log(`${asset.name}: ${await ensureTokenizerAsset(directory, asset)}`);
}
