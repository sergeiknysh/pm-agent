import { useEffect, useState } from 'react'

const FLASH_KEY = 'pm.flash'

export function setFlashMessage(message: string) {
  try {
    sessionStorage.setItem(FLASH_KEY, message)
  } catch {
    // ignore
  }
}

export function consumeFlashMessage(): string | null {
  try {
    const msg = sessionStorage.getItem(FLASH_KEY)
    if (msg) sessionStorage.removeItem(FLASH_KEY)
    return msg
  } catch {
    return null
  }
}

export function navigate(path: string, opts?: { replace?: boolean }) {
  if (opts?.replace) {
    window.history.replaceState({}, '', path)
  } else {
    window.history.pushState({}, '', path)
  }
  // pushState/replaceState do not trigger popstate automatically.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return path
}
