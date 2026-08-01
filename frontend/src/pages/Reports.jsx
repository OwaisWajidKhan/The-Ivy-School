import { useState } from 'react';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate, fmtHours, timeAgo, fmtMoney } from '../lib/format';

function download(url) {
  window.location.href = url;
}

function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{children}</button>;
}

export default function Reports() {
  const now = new Date();
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [personType, setPersonType] = useState('');
  const [gpFrom, setGpFrom] = useState(now.toISOString().slice(0, 10));
  const [gpTo, setGpTo] = useState(now.toISOString().slice(0, 10));
  const [gpStatus, setGpStatus] = useState('');

  const daily = useFetch('/reports/daily', [date], { params: { date } });
  const monthly = useFetch('/reports/monthly', [month, year, personType], { params: { month, year, person_type: personType || undefined } });
  const gatePasses = useFetch('/reports/gate-passes', [gpFrom, gpTo, gpStatus], { params: { from: gpFrom, to: gpTo, status: gpStatus || undefined } });
  const summary = useFetch('/reports/attendance-summary', [month, year], { params: { month, year } });
  const leaves = useFetch('/reports/leaves', [month, year], { params: { month, year } });
  const payroll = useFetch('/payroll/report', [month, year], { params: { month, year } });

  const exportUrl = (path) => `/api/reports${path}?month=${month}&year=${year}${personType ? `&person_type=${personType}` : ''}`;
  const exportGp = () => `/api/reports/export/generic?report=gate_passes&from=${gpFrom}&to=${gpTo}`;
  const exportLeaves = () => `/api/reports/export/generic?report=leaves&month=${month}&year=${year}`;
  const exportPayroll = () => `/api/reports/export/generic?report=payroll&month=${month}&year=${year}`;

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Reports</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Attendance, gate passes, leaves and payroll reports</p>
        </div>
        <div className="card inline-flex flex-wrap gap-1 p-1">
          <Tab active={tab === 'daily'} onClick={() => setTab('daily')}>Daily</Tab>
          <Tab active={tab === 'monthly'} onClick={() => setTab('monthly')}>Monthly</Tab>
          <Tab active={tab === 'gatepasses'} onClick={() => setTab('gatepasses')}>Gate Passes</Tab>
          <Tab active={tab === 'summary'} onClick={() => setTab('summary')}>Summary</Tab>
          <Tab active={tab === 'leaves'} onClick={() => setTab('leaves')}>Leaves</Tab>
          <Tab active={tab === 'payroll'} onClick={() => setTab('payroll')}>Payroll</Tab>
        </div>
      </div>

      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">Date</label>
              <input className="input w-auto" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button className="btn-secondary" onClick={() => download(`/api/reports/export/daily-csv?date=${date}`)}>⬇ Download CSV</button>
          </div>
          <DailyReport data={daily} />
        </div>
      )}

      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">Month</label>
              <select className="input w-auto" value={month} onChange={e => setMonth(+e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input w-auto" value={year} onChange={e => setYear(+e.target.value)}>
                {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label">People</label>
              <select className="input w-auto" value={personType} onChange={e => setPersonType(e.target.value)}>
                <option value="">Everyone</option><option value="student">Students</option><option value="employee">Employees</option>
              </select>
            </div>
            <button className="btn-secondary" onClick={() => download(exportUrl('/export/csv'))}>⬇ Export CSV</button>
          </div>
          <MonthlyReport data={monthly} />
        </div>
      )}

      {tab === 'gatepasses' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input className="input w-auto" type="date" value={gpFrom} onChange={e => setGpFrom(e.target.value)} /></div>
            <div><label className="label">To</label><input className="input w-auto" type="date" value={gpTo} onChange={e => setGpTo(e.target.value)} /></div>
            <div>
              <label className="label">Status</label>
              <select className="input w-auto" value={gpStatus} onChange={e => setGpStatus(e.target.value)}>
                <option value="">All</option><option>pending</option><option>approved</option><option>used</option><option>rejected</option><option>cancelled</option>
              </select>
            </div>
            <button className="btn-secondary" onClick={() => download(exportGp())}>⬇ Export CSV</button>
          </div>
          <GatePassReport data={gatePasses} />
        </div>
      )}

      {tab === 'summary' && (
        <div className="space-y-4">
          <MonthYearRow month={month} year={year} setMonth={setMonth} setYear={setYear} />
          <SummaryReport data={summary} />
        </div>
      )}

      {tab === 'leaves' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <MonthYearRow month={month} year={year} setMonth={setMonth} setYear={setYear} />
            <button className="btn-secondary" onClick={() => download(exportLeaves())}>⬇ Export CSV</button>
          </div>
          <LeavesReport data={leaves} />
        </div>
      )}

      {tab === 'payroll' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <MonthYearRow month={month} year={year} setMonth={setMonth} setYear={setYear} />
            <button className="btn-secondary" onClick={() => download(exportPayroll())}>⬇ Export CSV</button>
          </div>
          <PayrollReport data={payroll} />
        </div>
      )}
    </div>
  );
}

function MonthYearRow({ month, year, setMonth, setYear }) {
  const now = new Date();
  return (
    <>
      <div>
        <label className="label">Month</label>
        <select className="input w-auto" value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Year</label>
        <select className="input w-auto" value={year} onChange={e => setYear(+e.target.value)}>
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
    </>
  );
}

function GatePassReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  if (!d.rows?.length) return <EmptyState title="No gate passes in this period" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <tr><th className="th">Pass No</th><th className="th">Student</th><th className="th">Class</th><th className="th">Reason</th><th className="th">Exit</th><th className="th">Status</th><th className="th">Used</th><th className="th">Requested</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.rows.map(r => (
            <tr key={r.pass_no}>
              <td className="td font-mono text-xs">{r.pass_no}</td>
              <td className="td font-medium">{r.full_name}</td>
              <td className="td text-xs">{r.class_name}</td>
              <td className="td text-xs">{r.reason}</td>
              <td className="td text-xs">{fmtDate(r.exit_date)}</td>
              <td className="td"><Badge status={r.status} /></td>
              <td className="td text-xs">{r.used_at ? fmtDate(r.used_at) : '—'}</td>
              <td className="td text-xs">{fmtDate(r.requested_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  if (!d.rows?.length) return <EmptyState title="No attendance summary for this month" />;
  const total = d.total || 0;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <tr><th className="th">Student</th><th className="th">Class</th><th className="th">Present</th><th className="th">Absent</th><th className="th">Late</th><th className="th">Attendance %</th><th className="th">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.rows.map(r => (
            <tr key={r.student_id}>
              <td className="td font-medium">{r.full_name}</td>
              <td className="td text-xs">{r.class_name} {r.section_name}</td>
              <td className="td">{r.present}</td>
              <td className="td text-rose-600 dark:text-rose-400">{r.absent}</td>
              <td className="td text-amber-600 dark:text-amber-400">{r.late}</td>
              <td className="td">{r.pct != null ? `${r.pct.toFixed(1)}%` : '—'}</td>
              <td className="td"><Badge status={r.pct >= 75 ? 'active' : 'inactive'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeavesReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  if (!d.rows?.length) return <EmptyState title="No leaves in this period" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <tr><th className="th">Employee</th><th className="th">Department</th><th className="th">Type</th><th className="th">From</th><th className="th">To</th><th className="th">Days</th><th className="th">Status</th><th className="th">Reason</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.rows.map(r => (
            <tr key={r.id}>
              <td className="td font-medium">{r.full_name}</td>
              <td className="td text-xs">{r.department || '—'}</td>
              <td className="td text-xs">{r.leave_type}</td>
              <td className="td text-xs">{fmtDate(r.start_date)}</td>
              <td className="td text-xs">{fmtDate(r.end_date)}</td>
              <td className="td">{r.days}</td>
              <td className="td"><Badge status={r.status} /></td>
              <td className="td text-xs">{r.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayrollReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  if (!d.records?.length) return <EmptyState title="No payroll generated for this month" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {d.departments.map(dep => (
          <div key={dep.department} className="card p-4">
            <p className="text-sm font-semibold">{dep.department}</p>
            <p className="text-2xl font-bold">{fmtMoney(dep.total_net)}</p>
            <p className="text-xs text-slate-400">{dep.employee_count} employees · {dep.approved_count} approved</p>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr><th className="th">Employee</th><th className="th">Department</th><th className="th">Base</th><th className="th">Deductions</th><th className="th">OT</th><th className="th">Net</th><th className="th">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.records.map(p => (
              <tr key={p.id}>
                <td className="td font-medium">{p.full_name}</td>
                <td className="td text-xs">{p.department || '—'}</td>
                <td className="td">{fmtMoney(p.base_salary)}</td>
                <td className="td text-rose-600 dark:text-rose-400">−{fmtMoney(p.deductions)}</td>
                <td className="td text-emerald-600 dark:text-emerald-400">{fmtMoney(p.overtime_pay || 0)}</td>
                <td className="td font-bold">{fmtMoney(p.net_salary)}</td>
                <td className="td"><Badge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ReportCard title={`Students — ${d.students.length} records`}>
        <table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Class</th><th className="th">In</th><th className="th">Out</th><th className="th">Hours</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.students.map(r => (
              <tr key={r.id}><td className="td font-medium">{r.full_name}</td><td className="td text-xs">{r.class_name}</td><td className="td">{r.in_time || '—'}</td><td className="td">{r.out_time || '—'}</td><td className="td">{fmtHours(r.working_hours)}</td><td className="td"><Badge status={r.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </ReportCard>
      <ReportCard title={`Employees — ${d.employees.length} records`}>
        <table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Designation</th><th className="th">In</th><th className="th">Out</th><th className="th">Hours</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.employees.map(r => (
              <tr key={r.id}><td className="td font-medium">{r.full_name}</td><td className="td text-xs">{r.designation}</td><td className="td">{r.in_time || '—'}</td><td className="td">{r.out_time || '—'}</td><td className="td">{fmtHours(r.working_hours)}</td><td className="td"><Badge status={r.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </ReportCard>
    </div>
  );
}

function MonthlyReport({ data }) {
  const { data: d, loading } = data;
  if (loading || !d) return <PageLoader />;
  if (d.rows.length === 0) return <EmptyState title="No attendance for this period" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <tr>
            <th className="th">Person</th><th className="th">Type</th><th className="th">Class/Dept</th>
            <th className="th">Present</th><th className="th">Late</th><th className="th">Half</th><th className="th">Absent</th>
            <th className="th">Early</th><th className="th">OT</th><th className="th">Total hrs</th><th className="th">OT hrs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.rows.map((r, i) => (
            <tr key={i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="td font-medium">{r.full_name}</td>
              <td className="td capitalize text-xs">{r.person_type}</td>
              <td className="td text-xs">{r.class_name ? `${r.class_name} ${r.section_name}` : r.designation || '—'}</td>
              <td className="td">{r.present || 0}</td>
              <td className="td text-amber-600 dark:text-amber-400">{r.late || 0}</td>
              <td className="td">{r.half_day || 0}</td>
              <td className="td text-rose-600 dark:text-rose-400">{r.absent || 0}</td>
              <td className="td">{r.early_exit || 0}</td>
              <td className="td">{r.overtime || 0}</td>
              <td className="td">{r.total_working_hours}</td>
              <td className="td">{r.overtime_hours || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportCard({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800"><h3 className="text-base font-semibold">{title}</h3></div>
      <div className="max-h-[480px] overflow-auto">{children}</div>
    </div>
  );
}
