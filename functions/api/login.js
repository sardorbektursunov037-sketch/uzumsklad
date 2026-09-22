/**
 * Login/parol bilan kirish — Cloudflare Pages Function.
 *
 * Foydalanuvchi Uzum API tokenini bilishi shart emas: login/parol to'g'ri
 * bo'lsa, server `UZUM_API_TOKEN`ni bir marta qaytaradi, brauzer uni
 * odatdagi oqim bo'yicha saqlaydi (`AuthContext.login`).
 */
import { apiError, clientIp, json } from '../_lib/proxy.js'
import { checkCredentials, loginRateLimit } from '../_lib/auth.js'

export async function onRequestPost({ request, env }) {
  const limit = loginRateLimit(clientIp(request))
  if (!limit.ok) {
    return json(apiError('RATE_LIMITED', "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring."), 429, {
      'retry-after': '300',
    })
  }

  const token = env.UZUM_API_TOKEN || ''
  if (!token) {
    return json(apiError('NO_SERVER_TOKEN', 'Serverda UZUM_API_TOKEN sozlanmagan.'), 500)
  }

  let body = {}
  try {
    body = await request.json()
  } catch {
    /* bo'sh tana ham yetarli — pastda noto'g'ri deb hisoblanadi */
  }

  const ok = await checkCredentials(body.username, body.password, env)
  if (!ok) {
    return json(apiError('INVALID_CREDENTIALS', "Login yoki parol noto'g'ri."), 401)
  }

  return json({ token })
}

export async function onRequestGet() {
  return json(apiError('METHOD_NOT_ALLOWED', 'Faqat POST qabul qilinadi'), 405)
}
