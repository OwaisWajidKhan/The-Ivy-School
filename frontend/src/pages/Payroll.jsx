import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtMoney, fmtDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Payroll() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [approving, setApproving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useFetch('/payroll', [month, year, refresh], { params: { month, year } });

  const canGenerate = hasPermission('generate_payroll');
  const canApprove = hasPermission('manage_payroll');

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/payroll/generate', { month, year });
      toast.success('Payroll generated');
      setGenResult(res.data.data);
      setRefresh(r => r + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally { setGenerating(false); }
  };

  const approveOne = async (id) => {
    setApproving(true);
    try { await api.put(`/payroll/${id}/approve`); toast.success('Payroll approved'); setRefresh(r => r + 1); } catch (err) { toast.error(err.response?.data?.message || 'Approval failed'); } finally { setApproving(false); }
  };

  const approveMonth = async () => {
    if (!confirm('Approve all draft payroll records for this month?')) return;
    setApproving(true);
    try {
      const res = await api.post('/payroll/approve-month', { month, year });
      toast.success(`Approved ${res.data.data.approved} record(s)`);
      setRefresh(r => r + 1);
    } catch (err) { toast.error(err.response?.data?.message || 'Approval failed'); } finally { setApproving(false); }
  };

  const drafts = (data || []).filter(p => p.status === 'draft');

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Payroll</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Monthly salary calculation with deductions and overtime</p>
        </div>
        {canGenerate && (
          <button className="btn-primary" onClick={generate} disabled={generating}>
            {generating ? <Spinner size={18} /> : 'Generate Payroll'}
          </button>
        )}
        {canApprove && drafts.length > 0 && (
          <button className="btn-success" onClick={approveMonth} disabled={approving}>
            {approving ? <Spinner size={18} /> : `Approve All (${drafts.length})`}
          </button>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <select className="input w-auto" value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}</option>
          ))}
        </select>
        <select className="input w-auto" value={year} onChange={e => setYear(+e.target.value)}>
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y}>{y}</option>)}
        </select>
        {genResult && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Generated {genResult.generated} records · {genResult.workingDays} working days in {new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' })} {year}
          </span>
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.length === 0 ? <EmptyState title="No payroll generated yet" subtitle="Select a month and click 'Generate Payroll'." /> : (
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Employee</th><th className="th">Department</th>
                <th className="th">Present</th><th className="th">Absent</th><th className="th">Late</th><th className="th">Half</th>
                <th className="th">OT hrs</th><th className="th">Base</th><th className="th">Deductions</th><th className="th">OT pay</th><th className="th">Net Salary</th>
                <th className="th">Status</th>
                {canApprove && <th className="th">Approve</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map(p => (
                <tr key={p.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="font-mono text-xs text-slate-400">{p.employee_id}</p>
                  </td>
                  <td className="td text-xs">{p.department || '—'}</td>
                  <td className="td">{p.present_days}</td>
                  <td className="td text-rose-600 dark:text-rose-400">{p.absent_days}</td>
                  <td className="td text-amber-600 dark:text-amber-400">{p.late_days}</td>
                  <td className="td">{p.half_days}</td>
                  <td className="td">{p.overtime_hours}</td>
                  <td className="td">{fmtMoney(p.base_salary)}</td>
                  <td className="td text-rose-600 dark:text-rose-400">−{fmtMoney(p.deductions)}</td>
                  <td className="td text-emerald-600 dark:text-emerald-400">{p.overtime_pay ? `+${fmtMoney(p.overtime_pay)}` : '—'}</td>
                  <td className="td text-base font-bold">{fmtMoney(p.net_salary)}</td>
                  <td className="td">
                    <Badge status={p.status} />
                    {p.status === 'approved' && <p className="mt-1 text-[11px] text-slate-400">{p.approved_at ? fmtDate(p.approved_at) : ''}</p>}
                  </td>
                  {canApprove && (
                    <td className="td">
                      {p.status === 'draft' && (
                        <button className="btn-success !px-2 !py-1 text-xs" onClick={() => approveOne(p.id)}>Approve</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
