/**
 * Ilova sozlamalari — brauzer serverda token bor-yo'qligini shu yerdan biladi.
 * `server/index.js` dagi `/api/config` bilan bir xil javob qaytaradi.
 */

const API_BASE = (process.env.UZUM_API_BASE || 'https://api-seller.uzum.uz').replace(/\/+$/, '')
const API_PREFIX = process.env.UZUM_API_PREFIX || '/api/seller-openapi'

export default function handler(_req, res) {
  res.setHeader('cache-control', 'no-store')
  res.status(200).json({
    serverToken: Boolean(process.env.UZUM_API_TOKEN),
    apiBase: API_BASE + API_PREFIX,
  })
}
