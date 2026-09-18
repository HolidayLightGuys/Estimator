// Server-side only. Uses the Node.js filesystem — do not import from a
// "use client" component.
//
// IMPORTANT DEPLOYMENT NOTE: this writes to a JSON file at data/drafts.json
// under the project root. That's fine for running locally or on a
// traditional always-on server. It is NOT durable on most serverless
// hosting (e.g. Vercel) — those platforms often reset or don't persist the
// filesystem between requests/deploys, so drafts could silently disappear.
// If this ever gets deployed somewhere serverless, swap this file's
// internals for a real database (Supabase/Firebase/etc.) — every function
// signature below is deliberately kept async and stable so callers
// (API routes, src/services/workiz.ts) won't need to change.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { EstimateDraft } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DRAFTS_FILE = path.join(DATA_DIR, "drafts.json");

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DRAFTS_FILE);
  } catch {
    await fs.writeFile(DRAFTS_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<EstimateDraft[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(DRAFTS_FILE, "utf-8");
    return JSON.parse(raw) as EstimateDraft[];
  } catch {
    return [];
  }
}

async function writeAll(drafts: EstimateDraft[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(drafts, null, 2), "utf-8");
}

export async function listDraftsServer(): Promise<EstimateDraft[]> {
  const drafts = await readAll();
  return drafts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getDraftServer(id: string): Promise<EstimateDraft | null> {
  const drafts = await readAll();
  return drafts.find((d) => d.id === id) ?? null;
}

export async function saveDraftServer(draft: EstimateDraft): Promise<EstimateDraft> {
  const drafts = await readAll();
  const now = new Date().toISOString();
  const idx = drafts.findIndex((d) => d.id === draft.id);
  const updated: EstimateDraft = { ...draft, updatedAt: now };

  if (idx >= 0) {
    drafts[idx] = updated;
  } else {
    drafts.push({ ...updated, createdAt: draft.createdAt || now });
  }
  await writeAll(drafts);
  return updated;
}

export async function deleteDraftServer(id: string): Promise<void> {
  const drafts = await readAll();
  await writeAll(drafts.filter((d) => d.id !== id));
}

export function createEmptyDraftServer(): EstimateDraft {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    lead: { name: "", phone: "", email: "", address: "", message: "", color: "", webForm: "" },
    imageUrl: null,
    lines: [],
    scaleCalibration: null,
    pricing: null,
    notes: "",
  };
}
