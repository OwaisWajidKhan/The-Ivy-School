import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import { PageLoader, EmptyState } from '../components/Spinner';
import Pagination, { useClientPagination } from '../components/Pagination';
import { fmtDate, fmtHours } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export default function MyAttendance() {
  const { user } = useAuth();

  return <MyAttendanceInner user={user} />;
}

function MyAttendanceInner({ user }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [params, setParams] = useState({ limit: 10000 });
  const { data, loading, reload } = useFetch('/attendance/me', [params], { params });

  const apply = () => setParams({ limit: 10000, from: from || undefined, to: to || undefined });
  const reset = () => { setFrom(''); setTo(''); setParams({ limit: 10000 }); };

  const rows = data?.rows || [];
  const present = rows.filter(r => r.status !== 'absent' && r.in_time).length || 0;
  const totalHours = rows.reduce((a, r) => a + (r.working_hours || 0), 0) || 0;
  const { paginated, page, setPage, pageCount, total } = useClientPagination(rows);

  return (
    <div className="animate-slide-up space-y-4">
      <div>
        <h2 className="text-xl font-bold">My Attendance</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {user?.person?.full_name || user?.username} · recent attendance
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Days present</p>
          <p className="mt-1 text-2xl font-bold">{present}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Total working hours</p>
          <p className="mt-1 text-2xl font-bold">{fmtHours(totalHours)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Records shown</p>
          <p className="mt-1 text-2xl font-bold">{data?.rows?.length || 0}</p>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="label">From</label><input className="input w-auto" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input className="input w-auto" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <button className="btn-primary" onClick={apply}>Apply filter</button>
        <button className="btn-secondary" onClick={reset}>Reset</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : rows.length === 0 ? <EmptyState title="No attendance records" /> : (
          <>
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="th">Date</th><th className="th">In</th><th className="th">Out</th><th className="th">Hours</th><th className="th">Late (min)</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginated.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-medium">{fmtDate(r.date)}</td>
                    <td className="td">{r.in_time || '—'}</td>
                    <td className="td">{r.out_time || '—'}</td>
                    <td className="td">{fmtHours(r.working_hours)}</td>
                    <td className="td">{r.late_minutes || 0}</td>
                    <td className="td"><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} pageSize={10} total={total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
