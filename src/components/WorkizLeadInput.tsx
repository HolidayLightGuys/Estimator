"use client";

import { useState } from "react";
import type { CustomerLead } from "@/types";
import { parseWorkizLead } from "@/lib/parseWorkizLead";

const SAMPLE_LEAD = `From: KAYLA ARMENTROUT
Phone: (573) 673-7844
Email: kay.m.armentrout@gmail.com
Address: 2 East Dartmouth Road Kansas City, Missouri 64113
Message: We like a simple warm white light on the 1st story roofline at the front of our house and wrap only the roof around the covered porch, and possibly the pathway.
Color: Warm White
Web form: HLG Website`;

export default function WorkizLeadInput({
  onParsed,
}: {
  onParsed: (lead: CustomerLead) => void;
}) {
  const [raw, setRaw] = useState("");

  const handleParse = () => {
    if (!raw.trim()) return;
    onParsed(parseWorkizLead(raw));
  };

  return (
    <div className="hlg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-hlg-charcoal">Paste Workiz Lead</h2>
        <button
          type="button"
          onClick={() => setRaw(SAMPLE_LEAD)}
          className="text-xs text-hlg-green-bright underline"
        >
          Use sample lead
        </button>
      </div>
      <textarea
        className="w-full h-40 rounded-lg border border-neutral-200 p-3 text-sm font-mono"
        placeholder="Paste the full Workiz email/service request text here..."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button
        type="button"
        onClick={handleParse}
        className="mt-3 px-4 py-2 rounded-lg bg-hlg-green text-white text-sm font-semibold hover:bg-hlg-green-bright transition-colors"
      >
        Parse Lead Into Form
      </button>
      <p className="mt-2 text-xs text-neutral-400">
        Parsing is best-effort — review every field it fills in below before saving.
      </p>
    </div>
  );
}
