import React from "react";
import ScrollRevealText from "./ScrollRevealText";

const Hero = () => {
  return (
    <div
      data-nav-theme="blue"
      className="grid min-h-svh w-full grid-cols-1 grid-rows-[1fr_auto] bg-[#202ded] p-4 pt-20 text-white md:grid-cols-2 md:p-6 md:pt-20"
    >
      {/* Content: centered in the free space on mobile, right column on desktop */}
      <section className="flex flex-col h-full justify-center gap-10 md:col-start-2 md:py-4">
        <div className="flex flex-col items-start gap-4 md:gap-6">
          <div className="flex h-12 w-12 items-center justify-center bg-white text-2xl font-semibold text-[#202ded] md:h-20 md:w-20 md:text-5xl">
            SD
          </div>

          <h1 className="font-[family-name:var(--font-pp-locomotive),sans-serif] text-[length:clamp(3rem,14vw,8rem)] leading-[0.9] tracking-[-0.03em] text-white capitalize md:text-[length:clamp(3rem,7vw,7.5rem)]">
            Synthetic data
            <sup className="align-super text-[0.4em]">®</sup>
            <br />
            for developers
          </h1>
        </div>
      </section>

      {/* Bottom bar: buttons left, version right */}
      <div className="mt-10 grid grid-cols-2 items-end gap-6 md:col-span-2 md:mt-0">
        <a
          href="/documentation"
          className="md:flex hidden w-fit items-center gap-3 rounded bg-white px-4 py-4 font-medium text-[#202ded]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="18px"
            viewBox="0 -960 960 960"
            width="18px"
            fill="currentColor"
          >
            <path d="M302.31-100q-50.69 0-86.5-35.81T180-222.31V-730q0-54.15 37.92-92.08Q255.85-860 310-860h470v575.38q-25.77 0-44.04 18.27t-18.27 44.04q0 25.77 18.27 44.04T780-160v60H302.31ZM240-326.23q13.62-9.31 29.19-13.85 15.58-4.53 33.12-4.53h25.38V-800H310q-28.85 0-49.42 20.58Q240-758.85 240-730v403.77Zm147.69-18.38H720V-800H387.69v455.39ZM240-326.23v-466.08 466.08ZM302.31-160h373.77q-8.7-13.62-13.54-28.88-4.85-15.27-4.85-33.43 0-17.15 4.54-32.92 4.54-15.77 13.85-29.39H302.31q-26.77 0-44.54 18.27T240-222.31q0 26.77 17.77 44.54T302.31-160Z" />
          </svg>
          Read Documentation
        </a>

        <div className="col-span-2 max-w-[18rem] text-lg font-medium leading-tight md:col-span-1 md:max-w-sm md:text-xl">
          <ScrollRevealText text="Generate realistic synthetic data for modern applications. Define schemas, create connected datasets, and export test data in seconds." />
          <a
            href="/documentation"
            className="flex w-fit items-center gap-3 mt-4 md:hidden rounded bg-white px-4 py-4 font-medium text-[#202ded]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="18px"
              viewBox="0 -960 960 960"
              width="18px"
              fill="currentColor"
            >
              <path d="M302.31-100q-50.69 0-86.5-35.81T180-222.31V-730q0-54.15 37.92-92.08Q255.85-860 310-860h470v575.38q-25.77 0-44.04 18.27t-18.27 44.04q0 25.77 18.27 44.04T780-160v60H302.31ZM240-326.23q13.62-9.31 29.19-13.85 15.58-4.53 33.12-4.53h25.38V-800H310q-28.85 0-49.42 20.58Q240-758.85 240-730v403.77Zm147.69-18.38H720V-800H387.69v455.39ZM240-326.23v-466.08 466.08ZM302.31-160h373.77q-8.7-13.62-13.54-28.88-4.85-15.27-4.85-33.43 0-17.15 4.54-32.92 4.54-15.77 13.85-29.39H302.31q-26.77 0-44.54 18.27T240-222.31q0 26.77 17.77 44.54T302.31-160Z" />
            </svg>
            Read Documentation
          </a>
        </div>
      </div>
    </div>
  );
};

export default Hero;
