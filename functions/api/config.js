/**
 * Ilova sozlamalari — Cloudflare Pages Function.
 * `api/config.js` (Vercel) bilan bir xil javob qaytaradi.
 */
import { apiBase, apiPrefix, json } from '../_lib/proxy.js'

export async function onRequestGet({ env }) {
  return json({
    serverToken: Boolean(env.UZUM_API_TOKEN),
    apiBase: apiBase(env) + apiPrefix(env),
  })
}
