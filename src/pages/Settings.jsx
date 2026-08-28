import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Plug,
  Store,
  Check,
  ExternalLink,
  Palette,
  Info,
  Rows3,
  Rows4,
} from 'lucide-react'

import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAction, useApiMessage } from '../hooks/useApi'
import { getShops } from '../api/endpoints'
import { setToken as persistToken } from '../api/client'
import { LANGUAGES, LANG_KEY } from '../i18n'
import { cx } from '../utils/format'
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Segmented,
  Switch,
  Badge,
  Field,
  FieldGrid,
  EmptyState,
} from '../components/ui'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'
import { ApiHealthCheck } from '../components/ApiHealthCheck'

const API_KEYS_URL = 'https://seller.uzum.uz/seller/api-keys'
const SWAGGER_URL = 'https://api-seller.uzum.uz/api/seller-openapi/swagger/swagger-ui/webjars/swagger-ui/index.html'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme, density, setDensity, devMode, setDevMode } = useTheme()
  const { shops, activeShopId, setActiveShopId, reloadShops, serverToken, token } = useAuth()
  const toast = useToast()
  const message = useApiMessage()

  const [newToken, setNewToken] = useState('')
  const [testResult, setTestResult] = useState(null)

  const changeLang = (code) => {
    i18n.changeLanguage(code)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* e'tiborsiz */
    }
  }

  const testAction = useAction(async () => {
    setTestResult(null)
    const list = await getShops()
    setTestResult({ ok: true, count: Array.isArray(list) ? list.length : 0 })
    reloadShops()
  })

  const saveToken = useAction(async () => {
    const value = newToken.trim()
    if (!value) return
    persistToken(value)
    try {
      await getShops()
      toast.success(t('settings.tokenSaved'))
      setNewToken('')
      reloadShops()
    } catch (err) {
      persistToken(token) // eski tokenni tiklaymiz
      throw err
    }
  })

  const maskedToken = token ? `${token.slice(0, 6)}${'•'.repeat(Math.max(0, Math.min(24, token.length - 10)))}${token.slice(-4)}` : ''

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <DevSource
        className="mb-4"
        sources={[
          { path: '/v1/shops', count: shops.length, note: "OrganizationDto — do'konlar ro'yxati" },
          { path: '/api/config', note: "Ilova serveri: tokenning .env da bor-yo'qligi" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── Ko'rinish ────────────────────────────────────────── */}
        <Card>
          <CardHeader title={t('settings.appearance')} subtitle={t('settings.appearanceHint')} />

          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-app flex items-center gap-2 text-[13.5px] font-medium">
                <Palette size={15} className="text-muted" aria-hidden />
                {t('theme.label')}
              </span>
              <Segmented
                value={theme}
                onChange={setTheme}
                ariaLabel={t('theme.label')}
                options={[
                  { value: 'light', label: t('theme.light'), icon: Sun },
                  { value: 'dark', label: t('theme.dark'), icon: Moon },
                  { value: 'system', label: t('theme.system'), icon: Monitor },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-app text-[13.5px] font-medium">{t('lang.label')}</span>
              <Segmented
                value={i18n.resolvedLanguage}
                onChange={changeLang}
                ariaLabel={t('lang.label')}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="text-app block text-[13.5px] font-medium">{t('dev.label')}</span>
                <span className="text-faint block text-[12px]">{t('dev.hint')}</span>
              </span>
              <Switch checked={devMode} onChange={setDevMode} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-app text-[13.5px] font-medium">{t('settings.density')}</span>
              <Segmented
                value={density}
                onChange={setDensity}
                ariaLabel={t('settings.density')}
                options={[
                  { value: 'comfortable', label: t('settings.densityComfortable'), icon: Rows3 },
                  { value: 'compact', label: t('settings.densityCompact'), icon: Rows4 },
                ]}
              />
            </div>
          </div>
        </Card>

        {/* ── Ulanish ──────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title={t('settings.connection')}
            subtitle={t('settings.connectionHint')}
            action={
              <Button size="sm" variant="secondary" icon={Plug} onClick={() => testAction.run().catch((e) => {
                setTestResult({ ok: false, message: message(e) })
              })} loading={testAction.pending}>
                {t('settings.testConnection')}
              </Button>
            }
          />

          <div className="mt-5 space-y-4">
            {serverToken ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40">
                <Check size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <p className="text-[13px] text-emerald-800 dark:text-emerald-300">{t('auth.serverToken')}</p>
              </div>
            ) : (
              <>
                <Field label={t('auth.token')}>
                  <span className="font-mono text-[12.5px] break-all">{maskedToken || '—'}</span>
                </Field>

                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    type="password"
                    label={t('settings.changeToken')}
                    placeholder={t('auth.tokenPlaceholder')}
                    icon={KeyRound}
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    wrapperClassName="min-w-[16rem] flex-1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    variant="primary"
                    onClick={() => saveToken.run().catch((e) => toast.error(message(e)))}
                    loading={saveToken.pending}
                    disabled={!newToken.trim()}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </>
            )}

            {testResult && (
              <div
                className={cx(
                  'rounded-lg p-3 text-[13px]',
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
                )}
              >
                {testResult.ok
                  ? t('settings.connectionOk', { count: testResult.count })
                  : `${t('settings.connectionFail')}: ${testResult.message}`}
              </div>
            )}

            <a
              href={API_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 inline-flex items-center gap-1.5 text-[13px] font-medium"
            >
              {t('auth.getToken')}
              <ExternalLink size={13} />
            </a>
          </div>
        </Card>

        {/* ── Do'konlar ────────────────────────────────────────── */}
        <Card>
          <CardHeader title={t('settings.shops')} subtitle={t('settings.shopsHint')} />
          <div className="mt-4">
            {shops.length === 0 ? (
              <EmptyState compact icon={Store} title={t('common.noData')} hint={null} />
            ) : (
              <ul className="space-y-2">
                {shops.map((s) => {
                  const active = s.id === activeShopId
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActiveShopId(s.id)}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                          active ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30' : 'hover:bg-surface-hover',
                        )}
                      >
                        <span className="bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 grid size-9 shrink-0 place-items-center rounded-lg">
                          <Store size={16} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-app truncate text-[13.5px] font-medium">{s.name || `#${s.id}`}</p>
                          <p className="text-faint font-mono text-[11.5px]">ID {s.id}</p>
                        </div>
                        {active && <Badge tone="info" size="sm">{t('settings.activeShop')}</Badge>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {shops.length > 0 && <DataViewer data={shops} className="mt-4" />}
          </div>
        </Card>

        {/* ── API tekshiruvi ───────────────────────────────────── */}
        <div className="xl:col-span-2">
          <ApiHealthCheck />
        </div>

        {/* ── Ilova haqida ─────────────────────────────────────── */}
        <Card>
          <CardHeader title={t('settings.about')} />
          <div className="mt-4">
            <FieldGrid cols={2}>
              <Field label={t('settings.version')}>1.0.0</Field>
              <Field label={t('settings.apiVersion')}>Uzum seller OpenAPI 1.0.0</Field>
              <Field label={t('settings.endpoints')}>38</Field>
              <Field label={t('settings.apiBase')} mono>
                api-seller.uzum.uz
              </Field>
            </FieldGrid>

            <a
              href={SWAGGER_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium"
            >
              {t('settings.sourceSpec')}
              <ExternalLink size={13} />
            </a>

            <p className="text-faint mt-4 flex items-start gap-2 text-[12px] leading-relaxed">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t('auth.securityNote')}
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
