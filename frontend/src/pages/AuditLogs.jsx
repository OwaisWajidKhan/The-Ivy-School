import useFetch from '../lib/useFetch';
import { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate, timeAgo } from '../lib/format';

export default function AuditLogs() {
  const { data, loading } = useFetch('/admin/audit');
  return (
    <div className="animate-slide-up space-y-4">
      <div>
        <h2 className="text-xl font-bold">Audit Logs</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Every significant action across the system</p>
      </div>
      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.items.length === 0 ? <EmptyState title="No audit entries" /> : (
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">Time</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th><th className="th">IP</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.items.map(a => (
                <tr key={a.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td text-xs">{timeAgo(a.created_at)}</td>
                  <td className="td font-medium">{a.username}</td>
                  <td className="td"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{a.action}</code></td>
                  <td className="td text-xs">{a.entity_type || '—'}</td>
                  <td className="td max-w-[280px] truncate font-mono text-xs">{a.details || '—'}</td>
                  <td className="td text-xs">{a.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
