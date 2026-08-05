import { useState, useEffect } from 'react';

// Client-side pagination over a fully-loaded array. Pages are computed locally,
// so flipping pages never triggers a network request.
export function useClientPagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = Array.isArray(items) ? items.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => { setPage(1); }, [total, pageSize]);

  return {
    page: safePage,
    setPage,
    pageCount,
    total,
    pageSize,
    startIndex: (safePage - 1) * pageSize,
    endIndex: Math.min(safePage * pageSize, total),
    paginated: Array.isArray(items) ? items.slice((safePage - 1) * pageSize, safePage * pageSize) : []
  };
}

export default function Pagination({ page, pageCount, total, onChange, pageSize, pageNeighbours = 1 }) {
  if (pageCount <= 1) return null;

  const pages = [];
  let start = Math.max(1, page - pageNeighbours);
  let end = Math.min(pageCount, page + pageNeighbours);
  if (page - pageNeighbours <= 1) end = Math.min(pageCount, 1 + pageNeighbours * 2);
  if (page + pageNeighbours >= pageCount) start = Math.max(1, pageCount - pageNeighbours * 2);
  for (let p = start; p <= end; p++) pages.push(p);

  const btn = (p, label, active) => (
    <button key={p} type="button" onClick={() => onChange(p)}
      className={`min-w-[32px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row dark:border-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {btn(1, '«', page === 1)}
        {start > 1 && <span className="px-1 text-slate-400">…</span>}
        {pages.map(p => btn(p, p, p === page))}
        {end < pageCount && <span className="px-1 text-slate-400">…</span>}
        {btn(pageCount, '»', page === pageCount)}
      </div>
    </div>
  );
}