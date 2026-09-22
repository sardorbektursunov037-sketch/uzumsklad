import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { checkCredentials, loginRateLimit } from './api/_lib/auth.js'
import { apiError, clientIp } from './api/_lib/proxy.js'

// Uzum Seller OpenAPI brauzerdan to'g'ridan-to'g'ri chaqirilganda CORS bloklaydi.
// Shuning uchun dev rejimda Vite proxy orqali so'rov yuboriladi:
//   brauzer  ->  /api/uzum/v1/shops
//   Vite     ->  https://api-seller.uzum.uz/api/seller-openapi/v1/shops

/**
 * `/api/login`ni dev-serverda ham ishlatadi — production'da bu vazifani
 * `api/login.js` (Vercel) yoki `server/index.js` (Express) bajaradi, lekin
 * `vite` dev-server ularning hech birini ishga tushirmaydi.
 */
function loginDevMiddleware(env) {
  return {
    name: 'uzum-sklad-login-dev',
    configureServer(server) {
      server.middlewares.use('/api/login', async (req, res, next) => {
        if (req.method !== 'POST') return next()

        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')

        const limit = loginRateLimit(clientIp(req))
        if (!limit.ok) {
          res.setHeader('retry-after', '300')
          res.statusCode = 429
          res.end(JSON.stringify(apiError('RATE_LIMITED', "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.")))
          return
        }

        const token = env.UZUM_API_TOKEN || ''
        if (!token) {
          res.statusCode = 500
          res.end(JSON.stringify(apiError('NO_SERVER_TOKEN', "Serverda UZUM_API_TOKEN sozlanmagan.")))
          return
        }

        let raw = ''
        for await (const chunk of req) raw += chunk
        let body = {}
        try {
          body = JSON.parse(raw || '{}')
        } catch {
          /* bo'sh tana ham yetarli — pastda noto'g'ri deb hisoblanadi */
        }

        const ok = checkCredentials(body.username, body.password, {
          expectedUser: env.APP_LOGIN,
          expectedPass: env.APP_PASSWORD,
        })
        if (!ok) {
          res.statusCode = 401
          res.end(JSON.stringify(apiError('INVALID_CREDENTIALS', "Login yoki parol noto'g'ri.")))
          return
        }

        res.statusCode = 200
        res.end(JSON.stringify({ token }))
      })

      // Settings sahifasi shu orqali xom tokenni ko'rsatish/tahrirlashni yashiradi
      server.middlewares.use('/api/config', (req, res, next) => {
        if (req.method !== 'GET') return next()
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.statusCode = 200
        res.end(
          JSON.stringify({
            serverToken: Boolean(env.UZUM_API_TOKEN),
            apiBase: (env.UZUM_API_BASE || 'https://api-seller.uzum.uz') + (env.UZUM_API_PREFIX || '/api/seller-openapi'),
          }),
        )
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.UZUM_API_BASE || 'https://api-seller.uzum.uz'
  const prefix = env.UZUM_API_PREFIX || '/api/seller-openapi'

  return {
    base: '/',
    plugins: [react(), tailwindcss(), loginDevMiddleware(env)],
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
