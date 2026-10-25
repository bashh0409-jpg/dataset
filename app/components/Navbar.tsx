'use client'

import { useEffect, useRef, useState } from 'react'


type NavTheme = 'blue' | 'white' | 'black'

const themeClasses: Record<NavTheme, string> = {
  blue: 'bg-[#202ded] text-white',
  white: 'bg-white text-[#202ded]',
  black: 'bg-black text-white',
}

const Navbar = () => {
  const [theme, setTheme] = useState<NavTheme>('blue')
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let frame = 0

    const updateTheme = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const probeY = window.scrollY + (navRef.current?.offsetHeight ?? 0) / 2
        const sections = document.querySelectorAll<HTMLElement>('[data-nav-theme]')

        for (const section of sections) {
          const top = section.getBoundingClientRect().top + window.scrollY
          const bottom = top + section.offsetHeight

          if (probeY >= top && probeY < bottom) {
            const nextTheme = section.dataset.navTheme
            if (nextTheme === 'blue' || nextTheme === 'white' || nextTheme === 'black') {
              setTheme(nextTheme)
            }
            return
          }
        }
      })
    }

    updateTheme()
    window.addEventListener('scroll', updateTheme, { passive: true })
    window.addEventListener('resize', updateTheme)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', updateTheme)
      window.removeEventListener('resize', updateTheme)
    }
  }, [])

  return (
    <nav
      ref={navRef}
      aria-label="Main navigation"
      className={`flex items-center fixed top-0 z-50 justify-between w-full tracking-tigh font-medium p-4 capitalize transition-colors duration-300 ${themeClasses[theme]}`}
    >
      <p>Majority®</p>
     
      <p className="hidden md:block">Version 0.1</p>
      <a
        href="/documentation"
        target="_blank"
        className="cursor-pointer flex items-center gap-1 hover:underline"
      >
        Documentation{" "}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="18px"
          viewBox="0 -960 960 960"
          width="18px"
          fill="currentColor"
        >
          <path d="M212.31-140Q182-140 161-161q-21-21-21-51.31v-535.38Q140-778 161-799q21-21 51.31-21h252.3v60h-252.3q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v535.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85h535.38q4.62 0 8.46-3.85 3.85-3.84 3.85-8.46v-252.3h60v252.3Q820-182 799-161q-21 21-51.31 21H212.31Zm176.46-206.62-42.15-42.15L717.85-760H560v-60h260v260h-60v-157.85L388.77-346.62Z" />
        </svg>
      </a>
      <p className="hidden md:block">©2026</p>
    </nav>
  );
}

export default Navbar