import { useCallback, useEffect, useRef, useState } from 'react'

/** Qidiruv maydonlari uchun — har harfda so'rov yubormaslik. */
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** CSS media so'rovini kuzatish (sidebar'ni mobil rejimda yig'ish uchun). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** Element tashqarisiga bosilganda chaqiriladi (dropdown yopish). */
export function useClickOutside(ref, handler, active = true) {
  const saved = useRef(handler)
  saved.current = handler

  useEffect(() => {
    if (!active) return undefined
    const onDown = (e) => {
      const el = ref.current
      if (!el || el.contains(e.target)) return
      saved.current(e)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [ref, active])
}

/** Esc bosilganda chaqiriladi. */
export function useEscape(handler, active = true) {
  const saved = useRef(handler)
  saved.current = handler

  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') saved.current(e)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])
}

/** Modal/drawer ochiq bo'lganda sahifa orqa fonda aylanmasligi uchun. */
export function useLockScroll(locked) {
  useEffect(() => {
    if (!locked) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [locked])
}

/** localStorage bilan sinxron holat. */
export function useStoredState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })

  const set = useCallback(
    (next) => {
      setState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(value))
        } catch {
          /* e'tiborsiz */
        }
        return value
      })
    },
    [key],
  )

  return [state, set]
}

/** Jadval qatorlarini tanlash (checkbox) mantiqi. */
export function useSelection(allIds = []) {
  const [selected, setSelected] = useState(() => new Set())

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }, [allIds])

  const clear = useCallback(() => setSelected(new Set()), [])

  const isSelected = useCallback((id) => selected.has(id), [selected])

  return {
    selected,
    ids: [...selected],
    count: selected.size,
    allChecked: allIds.length > 0 && selected.size === allIds.length,
    someChecked: selected.size > 0 && selected.size < allIds.length,
    toggle,
    toggleAll,
    clear,
    isSelected,
    setSelected,
  }
}
