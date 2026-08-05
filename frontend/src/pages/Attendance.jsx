import { useRef, useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate, fmtHours, timeAgo, todayStr } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Download an authenticated CSV (axios sends the Bearer header, unlike a plain
// window.open). Parses the filename from Content-Disposition when present.
const downloadCsv = async (path) => {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    const cd = res.headers['content-disposition'] || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    a.download = m ? m[1] : 'attendance.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
};

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
      {children}
    </button>
  );
}

export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const [tab, setTab] = useState('today');
  const [todayData, setTodayData] = useState(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const loadToday = async () => {
    setTodayLoading(true);
    try {
      const { data } = await api.get('/attendance/today');
      setTodayData(data.data);
    } catch { /* ignore */ } finally { setTodayLoading(false); }
  };
  if (tab === 'today' && !todayData && !todayLoading) loadToday();

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Attendance</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Live RFID scans, today's status, and manual overrides</p>
        </div>
        <div className="flex gap-2">
          {hasPermission('manage_attendance') && (
            <button className="btn-secondary" onClick={() => setManualOpen(true)}>Manual Mark</button>
          )}
          <button className="btn-primary" onClick={() => { setTodayData(null); loadToday(); }}>Refresh</button>
        </div>
      </div>

      <div className="card inline-flex gap-1 p-1">
        <Tab active={tab === 'today'} onClick={() => setTab('today')}>Today</Tab>
        <Tab active={tab === 'summary'} onClick={() => setTab('summary')}>Summary</Tab>
        <Tab active={tab === 'scan'} onClick={() => setTab('scan')}>RFID Scanner</Tab>
        <Tab active={tab === 'logs'} onClick={() => setTab('logs')}>Raw Logs</Tab>
      </div>

      {tab === 'today' && <TodayView data={todayData} loading={todayLoading} />}
      {tab === 'summary' && <SummaryView />}
      {tab === 'scan' && <ScanSimulator />}
      {tab === 'logs' && <LogsView />}

      <ManualMark open={manualOpen} onClose={() => setManualOpen(false)} onSaved={() => { setTodayData(null); loadToday(); }} />
    </div>
  );
}

function TodayView({ data, loading }) {
  if (loading || !data) return <PageLoader label="Loading today's attendance…" />;
  const presentCount = (rows) => rows.filter(r => r.status !== 'absent' && r.in_time).length;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Section title={`Students — ${presentCount(data.students)} / ${data.students.length} present`}>
        <table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Class</th><th className="th">In</th><th className="th">Out</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.students.map(s => (
              <tr key={s.id}>
                <td className="td font-medium">{s.full_name}</td>
                <td className="td text-xs">{s.class_name} · {s.section_name}</td>
                <td className="td">{s.in_time || '—'}</td>
                <td className="td">{s.out_time || '—'}</td>
                <td className="td"><Badge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`Staff — ${presentCount(data.employees)} / ${data.employees.length} present`}>
        <table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Designation</th><th className="th">In</th><th className="th">Out</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.employees.map(s => (
              <tr key={s.id}>
                <td className="td font-medium">{s.full_name}</td>
                <td className="td text-xs">{s.designation}</td>
                <td className="td">{s.in_time || '—'}</td>
                <td className="td">{s.out_time || '—'}</td>
                <td className="td"><Badge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800"><h3 className="text-base font-semibold">{title}</h3></div>
      <div className="max-h-[520px] overflow-auto">{children}</div>
    </div>
  );
}

function SummaryView() {
  const toast = useToast();
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/attendance/summary', [params], { params });
  const doExport = async () => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const ok = await downloadCsv(`/attendance/export?${q.toString()}`);
    if (!ok) toast.error('Export failed');
  };
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-5">
          <input className="input" type="date" defaultValue={todayStr()} onChange={e => setParams(p => ({ ...p, date: e.target.value }))} />
          <select className="input" value={params.person_type || ''} onChange={e => setParams(p => ({ ...p, person_type: e.target.value || undefined }))}>
            <option value="">All people</option><option value="student">Students</option><option value="employee">Employees</option>
          </select>
          <select className="input" value={params.status || ''} onChange={e => setParams(p => ({ ...p, status: e.target.value || undefined }))}>
            <option value="">All statuses</option>
            {['present', 'late', 'absent', 'half_day', 'early_exit', 'overtime'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <input className="input" type="date" onChange={e => setParams(p => ({ ...p, from: e.target.value, date: undefined }))} title="From date" />
          <input className="input" type="date" onChange={e => setParams(p => ({ ...p, to: e.target.value, date: undefined }))} title="To date" />
        </div>
        <div className="mt-3 flex justify-end">
          <button className="btn-secondary" onClick={doExport}>⬇ Export CSV</button>
        </div>
      </div>
      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.items.length === 0 ? <EmptyState title="No attendance records" subtitle="Try a different date or filter." /> : (
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">Date</th><th className="th">Person</th><th className="th">Type</th><th className="th">Class/Dept</th><th className="th">In</th><th className="th">Out</th><th className="th">Hours</th><th className="th">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.items.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td">{fmtDate(r.date)}</td>
                  <td className="td font-medium">{r.full_name}</td>
                  <td className="td capitalize text-xs">{r.person_type}</td>
                  <td className="td text-xs">{r.class_name ? `${r.class_name} ${r.section_name}` : r.designation || '—'}</td>
                  <td className="td">{r.in_time || '—'}</td>
                  <td className="td">{r.out_time || '—'}</td>
                  <td className="td">{fmtHours(r.working_hours)}</td>
                  <td className="td"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ScanSimulator() {
  const [uid, setUid] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const refocus = () => { setUid(''); inputRef.current?.focus(); };

  const scan = async (value) => {
    const id = (value ?? uid).trim();
    if (!id) return setError('RFID UID is required');
    setError(''); setResult(null);
    try {
      const { data } = await api.post('/attendance/scan', { uid: id, device_id: 'DEV-MAIN-01', location: 'Main Entrance' });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Scan failed');
    } finally {
      refocus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      scan(e.target.value);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">RFID Scanner</h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Tap your card on the reader — the scan is recorded automatically. Keep this tab open.</p>
        <div>
          <label className="label">RFID UID</label>
          <input ref={inputRef} className="input font-mono text-lg" value={uid} onChange={e => setUid(e.target.value)} onKeyDown={onKeyDown} placeholder="Waiting for card scan…" autoFocus />
        </div>
        {error && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">Scan Result</h3>
        {!result && !error && <p className="text-sm text-slate-400">Scan a card to see the result here.</p>}
        {result && (
          <div className="space-y-4">
            <div className={`flex items-center gap-4 rounded-xl border p-4 ${result.direction === 'IN' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10'}`}>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold ${result.direction === 'IN' ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                {result.direction === 'IN' ? 'IN' : 'OUT'}
              </div>
              <div>
                <p className="font-semibold">{result.person?.name}</p>
                <p className="text-sm text-slate-500">{result.message}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Type', result.person?.type],
                ['Status', result.summary?.status],
                ['In time', result.summary?.in_time],
                ['Out time', result.summary?.out_time || '—'],
                ['Working hours', fmtHours(result.summary?.working_hours)],
                ['Late minutes', result.summary?.late_minutes || 0]
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <dt className="text-xs text-slate-400">{k}</dt>
                  <dd className="font-semibold capitalize">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function LogsView() {
  const toast = useToast();
  const [params, setParams] = useState({});
  const { data, loading } = useFetch('/attendance/logs', [params], { params });
  const doExport = async () => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const ok = await downloadCsv(`/attendance/export-logs?${q.toString()}`);
    if (!ok) toast.error('Export failed');
  };
  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center">
        <input className="input max-w-xs" type="date" defaultValue={todayStr()} onChange={e => setParams(p => ({ ...p, date: e.target.value }))} />
        <select className="input max-w-xs" onChange={e => setParams(p => ({ ...p, direction: e.target.value || undefined }))}>
          <option value="">All directions</option><option value="IN">IN</option><option value="OUT">OUT</option>
        </select>
        <button className="btn-secondary sm:ml-auto" onClick={doExport}>⬇ Export CSV</button>
      </div>
      {loading ? <PageLoader /> : data?.items.length === 0 ? <EmptyState title="No scans for this date" /> : (
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr><th className="th">#</th><th className="th">Card ID</th><th className="th">Person</th><th className="th">Type</th><th className="th">In/Out</th><th className="th">Device</th><th className="th">Location</th><th className="th">Time</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.items.map(l => (
              <tr key={l.id}>
                <td className="td font-mono text-xs">{l.id}</td>
                <td className="td font-mono text-xs">{l.raw_uid || '—'}</td>
                <td className="td font-medium">{l.full_name || <span className="text-xs text-rose-400">unknown</span>}</td>
                <td className="td capitalize text-xs">{l.person_type || '—'}</td>
                <td className="td"><Badge status={l.direction === 'IN' ? 'present' : 'half_day'} /></td>
                <td className="td font-mono text-xs">{l.device_id || '—'}</td>
                <td className="td text-xs">{l.location || '—'}</td>
                <td className="td text-xs">{fmtDate(l.scan_time, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ManualMark({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ person_type: 'student', person_id: '', date: todayStr(), in_time: '08:00', out_time: '', status: 'present' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/attendance/manual', form);
      toast.success('Attendance marked');
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manual Attendance Mark" width="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="manual-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </>
      }>
      <form id="manual-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && <div className="col-span-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
        <div>
          <label className="label">Person type</label>
          <select className="input" value={form.person_type} onChange={e => setForm({ ...form, person_type: e.target.value, person_id: '' })}>
            <option value="student">Student</option><option value="employee">Employee</option>
          </select>
        </div>
        <div><label className="label">{form.person_type === 'student' ? 'Student ID' : 'Employee ID'}</label><input className="input" required value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })} placeholder={form.person_type === 'student' ? 'e.g. S-0001' : 'e.g. E-0001'} /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['present', 'late', 'absent', 'half_day', 'early_exit', 'overtime'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className="label">In time</label><input className="input" type="time" value={form.in_time} onChange={e => setForm({ ...form, in_time: e.target.value })} /></div>
        <div><label className="label">Out time</label><input className="input" type="time" value={form.out_time} onChange={e => setForm({ ...form, out_time: e.target.value })} /></div>
      </form>
    </Modal>
  );
}
