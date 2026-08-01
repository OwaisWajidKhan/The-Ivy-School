export default function Spinner({ size = 20 }) {
  return (
    <svg className="animate-spin text-brand-600 dark:text-brand-400" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
      <Spinner size={32} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="animate-float text-4xl">🗂️</div>
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {subtitle && <p className="text-sm text-slate-400 dark:text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="animate-shimmer h-4 flex-1 rounded-md bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ))}
    </div>
  );
}
