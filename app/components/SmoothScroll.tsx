'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function SmoothScroll() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname.startsWith('/workspace')) return

    let cancelled = false
    let destroy: (() => void) | undefined

    void import('locomotive-scroll').then(({ default: LocomotiveScroll }) => {
      if (cancelled) return

      const scroll = new LocomotiveScroll({
        scrollCallback: () => {
          window.dispatchEvent(new Event('locomotive:scroll'))
        },
      })
      destroy = () => scroll.destroy()
    })

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [pathname])

  return null
}
