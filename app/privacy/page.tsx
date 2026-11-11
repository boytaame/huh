import type { Metadata } from "next";
import { BugReportLink } from "@/components/BugReportLink";

export const metadata: Metadata = {
  title: "Privacy — Huh",
  description: "Draft privacy policy for Huh.",
  robots: { index: false, follow: false },
};

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <div className="mt-1.5 space-y-2 text-[13.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="h-screen overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
          DRAFT — owner must review
        </div>

        <a
          href="/"
          className="mt-5 inline-block text-[12px] text-neutral-500 underline hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          ← Back to Huh
        </a>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Privacy Policy
        </h1>
        <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
          Last updated: November 11, 2026
        </p>

        <p className="mt-5 text-[13.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          Huh is a small whiteboard for studying. There are no accounts yet. This page
          explains, in plain English, what leaves your browser and what stays on your
          device.
        </p>

        <Section title="What is sent to the AI provider">
          <p>
            When you ask a question, Huh sends these things to a third-party AI provider
            (Google Gemini, Anthropic, or OpenAI, depending on how this deployment is
            configured):
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>the image of the exact region you boxed,</li>
            <li>your question,</li>
            <li>a short summary of the board,</li>
            <li>the recent messages in that thread,</li>
            <li>a little surrounding context from parent threads.</li>
          </ul>
          <p>
            The AI provider processes that request under its own terms and privacy
            policy. If you paste your own API key into the top-right box, your browser
            sends the request straight to the provider with your key; in that mode this
            site’s server is not involved in the request at all.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            Boards — your materials, selection boxes, threads and answers — are stored
            in this browser (localStorage and IndexedDB). They are not uploaded to a
            server and there is no cloud save yet. Clearing this site’s data deletes
            your boards. This page will change when cloud save arrives.
          </p>
          <p>
            Huh also sets one anonymous cookie, <code>huh_cid</code>, containing a random
            id. It is httpOnly, is not an account, and exists only so rate limits can
            count requests. It contains no personal details.
          </p>
          <p>
            Your theme choice (System, Light or Dark) is stored in this browser only.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            Huh records anonymous product events — for example “the app was opened”,
            “a selection was made”, “a follow-up was sent”, or “an error was shown”.
            Events carry only names and small values such as which quick chip was used.
            They never include your questions, answers, board text or images.
          </p>
          <p>
            Analytics is provided by PostHog. If your browser sends Do Not Track, Huh
            sends nothing to PostHog. You can also block the request with any content
            blocker.
          </p>
        </Section>

        <Section title="Feedback and bug reports">
          <p>
            If you press 👍 or 👎 on an answer, Huh stores your rating, the answer text,
            your question, the optional comment you typed, and the prompt/model version.
            It never stores the selected image. Feedback is used only to improve the
            prompts.
          </p>
          <p>
            A bug report contains only what you write plus technical lines: app version,
            browser user-agent string, the last error code, and the time. It never
            includes your board, messages or images.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            A deployment of Huh may use Vercel for hosting, Upstash Redis for rate-limit
            counters and feedback storage, PostHog for anonymous analytics, and one of
            the AI providers named above for answers. Each provider has its own privacy
            policy.
          </p>
        </Section>

        <Section title="Please do not put sensitive data on the board">
          <p>
            Treat the board like a piece of paper on your desk, not a private diary.
            Avoid pasting ID numbers, medical details, passwords, or anything about
            another person that you would not want sent to an AI provider.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {contact ? (
              <>
                Questions or deletion requests:{" "}
                <a
                  className="underline hover:text-neutral-900 dark:hover:text-neutral-100"
                  href={`mailto:${contact}`}
                >
                  {contact}
                </a>
                .
              </>
            ) : (
              "A contact email has not been configured for this deployment yet."
            )}
          </p>
        </Section>

        <Section title="Where the owner is">
          <p>
            Huh is run by one person in Indonesia. This draft has not been reviewed by a
            lawyer and should be checked against Indonesia’s personal data protection law
            (UU PDP) before any public launch.
          </p>
        </Section>

        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-200 pt-4 text-[12px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
          <span>This is a draft for a classmate demo, not legal advice.</span>
          <a
            className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
            href="/terms"
          >
            Terms
          </a>
          <BugReportLink className="underline hover:text-neutral-700 dark:hover:text-neutral-300" />
        </div>
      </div>
    </main>
  );
}
