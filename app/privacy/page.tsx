import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal | Datamint",
  description: "Privacy, cookies, and terms for the Datamint website.",
};

const sections = [
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
  { id: "cookies", label: "Cookies" },
];

export default function LegalPage() {
  return (
    <main className="min-h-screen geist bg-white  px-5 py-6 text-black sm:px-8 sm:py-10">
    
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
              These terms and notices apply to the Datamint website and related
              product experience. Datamint may evolve over time and is provided
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
                By using this website, you agree to use it only for lawful,
                legitimate purposes. You may not attempt to interfere with the
                security, integrity, or availability of the site, its services,
                or any connected systems.
              </p>
              <p>
                Datamint provides a platform for synthetic data generation and
                related developer workflows. The site and its content are
                provided for informational and product-use purposes and may be
                updated, changed, or unavailable at any time without notice.
              </p>
              <p>
                We may improve, modify, or discontinue features as the product
                evolves. Nothing in these terms creates a promise of future
                availability, support, or access beyond what is explicitly
                provided in a separate agreement.
              </p>
              <p>
                All content on this website, including text, branding, product
                names, and visuals, belongs to Datamint or its relevant rights
                holders unless otherwise stated. Please do not reproduce or
                redistribute materials without permission.
              </p>
            </div>
          </section>

          <section id="privacy" className="scroll-mt-8">
            <h2 className="mb-2 text-sm font-medium tracking-tight text-[#999]">
              2. Privacy
            </h2>
            <div className="space-y-3 text-justify text-sm font-medium leading-4 tracking-tight">
              <p>
                We collect only the personal information reasonably needed to
                operate and improve the website and product. This may include
                information you provide when contacting us, such as your email
                address and message content, as well as technical information
                about how the site is used.
              </p>
              <p>
                We use this information to respond to support and enquiry
                requests, maintain the service, diagnose issues, and understand
                product usage. We do not sell personal information and we do not
                use your data to build profiles for advertising or unrelated
                third-party marketing.
              </p>
              <p>
                With your consent, this site may load Vercel Analytics and Speed
                Insights to understand site performance and usage patterns. These
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
                If you have provided personal information to us, you may contact
                us to ask about what we hold, request correction, or request
                deletion where applicable law requires it. For privacy
                questions, email{" "}
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
                We use cookies and local storage only where necessary to remember
                your consent choices and support core website functionality. Your
                consent selection is saved in the browser so the site can respect
                it on later visits.
              </p>
              <p>
                If you accept analytics, Vercel Analytics and Speed Insights may
                collect limited technical information about page views and site
                performance. If you decline, those analytics tools remain
                disabled. We do not use advertising cookies for behavioural
                targeting.
              </p>
              <p>
                You can clear your saved choice by removing this site&apos;s local
                storage in your browser settings. Doing so may cause the consent
                prompt to appear again when you next visit.
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
