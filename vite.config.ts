import { defineConfig } from 'vite';

export default defineConfig({
  base: '/try-rpg/',
  server: { port: 5173, open: false },
  build: { target: 'es2020' },
});
