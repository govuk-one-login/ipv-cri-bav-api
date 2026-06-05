import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['./**/*.ts'],
      exclude: [
        './**/tests/**/*.ts',
        './tests/**/*.ts',
        './vitest.config.ts',
        'config.ts',
      ],
    },
    include: ['**/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
