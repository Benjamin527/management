import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
    test: { environment: 'jsdom' },
  }
})
