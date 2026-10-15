import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,          // 0.0.0.0 — プレビュー環境から到達できるように
    port: 5173,
    strictPort: true,
    allowedHosts: true,  // プレビューのプロキシホストを許可
    headers: {
      // 埋め込み iframe からの利用を妨げない
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
