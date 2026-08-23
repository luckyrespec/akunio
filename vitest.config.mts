import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
    // Integration files share one Postgres and TRUNCATE it in before/afterAll;
    // parallel workers would truncate out from under each other.
    fileParallelism: false,
  },
});
