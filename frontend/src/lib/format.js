export function fmtDate(dateStr, withTime = false) {
  if (!dateStr) return '—';
  if (withTime && dateStr.includes(' ')) {
    const [d, t] = dateStr.split(' ');
    return `${d} ${t.slice(0, 5)}`;
  }
  return String(dateStr).slice(0, 10);
}

export function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}

export function fmtHours(h) {
  if (h === null || h === undefined) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export function timeAgo(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts.replace(' ', 'T')) ) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function statusColor(status) {
  const map = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    absent: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    half_day: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    early_exit: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    overtime: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
    online: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    offline: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300'
  };
  return map[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300';
}

export function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ');
}
