"use client";

import { bugReportHref } from "@/lib/bugReport";
import { getLastErrorCode } from "@/lib/lastError";
import { track } from "@/lib/analytics";

/**
 * "Report a bug" link (spec-addendum-4 E6). Hidden when neither a form URL nor
 * a contact email is configured.
 */
export function BugReportLink({ className = "" }: { className?: string }) {
  const link = bugReportHref(getLastErrorCode());
  if (!link) return null;

  return (
    <a
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={className}
      onClick={() => track("bug_report_clicked")}
    >
      Report a bug
    </a>
  );
}
