import { useTheme } from '../context/ThemeContext'
import { cx } from '../utils/format'

/**
 * Uzum Sellers logotipi.
 *
 * Asl logotipdagi so'z belgisi oq rangda — u faqat qorong'i fonda ko'rinadi.
 * Shuning uchun yorug' mavzu uchun matni to'q rangga bo'yalgan nusxa ishlatiladi.
 *
 * @param {'full'|'mark'} [variant] to'liq logotip yoki faqat belgi
 * @param {number} [height] piksellarda balandlik
 */
export function Logo({ variant = 'full', height = 24, className }) {
  const { isDark } = useTheme()

  const src =
    variant === 'mark' ? '/uzum-mark.svg' : isDark ? '/uzum-logo.svg' : '/uzum-logo-light.svg'

  return (
    <img
      src={src}
      alt="Uzum Sellers"
      height={height}
      style={{ height, width: 'auto' }}
      className={cx('shrink-0 select-none', className)}
      draggable={false}
    />
  )
}
