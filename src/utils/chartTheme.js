/**
 * Grafiklar uchun mavzuga mos ranglar.
 *
 * Brend binafshasi (#7000ff) to'yingan — qorong'i fonda yaxshi, yorug'da esa
 * qattiq va charchatadi. Shuning uchun yorug' rejimda yumshoqroq tovlanish
 * ishlatiladi. Ranglar bitta joyda turadi: Dashboard, Sotuvlar va Foyda
 * tahlili bir xil ko'rinishda bo'lsin.
 *
 * @param {boolean} isDark
 */
export function chartTheme(isDark) {
  return isDark
    ? {
        primary: '#8b5cf6',
        primaryFill: 'rgb(139 92 246 / 0.28)',
        success: '#34d399',
        grid: '#262c3a',
        axis: '#6b7385',
        tooltip: { bg: '#14171f', border: '#262c3a', text: '#e8eaef' },
        pie: ['#8b5cf6', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#c084fc', '#94a3b8'],
      }
    : {
        primary: '#8b5cf6',
        primaryFill: 'rgb(139 92 246 / 0.18)',
        success: '#059669',
        grid: '#e3e0ee',
        axis: '#8f89a1',
        tooltip: { bg: '#ffffff', border: '#e3e0ee', text: '#171320' },
        pie: ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#64748b'],
      }
}

/** Recharts tooltip uchun tayyor uslub */
export function tooltipStyle(t) {
  return {
    background: t.tooltip.bg,
    border: `1px solid ${t.tooltip.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: t.tooltip.text,
    boxShadow: '0 8px 24px -8px rgb(43 26 82 / 0.25)',
  }
}
