import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — Huh",
  description: "Draft terms of use for Huh.",
  robots: { index: false, follow: false },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
      <div className="mt-1.5 space-y-2 text-[13.5px] leading-relaxed text-neutral-600">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="h-screen overflow-y-auto bg-neutral-50">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
          DRAFT — owner must review
        </div>

        <a href="/" className="mt-5 inline-block text-[12px] text-neutral-500 underline hover:text-neutral-800">
          ← Back to Huh
        </a>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Terms of Use</h1>
        <p className="mt-1 text-[12px] text-neutral-400">Last updated: November 10, 2026</p>

        <Section title="AI answers can be wrong">
          <p>
            Huh uses a third-party AI model to explain the part of the board you selected.
            It can be confidently wrong, miss context, or misread an image. Use it to get
            unstuck, then verify important steps yourself or ask a teacher. It is not a
            substitute for your own work, a textbook, or a person who knows the subject.
          </p>
        </Section>

        <Section title="Fair use limits">
          <p>
            To keep the demo affordable, asks are rate-limited per browser and per IP
            address, and there is a daily cap for the whole service. If you hit a limit,
            wait a little and try again. Please do not script or automate requests, or use
            the service to send content that is illegal, harmful, or someone else’s
            private data.
          </p>
        </Section>

        <Section title="Your material">
          <p>
            You keep whatever you paste or draw on the board. By asking a question you
            allow the selected region and your question to be sent to the AI provider so it
            can answer. Boards stay in your browser unless you export or share them.
          </p>
          <p>
            If you use your own API key, you are responsible for that key and for the
            provider charges it incurs.
          </p>
        </Section>

        <Section title="As-is service">
          <p>
            Huh is provided as-is, with no warranty. It is an early demo: features may
            change, break, or stop entirely, and boards are stored only in your browser,
            so keep your own copy of anything important.
          </p>
        </Section>

        <Section title="Privacy">
          <p>
            See the{" "}
            <a className="underline hover:text-neutral-900" href="/privacy">
              Privacy Policy
            </a>{" "}
            for what is sent to the AI provider, what is stored locally, and what analytics
            is collected.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ? (
              <>
                Questions about these terms:{" "}
                <a
                  className="underline hover:text-neutral-900"
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL.trim()}`}
                >
                  {process.env.NEXT_PUBLIC_CONTACT_EMAIL.trim()}
                </a>
                .
              </>
            ) : (
              "A contact email has not been configured for this deployment yet."
            )}
          </p>
        </Section>

        <p className="mt-10 border-t border-neutral-200 pt-4 text-[12px] text-neutral-400">
          This is a draft for a classmate demo, not legal advice.
        </p>
      </div>
    </main>
  );
}
