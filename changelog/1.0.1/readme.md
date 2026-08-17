# Shikitor 1.0.1

This patch fixes the published `dsh-shikitor` browser entry for the DeepSeek
Harness module loader.

- Build the DSH client as one self-contained `dist/client.js` file.
- Reuse the package's bounded Shiki language and theme facade instead of
  emitting hundreds of runtime chunks.
- Fail the build if the client entry contains a relative `require()` or an
  additional JavaScript chunk.
- Run release scripts through pnpm workspace filters so publish arguments are
  forwarded correctly.
