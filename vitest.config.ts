import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Testes unitários de funções puras (helpers). Não sobem Next nem tocam o banco.
// E2E (Playwright) ficam em tests/e2e e não são incluídos aqui.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only`/`client-only` são marcadores do Next que não resolvem no
      // ambiente node do vitest; apontamos para um módulo vazio para permitir
      // testar as funções puras dos módulos que os importam (ex.: lib/enrichment).
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
