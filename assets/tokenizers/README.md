# Bundled tokenizers

`qwen3-embedding/tokenizer.json`, `tokenizer_config.json` and `LICENSE` are from
Qwen/Qwen3-Embedding-8B revision `1d8ad4ca9b3dd8059ad90a75d4983776a23d44af`:
https://huggingface.co/Qwen/Qwen3-Embedding-8B/tree/1d8ad4ca9b3dd8059ad90a75d4983776a23d44af

The JSON files are immutable upstream assets, excluded from formatting. Their
SHA-256 hashes and counting contracts are recorded in
`docs/specs/retrieval-v2-qwen-token-contract.md`. This is tokenizer data, not model
weights. The same licensed vocabulary is reused with a different postprocessor
for the pinned Voyage counting profile; no second vocabulary is bundled.

`LICENSE.tokenizers-js` preserves the Apache-2.0 license for the JavaScript
runtime dependency `@huggingface/tokenizers` 0.1.3.
