import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/wartale-2d-web/',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
