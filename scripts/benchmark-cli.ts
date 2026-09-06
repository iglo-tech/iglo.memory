// Test executable only: production CLI and transport with a controlled query
// response. Never included by scripts/build.sh or the product launcher.
const dimensions = Number(process.env.IGLO_BENCH_DIMENSIONS);
const vector = Array.from({ length: dimensions }, (_, i) => Math.fround(((i % 11) - 5) / 6));
globalThis.fetch = Object.assign(
  async (url: string | URL | Request) =>
    String(url).endsWith('/chat/completions')
      ? Response.json({
          model: 'openai/gpt-5.6-luna',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({ lex: [], vec: [], hyde: [] }),
              },
            },
          ],
        })
      : Response.json({ data: [{ index: 0, embedding: vector }] }),
  { preconnect: () => {} },
);
await import('@/src/cli');
export {};
