import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3013,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5679',
        changeOrigin: true
      },
      '/static': {
        target: 'http://127.0.0.1:5679',
        changeOrigin: true
      }
    }
  }
})
