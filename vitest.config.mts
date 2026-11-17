import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": at("./src"),
      // The guard package throws outside React Server Components; tests run plain Node.
      "server-only": at("./tests/server-only-stub.ts"),
    },
  },
  test: {
    // Logic tests run in Node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` comment at the top of the file.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
