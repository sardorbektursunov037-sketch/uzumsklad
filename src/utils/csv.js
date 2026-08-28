import { downloadBlob } from './format'

/**
 * Qatorlarni CSV ga aylantirib yuklab beradi.
 *
 * Excel CSV ni vergul bilan emas, nuqtali vergul bilan kutadi (rus/o'zbek
 * lokalida), shuning uchun ajratgich sifatida `;` ishlatiladi. BOM qo'shamiz —
 * aks holda Excel kirilcha va o'zbekcha harflarni buzib ko'rsatadi.
 *
 * @param {Array<object>} rows
 * @param {Array<{key: string, header: string, value?: (row) => any}>} columns
 * @param {string} filename
 */
export function exportCsv(rows, columns, filename = 'export.csv') {
  const sep = ';'

  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    // Raqamlarda o'nlik ajratgich vergul bo'lsa, katak ichida qolishi uchun qo'shtirnoq
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const head = columns.map((c) => escape(c.header)).join(sep)
  const body = rows
    .map((row) => columns.map((c) => escape(c.value ? c.value(row) : row[c.key])).join(sep))
    .join('\r\n')

  const blob = new Blob([`\uFEFF${head}\r\n${body}`], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

/** CSV uchun son — Excel o'nlik ajratgichi sifatida vergulni kutadi */
export const csvNum = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '' : String(v).replace('.', ','))
