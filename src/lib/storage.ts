import type { EstimateDraft } from "@/types";

/**
 * Draft storage — client-side wrapper around the server API
 * (src/app/api/drafts/*), which is backed by a JSON file
 * (src/lib/draftsStore.server.ts). This replaces the original
 * localStorage-only approach: drafts now live on the server, so a draft
 * created automatically by the Workiz/email webhook (see
 * src/services/workiz.ts) shows up for anyone opening the estimator, not
 * just the browser that happened to create it.
 *
 * Function signatures are kept identical to the old localStorage version on
 * purpose, so no component code needed to change when this was swapped in.
 */

export async function listDrafts(): Promise<EstimateDraft[]> {
  try {
    const res = await fetch("/api/drafts");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getDraft(id: string): Promise<EstimateDraft | null> {
  try {
    const res = await fetch(`/api/drafts/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveDraft(draft: EstimateDraft): Promise<EstimateDraft> {
  const res = await fetch("/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) {
    throw new Error("Failed to save draft.");
  }
  return res.json();
}

export async function deleteDraft(id: string): Promise<void> {
  await fetch(`/api/drafts/${id}`, { method: "DELETE" });
}

export function createEmptyDraft(): EstimateDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    lead: {
      name: "",
      phone: "",
      email: "",
      address: "",
      message: "",
      color: "",
      webForm: "",
    },
    imageUrl: null,
    lines: [],
    scaleCalibration: null,
    pricing: null,
    notes: "",
  };
}
