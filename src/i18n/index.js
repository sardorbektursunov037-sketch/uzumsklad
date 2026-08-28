import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import uz from './locales/uz.json'
import ru from './locales/ru.json'
import en from './locales/en.json'

export const LANGUAGES = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ', flag: 'UZ' },
  { code: 'ru', label: 'Русский', short: 'RU', flag: 'RU' },
  { code: 'en', label: 'English', short: 'EN', flag: 'EN' },
]

export const LANG_KEY = 'uzum.lang'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uz: { translation: uz },
      ru: { translation: ru },
      en: { translation: en },
    },
    fallbackLng: 'uz',
    supportedLngs: ['uz', 'ru', 'en'],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

// <html lang> ni tilga moslab turamiz — skrinrider va brauzer uchun muhim
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
