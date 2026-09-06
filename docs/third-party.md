# Third-party license record

Checked and accepted for the listed versions and uses on 2026-09-06. Do not reopen
this review unless a dependency, its license, or our use/distribution changes.
This is a record of the checked components, not a perpetual blanket clearance.

| Component                  | Checked version / revision                 | License           | Use                                                                  |
| -------------------------- | ------------------------------------------ | ----------------- | -------------------------------------------------------------------- |
| Qwen tokenizer data        | `1d8ad4ca9b3dd8059ad90a75d4983776a23d44af` | Apache-2.0        | Embedded vocabulary, compacted; Voyage postprocessor derived locally |
| Hugging Face JS tokenizers | 0.1.3                                      | Apache-2.0        | Embedded tokenizer implementation                                    |
| js-tiktoken                | 1.0.21                                     | MIT               | Embedded OpenAI-compatible counting                                  |
| base64-js                  | 1.5.1                                      | MIT               | js-tiktoken dependency                                               |
| Fastify documentation      | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | MIT               | Evaluation corpus only                                               |
| uv documentation           | `8473ecba11664c70628d776c44f60afefee0b49f` | MIT OR Apache-2.0 | Evaluation corpus only                                               |
| iglo documentation         | `9670f625661e46935ec1523bb70c6dd8b35d48e4` | No license at pin | User-owned local evaluation; not an externally licensed corpus       |

Full license copies are generated artifacts, not maintained source files.
`scripts/build.sh` restores the four tokenizer component notices from immutable
repository commit `005b7a2771c7f756ea652a45cb59e7bca8cc26e7` into ignored
`dist/THIRD_PARTY_NOTICES.txt`. Keep this file with distributions of `dist/iglo.mem`;
a summary or a URL does not replace required license text. Builds need Git and
that historical commit available, including in shallow checkouts. Preserve the
commit or replace it with a pinned archive before rewriting repository history.

Corpus materialization already retrieves and hash-checks Fastify/uv notices from
the pinned upstream checkouts into the evaluation directory. Duplicate copies
are unnecessary here. Other toolchain/runtime dependencies remain governed by
their own notices; this table records the components reviewed for this cleanup.

Terms: [MIT](https://opensource.org/license/mit) and
[Apache-2.0 redistribution conditions](https://www.apache.org/licenses/LICENSE-2.0#redistribution).
