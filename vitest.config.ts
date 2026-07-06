import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Testes unitários de funções puras (helpers). Não sobem Next nem tocam o banco.
// E2E (Playwright) ficam em tests/e2e e não são incluídos aqui.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
