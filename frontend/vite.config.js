import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fenrir Dashboard — Vite Configuration
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
