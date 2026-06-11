import { useEffect, useState } from 'react'

// Detects whether the according to Chrome extension is installed. The
// extension's content script (extension/content/detect.js) runs at
// document_start on our own origins and sets `data-ig-extension="1"` on <html>.
//
// Returns: undefined while still checking, true/false once known. We poll
// briefly because, although the content script runs before the page scripts,
// we don't want a single race to produce a false "not installed".
export function useExtensionInstalled(): boolean | undefined {
  const [installed, setInstalled] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const present = () =>
      document.documentElement.getAttribute('data-ig-extension') === '1'

    if (present()) {
      setInstalled(true)
      return
    }

    let tries = 0
    const id = setInterval(() => {
      if (present()) {
        setInstalled(true)
        clearInterval(id)
      } else if (++tries >= 8) {
        setInstalled(false)
        clearInterval(id)
      }
    }, 150)
    return () => clearInterval(id)
  }, [])

  return installed
}
