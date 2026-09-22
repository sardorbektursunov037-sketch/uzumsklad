import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Lock, Sun, Moon, Monitor, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useApiMessage } from '../hooks/useApi'
import { LANGUAGES, LANG_KEY } from '../i18n'
import { Button, Input, Segmented } from '../components/ui'
import { Logo } from '../components/Logo'

export default function Login() {
  const { t, i18n } = useTranslation()
  const { loginWithCredentials } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const message = useApiMessage()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
    if (!username.trim() || !password) {
      setError(t('auth.emptyCredentials'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const shops = await loginWithCredentials(username.trim(), password)
      toast.success(t('auth.success'), { title: t('settings.connectionOk', { count: shops.length }) })
    } catch (err) {
      const isAuth = err?.status === 401 || err?.status === 403
      setError(isAuth ? t('auth.invalidCredentials') : message(err))
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
              name="username"
              type="text"
              label={t('auth.username')}
              placeholder={t('auth.usernamePlaceholder')}
              icon={User}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (error) setError(null)
              }}
              autoComplete="username"
              autoFocus
              spellCheck={false}
            />

            <Input
              name="password"
              type="password"
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              icon={Lock}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              error={error}
              autoComplete="current-password"
              spellCheck={false}
            />

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full" icon={busy ? undefined : ArrowRight}>
              {busy ? t('auth.checking') : t('auth.login')}
            </Button>
          </form>

          <p className="text-faint mt-5 flex items-start gap-2 text-[12px] leading-relaxed">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
            {t('auth.loginSecurityNote')}
          </p>
        </div>
      </div>
    </div>
  )
}
