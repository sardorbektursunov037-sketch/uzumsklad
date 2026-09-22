/**
 * Login/parol bilan kirish — Vercel serverless funksiyasi.
 *
 * Foydalanuvchi Uzum API tokenini bilishi shart emas: login/parol to'g'ri
 * bo'lsa, server `UZUM_API_TOKEN`ni bir marta qaytaradi, brauzer uni
 * odatdagi oqim bo'yicha saqlaydi (`AuthContext.login`).
 */
import { apiError, clientIp } from './_lib/proxy.js'
import { checkCredentials, loginRateLimit } from './_lib/auth.js'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'Faqat POST qabul qilinadi'))
    return
  }

  const limit = loginRateLimit(clientIp(req))
  if (!limit.ok) {
    res.setHeader('retry-after', '300')
    res.status(429).json(apiError('RATE_LIMITED', "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring."))
    return
  }

  let body = req.body
  if (!body || typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}')
    } catch {
      body = {}
    }
  }

  const { username, password } = body || {}

  const token = process.env.UZUM_API_TOKEN || ''
  if (!token) {
    res.status(500).json(apiError('NO_SERVER_TOKEN', "Serverda UZUM_API_TOKEN sozlanmagan."))
    return
  }

  if (!checkCredentials(username, password)) {
    res.status(401).json(apiError('INVALID_CREDENTIALS', "Login yoki parol noto'g'ri."))
    return
  }

  res.status(200).json({ token })
}
