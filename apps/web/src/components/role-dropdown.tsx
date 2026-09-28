"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { inferRoleCategory, searchRoleCatalog, type RoleCatalogEntry } from "@rolevana/domain";

export function RoleDropdown({ value, category, onChange, label = "Target role", disabled = false }: { value: string; category: string; onChange: (title: string, category: string) => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const results = searchRoleCatalog(query, 30);

  useEffect(() => {
    const handler = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = useCallback((entry: RoleCatalogEntry) => { onChange(entry.title, entry.category); setQuery(""); setOpen(false); }, [onChange]);
  const selectCustom = useCallback(() => {
    const title = query.trim();
    if (!title) return;
    onChange(title, inferRoleCategory(title));
    setOpen(false);
    setQuery("");
  }, [query, onChange]);

  const exactQuery = results.some((entry) => entry.title.toLowerCase() === query.trim().toLowerCase());
  const customAvailable = Boolean(query.trim()) && !exactQuery;
  const optionCount = results.length + (customAvailable ? 1 : 0);

  return <div className="field relative" ref={ref}>
    <label>{label}</label>
    <button type="button" disabled={disabled} className="control flex w-full items-center justify-between gap-2 text-left disabled:cursor-wait disabled:opacity-60" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
      <span className={value ? "" : "text-slate-500"}>{value || "Select target role…"}</span>
      <ChevronDown size={14} className="shrink-0 text-slate-500"/>
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-1 min-w-[20rem] rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2">
        <Search size={14} className="text-slate-500"/>
        <input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={optionCount ? `${listId}-${activeIndex}` : undefined} className="w-full border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" placeholder="Search roles or type a custom title…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => optionCount ? (index + 1) % optionCount : 0); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => optionCount ? (index - 1 + optionCount) % optionCount : 0); }
          else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
          else if (event.key === "End") { event.preventDefault(); setActiveIndex(Math.max(0, optionCount - 1)); }
          else if (event.key === "Escape") { setOpen(false); }
          else if (event.key === "Enter") { event.preventDefault(); const active = results[activeIndex]; if (active) select(active); else selectCustom(); }
        }}/>
      </div>
      <div id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
        {results.map((entry, index) => <button id={`${listId}-${index}`} role="option" aria-selected={entry.title === value} type="button" className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${index === activeIndex ? "bg-white/[.07]" : ""} ${entry.title === value ? "text-cyan-200" : "text-slate-300"}`} key={entry.title} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(entry)}>
          <span>{entry.title}</span><span className="ml-4 text-[10px] text-slate-500">{entry.category.replace(/_/g, " ")}</span>
        </button>)}
        {customAvailable && <button id={`${listId}-${results.length}`} role="option" aria-selected={false} type="button" className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-cyan-300 transition ${activeIndex === results.length ? "bg-white/[.07]" : ""}`} onMouseEnter={() => setActiveIndex(results.length)} onClick={selectCustom}><Plus size={14}/>Use custom: “{query.trim()}”</button>}
      </div>
    </div>}
    {value && <div className="mt-1 text-[10px] text-slate-500">Category: {category.replace(/_/g, " ")}</div>}
  </div>;
}
