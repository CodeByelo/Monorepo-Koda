import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/facturacion/',
  plugins: [
    react(),
    tsconfigPaths()
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  build: {
    minify: 'esbuild',
    // Umbral para inline de assets pequeños (iconos SVG, etc.)
    assetsInlineLimit: 4096,
    // CSS splitting por chunk
    cssCodeSplit: true,
    // Chunk splitting manual por área funcional
    rollupOptions: {
      output: {
        manualChunks: {
          // Librerías base de React (cambian poco → cache largo)
          'vendor-react': ['react', 'react-dom'],
          // Router
          'vendor-router': ['react-router-dom'],
          // Gráficos (recharts es pesado)
          'vendor-charts': ['recharts'],
          // Iconos (lucide-react es grande)
          'vendor-icons': ['lucide-react'],
        }
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    // Permite acceso desde hosts externos (Tailscale, proxy local, etc.)
    allowedHosts: true,
    proxy: {
      '/api/dev/ws': {
        target: 'http://backend:8000/dev/ws',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/dev\/ws/, '')
      },
      '/api/session/connect': {
        target: 'http://backend:8000',
        changeOrigin: true,
        ws: true
      },
      '/api-facturacion': {
        target: 'http://facturacion-backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-facturacion/, ''),
        ws: true
      },
      '/telegram-api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/telegram-api/, '/webhook/telegram')
      },
      '/api': {
        target: 'http://facturacion-backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true
      }
    }
  }
})
