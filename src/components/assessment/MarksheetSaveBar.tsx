"use client";

import Link from "next/link";
import type { MarksheetSaveState } from "./MarksheetGrid";

interface Props {
  state: MarksheetSaveState;
  onSave: () => void;
  onDiscard: () => void;
  /** Link to the class summary — kept as a plain link, not a second button. */
  summaryHref?: string;
}

/**
 * The single fixed save control for the marksheet page — replaces the old
 * pairing of MarksheetGrid's own inline "Save marks" bar plus this page's
 * separate "Done — View Class Summary" button, which read as two different
 * save-ish controls. Left padding leaves room for the floating Soma AI
 * button (bottom-right) so the two never overlap.
 */
export default function MarksheetSaveBar({ state, onSave, onDiscard, summaryHref }: Props) {
  const { hasEdits, editCount, cellErrorCount, saving, saveError } = state;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-6 py-3 pr-20 sm:pr-24 flex items-center justify-between gap-3">
      <div className="min-w-0">
        {saveError ? (
          <p className="text-sm text-danger font-medium truncate">{saveError}</p>
        ) : cellErrorCount > 0 ? (
          <p className="text-sm text-danger font-medium">
            Fix {cellErrorCount} invalid score{cellErrorCount !== 1 ? "s" : ""} before saving.
          </p>
        ) : hasEdits ? (
          <p className="text-sm text-warn font-medium">
            {editCount} unsaved change{editCount !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-sm text-slate/70">
            All changes saved.
            {summaryHref && (
              <>
                {" · "}
                <Link href={summaryHref} className="text-teal hover:underline">
                  View Class Summary
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {hasEdits && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-md border border-border text-sm font-medium px-4 py-2 text-foreground hover:bg-background transition-colors disabled:opacity-50"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !hasEdits || cellErrorCount > 0}
          className="rounded-md bg-royal text-white text-sm font-medium px-5 py-2 hover:bg-royal/90 transition-colors shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
