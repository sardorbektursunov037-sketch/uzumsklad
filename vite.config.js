import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Uzum Seller OpenAPI brauzerdan to'g'ridan-to'g'ri chaqirilganda CORS bloklaydi.
// Shuning uchun dev rejimda Vite proxy orqali so'rov yuboriladi:
//   brauzer  ->  /api/uzum/v1/shops
//   Vite     ->  https://api-seller.uzum.uz/api/seller-openapi/v1/shops
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.UZUM_API_BASE || 'https://api-seller.uzum.uz'
  const prefix = env.UZUM_API_PREFIX || '/api/seller-openapi'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.PORT_DEV || 5173),
      proxy: {
        '/api/uzum': {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/uzum/, prefix),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Brauzer tokenni X-Uzum-Token sarlavhasida yuboradi.
              // Uzum esa uni Authorization sarlavhasida kutadi (Bearer prefiksisiz).
              const token = req.headers['x-uzum-token'] || env.UZUM_API_TOKEN
              if (token) proxyReq.setHeader('Authorization', token)
              proxyReq.removeHeader('x-uzum-token')
              proxyReq.removeHeader('cookie')
            })
          },
        },
      },
    },
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
  }
})
