import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules', 'coverage'] },

  // Brauzer kodi (src)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // JSX transform React 17+ da avtomatik — import shart emas
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // Bu loyihada TypeScript yo'q, propTypes o'rniga JSDoc ishlatiladi
      'react/prop-types': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Context fayllari Provider komponenti bilan birga hook ham eksport qiladi —
  // bu React uchun odatiy naqsh, lekin Fast Refresh qoidasi buni ogohlantiradi.
  {
    files: ['src/context/**/*.jsx', 'src/i18n/index.js'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Node kodi (proxy server, vite konfiguratsiyasi)
  {
    files: ['server/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: { sourceType: 'module' },
    },
    rules: js.configs.recommended.rules,
  },
]
