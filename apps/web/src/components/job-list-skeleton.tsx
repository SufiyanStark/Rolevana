export function JobListSkeleton({ rows = 8 }: { rows?: number }) {
  return <div aria-label="Loading jobs" aria-live="polite">
    {Array.from({ length: rows }, (_, index) => <div className="grid gap-3 border-b border-white/[.06] px-5 py-5 last:border-0 md:grid-cols-[1.5fr_.65fr_.75fr_.55fr_.75fr] md:items-center" key={index}>
      <div><div className="skeleton h-4 w-3/5 rounded"/><div className="skeleton mt-2 h-3 w-2/5 rounded"/></div>
      <div className="skeleton h-3 w-24 rounded"/>
      <div><div className="skeleton h-3 w-28 rounded"/><div className="skeleton mt-2 h-3 w-20 rounded"/></div>
      <div><div className="skeleton h-3 w-16 rounded"/><div className="skeleton mt-2 h-3 w-12 rounded"/></div>
      <div className="skeleton h-6 w-28 rounded-full"/>
    </div>)}
  </div>;
}
