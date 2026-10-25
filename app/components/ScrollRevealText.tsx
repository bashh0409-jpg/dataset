"use client";

import { useEffect, useRef } from "react";

type ScrollRevealTextProps = {
  text: string;
};

const FALLBACK_START = 0.75; // used only if the page loads already scrolled down
const FINISH_DESKTOP = 0.4; // reveal done when the paragraph's bottom reaches this
const FINISH_MOBILE = 0.2;

export default function ScrollRevealText({ text }: ScrollRevealTextProps) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const characters = Array.from(text);
  const characterCount = characters.length;

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph) return;

    const spans = Array.from(
      paragraph.querySelectorAll<HTMLElement>("[data-scroll-reveal-character]"),
    );

    // Where the paragraph's top sits (in px from the viewport top) when the page is at scroll 0
    let restTop: number | null = null;

    const measure = () => {
      restTop =
        window.scrollY < 5 ? paragraph.getBoundingClientRect().top : null;
    };

    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure); // catches font loads / layout shifts
    observer.observe(paragraph);

    let frame = 0;
    let lastProgress = -1;

    const tick = () => {
      const rect = paragraph.getBoundingClientRect();
      const vh = window.innerHeight;
      const isMobile = window.innerWidth < 768;

      if (rect.bottom > -vh && rect.top < vh * 2) {
        // Reveal begins the moment the paragraph moves up from its resting position
        const startY = restTop ?? vh * FALLBACK_START;
        const finishY = vh * (isMobile ? FINISH_MOBILE : FINISH_DESKTOP);

        const distance = Math.max(1, rect.height + startY - finishY);
        const progress = Math.min(
          1,
          Math.max(0, (startY - rect.top) / distance),
        );

        if (progress !== lastProgress) {
          lastProgress = progress;
          const scaled = progress * characterCount;
          for (let i = 0; i < spans.length; i++) {
            const p = Math.min(1, Math.max(0, scaled - i));
            spans[i].style.opacity = String(0.25 + 0.75 * p);
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [characterCount]);

  return (
    <p ref={paragraphRef} aria-label={text}>
      {characters.map((character, index) => (
        <span
          key={`${index}-${character}`}
          aria-hidden="true"
          data-scroll-reveal-character
          style={{ opacity: 0.25 }}
        >
          {character}
        </span>
      ))}
    </p>
  );
}
