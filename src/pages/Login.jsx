import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, ExternalLink, Sun, Moon, Monitor, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useApiMessage } from '../hooks/useApi'
import { LANGUAGES, LANG_KEY } from '../i18n'
import { Button, Input, Segmented } from '../components/ui'
import { Logo } from '../components/Logo'

const API_KEYS_URL = 'https://seller.uzum.uz/seller/api-keys'

export default function Login() {
  const { t, i18n } = useTranslation()
  const { login } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const message = useApiMessage()

  const [token, setTokenValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const changeLang = (code) => {
    i18n.changeLanguage(code)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* e'tiborsiz */
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const value = token.trim()
    if (!value) {
      setError(t('auth.emptyToken'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const shops = await login(value)
      toast.success(t('auth.success'), { title: t('settings.connectionOk', { count: shops.length }) })
    } catch (err) {
      const isAuth = err?.status === 401 || err?.status === 403
      setError(isAuth ? t('auth.invalidToken') : message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-app relative min-h-screen">
      {/* Fon — yumshoq brend gradienti */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-40"
        style={{
          background:
            'radial-gradient(60rem 30rem at 12% -8%, var(--color-brand-200), transparent 60%), radial-gradient(45rem 25rem at 95% 10%, var(--color-brand-100), transparent 55%)',
        }}
        aria-hidden
      />

      {/* Yuqori o'ng burchak: til va mavzu */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Segmented
          size="sm"
          ariaLabel={t('lang.label')}
          value={i18n.resolvedLanguage}
          onChange={changeLang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.short, title: l.label }))}
        />
        <Segmented
          size="sm"
          ariaLabel={t('theme.label')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: '', icon: Sun, title: t('theme.light') },
            { value: 'dark', label: '', icon: Moon, title: t('theme.dark') },
            { value: 'system', label: '', icon: Monitor, title: t('theme.system') },
          ]}
        />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-5 py-16 lg:grid-cols-[1fr_26rem]">
        {/* Chap: tavsif */}
        <div className="hidden lg:block">
          <Logo height={40} className="mb-6" />
          <h1 className="text-app text-[32px] leading-tight font-semibold tracking-[-0.02em]">{t('app.name')}</h1>
          <p className="text-muted mt-3 max-w-sm text-[15px] leading-relaxed">{t('app.tagline')} — {t('dashboard.subtitle')}</p>

          <ol className="mt-8 space-y-3">
            {['auth.step1', 'auth.step2', 'auth.step3'].map((key, i) => (
              <li key={key} className="flex items-start gap-3">
                <span className="bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
                  {i + 1}
                </span>
                <span className="text-muted text-[13.5px]">{t(key)}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* O'ng: forma */}
        <div className="bg-surface w-full rounded-2xl border p-6 shadow-pop">
          <div className="mb-5 lg:hidden">
            <Logo height={30} />
          </div>

          <h2 className="text-app text-[18px] font-semibold">{t('auth.title')}</h2>
          <p className="text-muted mt-1 text-[13.5px]">{t('auth.subtitle')}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              name="token"
              type="password"
              label={t('auth.token')}
              placeholder={t('auth.tokenPlaceholder')}
              hint={t('auth.tokenHint')}
              icon={KeyRound}
              value={token}
              onChange={(e) => {
                setTokenValue(e.target.value)
                if (error) setError(null)
              }}
              error={error}
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full" icon={busy ? undefined : ArrowRight}>
              {busy ? t('auth.checking') : t('auth.login')}
            </Button>
          </form>

          <a
            href={API_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 hover:text-brand-700 dark:text-brand-400 mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium"
          >
            {t('auth.getToken')}
            <ExternalLink size={13} />
          </a>

          <p className="text-faint mt-5 flex items-start gap-2 text-[12px] leading-relaxed">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
            {t('auth.securityNote')}
          </p>
        </div>
      </div>
    </div>
  )
}
