import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import { PageLoader, EmptyState } from '../components/Spinner';
import Pagination, { useClientPagination } from '../components/Pagination';
import { fmtDate, todayStr } from '../lib/format';
import { useToast } from '../context/ToastContext';

async function downloadCsv(path) {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    const cd = res.headers['content-disposition'] || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    a.download = m ? m[1] : 'scan-logs.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

export default function ScanLogs() {
  const toast = useToast();
  const [params, setParams] = useState({ date: todayStr(), limit: 10000 });
  const { data, loading } = useFetch('/attendance/logs', [params], { params });
  const { paginated, page, setPage, pageCount, total, pageSize, setPageSize } = useClientPagination(data?.items);
  const doExport = async () => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const ok = await downloadCsv(`/attendance/export-logs?${q.toString()}`);
    if (!ok) toast.error('Export failed');
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">RFID Scan History</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Every RFID swipe: card, person, entry/exit, device and time</p>
        </div>
        <button className="btn-secondary" onClick={doExport}>⬇ Export CSV</button>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <input className="input max-w-xs" type="date" value={params.date || ''} onChange={e => setParams(p => ({ ...p, date: e.target.value }))} />
          <select className="input max-w-xs" value={params.person_type || ''} onChange={e => setParams(p => ({ ...p, person_type: e.target.value || undefined }))}>
            <option value="">All people</option><option value="student">Students</option><option value="employee">Employees</option>
          </select>
          <select className="input max-w-xs" value={params.direction || ''} onChange={e => setParams(p => ({ ...p, direction: e.target.value || undefined }))}>
            <option value="">All In/Out</option><option value="IN">IN</option><option value="OUT">OUT</option>
          </select>
        </div>
        {loading ? <PageLoader /> : total === 0 ? <EmptyState title="No scans" subtitle="Try a different date or filter." /> : (
          <>
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">#</th><th className="th">Card ID</th><th className="th">Person</th><th className="th">Type</th><th className="th">In/Out</th><th className="th">Device</th><th className="th">Location</th><th className="th">Scan time</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginated.map(l => (
                <tr key={l.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td font-mono text-xs">{l.id}</td>
                  <td className="td font-mono text-xs">{l.raw_uid || '—'}</td>
                  <td className="td font-medium">{l.full_name || <span className="text-xs text-rose-400">unknown</span>}</td>
                  <td className="td capitalize text-xs">{l.person_type || '—'}</td>
                  <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.direction === 'IN' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300'}`}>{l.direction || '—'}</span></td>
                  <td className="td font-mono text-xs">{l.device_id || '—'}</td>
                  <td className="td text-xs">{l.location || '—'}</td>
                  <td className="td text-xs">{fmtDate(l.scan_time, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} pageSize={pageSize} onPageSizeChange={setPageSize} total={total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}