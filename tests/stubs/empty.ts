// Stub vazio para os marcadores `server-only` / `client-only` do Next.js.
// Esses pacotes existem só para barrar imports no bundle errado; no ambiente
// de teste (vitest, node) eles não resolvem via exports map, então apontamos
// para este módulo vazio. Ver vitest.config.ts.
export {};
