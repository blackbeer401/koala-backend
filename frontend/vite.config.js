import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { setDefaultResultOrder } from 'node:dns'
import os from 'node:os'
import path from 'node:path'

// Bind the localhost dev server to IPv4 first so its IP alias can be redirected.
setDefaultResultOrder('ipv4first')

function canonicalLocalHost() {
  return {
    name: 'koala-canonical-localhost',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const host = request.headers.host ?? ''
        if (!/^127\.0\.0\.1(?::\d+)?$/i.test(host)) return next()

        // Kakao JS keys are allow-listed by web domain. Canonicalize the local
        // IP alias before loading the app so the browser keeps one map origin.
        const port = host.split(':')[1] ?? '5173'
        response.statusCode = 302
        response.setHeader('Location', `http://localhost:${port}${request.url ?? '/'}`)
        response.end()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [canonicalLocalHost(), react()],
  // Keep Vite's generated cache outside node_modules. On Windows the running
  // dev server can leave node_modules/.vite locked during a restart.
  cacheDir: path.join(os.tmpdir(), 'koala-vite-cache'),
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // Quick Tunnel 도메인은 실행할 때마다 바뀌므로 외부 테스트를 위해 허용합니다.
    allowedHosts: true,
    // Cloudflare Quick Tunnel에서는 Vite HMR WebSocket이 실패하므로 외부 테스트 시 비활성화합니다.
    hmr: false,
    // 휴대폰 요청은 프론트 터널 하나로 받고, API만 로컬 백엔드로 전달합니다.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
