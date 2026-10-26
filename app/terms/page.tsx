import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal | Sythentic",
  description: "Privacy, cookies, and terms for the Sythentic website.",
};

const sections = [
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
  { id: "cookies", label: "Cookies" },
];

export default function LegalPage() {
  return (
    <main className="min-h-screen geist bg-white px-5 py-6 text-black sm:px-8 sm:py-10">
      <article className="mx-auto w-full max-w-xl pb-20 pt-16 sm:pt-24">
        <div className="mb-8 ">
          <span className="text-right text-xs font-medium tracking-tight text-[#999] sm:text-sm">
            Updated: October 25, 2026
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tighter sm:text-4xl">
            Legal
          </h1>
          <p className="mt-3 text-sm leading-4 tracking-tight ">
            <span className="text-[#999]  text-sm mb-2 font-medium tracking-tight ">
              These terms and notices apply to the Sythentic website and related
              product experience. Sythentic may evolve over time and is provided
              as a developer tool for synthetic data generation.
            </span>
          </p>
        </div>

        <nav
          aria-label="Legal sections"
          className="mb-8 flex flex-wrap gap-x-4 gap-y-2 border-y border-black/10 px-4 py-3"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-[10px] text-[#777] transition-colors hover:text-black"
            >
              <span className="text-[#999]  text-sm mb-2 font-medium tracking-tight ">
                [ {section.label} ]
              </span>
            </a>
          ))}
        </nav>

        <div className="space-y-8 ">
          <section id="terms" className="scroll-mt-8">
            <h2 className="mb-2 text-sm font-medium tracking-tight text-[#999]">
              1. Terms of use
            </h2>
            <div className="space-y-3 text-justify text-sm font-medium leading-4 tracking-tight">
              <p>
                By using this website, you agree to use it only for lawful
                purposes. Do not attempt unauthorized access to the site or
                connected systems, or use the site in a way that could disrupt
                or damage it.
              </p>
              <p>
                The website and its content are provided for general information
                and may change or become unavailable. Nothing on this website
                creates an agreement for cloud storage or other services.
              </p>
              <p>
                Content on this website belongs to Splash or its respective
                rights holders. Please obtain permission before reproducing or
                distributing it.
              </p>
            </div>
          </section>

          <section id="privacy" className="scroll-mt-8">
            <h2 className="mb-2 text-sm font-medium tracking-tight text-[#999]">
              2. Privacy
            </h2>
            <div className="space-y-3 text-justify text-sm font-medium leading-4 tracking-tight">
              <p>
                If you contact us by email, we receive the address and message
                you choose to send. We use it to respond to your enquiry. Please
                do not email passwords or sensitive files.
              </p>
              <p>
                With your consent, this site loads Vercel Analytics and Speed
                Insights to understand site usage and performance. These
                services may process technical information about your visit. For
                details, see the{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Vercel Privacy Policy
                </a>
                .
              </p>
              <p>
                You can contact us to ask about personal information you have
                sent us, or to request its correction or deletion, subject to
                applicable law. For privacy questions, email{" "}
                <a
                  href="mailto:bashh0409@gmail.com"
                  className="text-blue-600 underline"
                >
                  bashh0409@gmail.com
                </a>
                .
              </p>
            </div>
          </section>

          <section id="cookies" className="scroll-mt-8">
            <h2 className="mb-2 text-sm font-medium tracking-tight text-[#999]">
              3. Cookies & analytics
            </h2>
            <div className="space-y-3 text-justify text-sm font-medium leading-4 tracking-tight">
              <p>
                Your consent choice is saved in your browser&apos;s local
                storage so we can remember it on later visits. Accept enables
                Vercel Analytics and Speed Insights; Decline leaves them
                disabled.
              </p>
              <p>
                This site does not use advertising cookies. You can clear your
                saved choice by removing this site&apos;s local storage in your
                browser settings; the consent prompt will then appear again.
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
