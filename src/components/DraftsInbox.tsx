"use client";

import { useEffect, useState } from "react";
import type { EstimateDraft } from "@/types";
import { listDrafts } from "@/lib/storage";

function draftPreviewLabel(d: EstimateDraft): string {
  const name = d.lead.name || "(no name)";
  const isAuto = d.lines.some((l) => l.source === "ai_suggested") && d.lines.length > 0;
  const when = new Date(d.updatedAt).toLocaleString();
  return `${name}${isAuto ? " · AI-suggested" : ""} — ${when}`;
}

export default function DraftsInbox({
  currentDraftId,
  onSelect,
  onNew,
  refreshKey,
}: {
  currentDraftId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Bump this after a save so the list refetches. */
  refreshKey: number;
}) {
  const [drafts, setDrafts] = useState<EstimateDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setDrafts(await listDrafts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div className="flex items-center gap-2">
      <select
        className="text-sm rounded-lg border border-neutral-200 px-2 py-1.5 max-w-xs"
        value={currentDraftId}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            onNew();
          } else {
            onSelect(e.target.value);
          }
        }}
      >
        <option value={currentDraftId}>
          {drafts.find((d) => d.id === currentDraftId) ? "Current draft" : "New (unsaved) draft"}
        </option>
        <option value="__new__">+ Start new draft</option>
        {drafts
          .filter((d) => d.id !== currentDraftId)
          .map((d) => (
            <option key={d.id} value={d.id}>
              {draftPreviewLabel(d)}
            </option>
          ))}
      </select>
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="text-xs text-white/80 underline disabled:opacity-50"
        title="Refresh — new drafts created by the automated intake webhook show up here"
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
