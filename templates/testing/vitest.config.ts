import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'app/**/*.test.{ts,tsx}', 'routes/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'build'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', 'routes/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
    },
  },
});
