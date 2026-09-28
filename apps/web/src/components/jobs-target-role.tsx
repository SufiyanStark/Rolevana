"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RoleDropdown } from "@/components/role-dropdown";

export function JobsTargetRole({ initialTitle, initialCategory, onSaved }: { initialTitle: string; initialCategory: string; onSaved?: (title: string, category: string) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function changeTargetRole(nextTitle: string, nextCategory: string) {
    if (nextTitle === title) return;
    const previous = { title, category };
    setTitle(nextTitle); setCategory(nextCategory); setSaving(true); setError("");
    try {
      const response = await fetch("/api/profile/target-role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: nextTitle }) });
      const body = await response.json() as { targetRole?: string; targetCategory?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save the target role.");
      const savedTitle = body.targetRole ?? nextTitle; const savedCategory = body.targetCategory ?? nextCategory;
      setTitle(savedTitle); setCategory(savedCategory);
      if (onSaved) onSaved(savedTitle, savedCategory); else router.refresh();
    } catch (reason) {
      setTitle(previous.title); setCategory(previous.category);
      setError(reason instanceof Error ? reason.message : "Could not save the target role.");
    } finally { setSaving(false); }
  }

  return <div className="w-full max-w-md" id="target-role-control">
    <RoleDropdown value={title} category={category} disabled={saving} onChange={(nextTitle, nextCategory) => void changeTargetRole(nextTitle, nextCategory)}/>
    <div aria-live="polite" className={`mt-1 min-h-4 text-xs ${error ? "text-red-300" : "text-slate-500"}`}>{error || (saving ? "Updating job results…" : "This selection filters every job view and is saved to your profile.")}</div>
  </div>;
}
