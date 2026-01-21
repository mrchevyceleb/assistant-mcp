import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: '../server/public/admin',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/admin/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/tools': 'http://localhost:3000',
    },
  },
})
