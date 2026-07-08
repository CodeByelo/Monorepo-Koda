import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/dev/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  server: {
    port: 5175,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    watch: {
      usePolling: true
    },
    proxy: {
      '/dev/api': {
        // Points to the Koda Remaster main backend service inside Docker network
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/dev\/api/, ''),
        ws: true
      }
    }
  },
  preview: {
    port: 5175,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/dev/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/dev\/api/, ''),
        ws: true
      }
    }
  }
});
