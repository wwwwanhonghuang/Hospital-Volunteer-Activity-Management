// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  // Keep separately licensed creative content as replaceable resource files.
  build: { target: 'es2022', assetsInlineLimit: 0, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
