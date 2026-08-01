import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';

export default function Cards() {
  const toast = useToast();
  const { data: dash, loading: dashLoading, reload: reloadDash } = useFetch('/cards/dashboard');
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/cards', [params], { params });
  const { data: people } = useFetch('/cards/pool', [], {});
  const [assignOpen, setAssignOpen] = useState(false);
  const [form, setForm] = useState({ person_type: 'student', person_id: '', uid: '' });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/cards/assign', form);
      toast.success('Card assigned');
      setAssignOpen(false); reload(); reloadDash();
    } catch (err) { setError(err.response?.data?.message || 'Assignment failed'); } finally { setBusy(false); }
  };

  const setStatus = async (id, status) => {
    try {
      await api.put(`/cards/${id}/status`, { status });
      toast.success(status === 'blocked' ? 'Card blocked' : 'Card activated');
      reload(); reloadDash();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const reissue = async (id) => {
    try {
      await api.post(`/cards/${id}/reissue`);
      toast.success('Card reissued');
      reload(); reloadDash();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const doBulk = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setBulkMsg('');
    try {
      const { data } = await api.post('/cards/bulk', { csv: bulkCsv });
      const r = data.data;
      setBulkMsg(`Assigned ${r.assigned || 0}, skipped ${r.skipped || 0}.${r.errors?.length ? ` Errors: ${r.errors.slice(0, 5).join('; ')}` : ''}`);
      toast.success('Bulk import complete');
      setBulkCsv(''); reload(); reloadDash();
    } catch (err) { setError(err.response?.data?.message || 'Import failed'); } finally { setBusy(false); }
  };

  const stats = [
    { label: 'Active cards', value: dash?.active ?? '—', cls: 'text-emerald-600' },
    { label: 'Blocked', value: dash?.blocked ?? '—', cls: 'text-rose-600' },
    { label: 'Unassigned', value: dash?.unassigned ?? '—', cls: 'text-amber-600' },
    { label: 'Total cards', value: dash?.total ?? '—', cls: 'text-brand-600' },
    { label: 'People without card', value: dash?.peopleWithoutCard ?? '—', cls: 'text-slate-600' }
  ];

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">RFID Cards</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage student & employee access cards</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => { setBulkCsv(''); setError(''); setBulkMsg(''); setBulkOpen(true); }}>Bulk import</button>
          <button className="btn-primary" onClick={() => { setForm({ person_type: 'student', person_id: '', uid: '' }); setError(''); setAssignOpen(true); }}>+ Assign card</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(s => (
          <div key={s.label} className="card p-4">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {['', 'active', 'blocked', 'unassigned'].map(s => (
            <button key={s} onClick={() => setParams({ status: s || undefined })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${params.status === s || (!params.status && s === '') ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
        {loading ? <PageLoader /> : data?.items?.length === 0 ? <EmptyState title="No cards" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="th">Card UID</th>
                  <th className="th">Type</th>
                  <th className="th">Person</th>
                  <th className="th">Class</th>
                  <th className="th">Assigned</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.items?.map(c => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono text-xs">{c.uid}</td>
                    <td className="td"><Badge status={c.card_type} /></td>
                    <td className="td font-medium">{c.person_name || '—'} <span className="ml-1 text-xs text-slate-400">{c.person_code || ''}</span></td>
                    <td className="td">{c.class_name || '—'}</td>
                    <td className="td">{c.assigned_at ? fmtDate(c.assigned_at) : '—'}</td>
                    <td className="td"><Badge status={c.status} /></td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        {c.status === 'blocked' ? (
                          <button className="btn-success !px-2 !py-1 text-xs" onClick={() => setStatus(c.id, 'active')}>Activate</button>
                        ) : (
                          <button className="btn-danger !px-2 !py-1 text-xs" onClick={() => setStatus(c.id, 'blocked')}>Block</button>
                        )}
                        <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => reissue(c.id)}>Reissue</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign RFID Card" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssignOpen(false)}>Cancel</button>
            <button className="btn-primary" form="assign-form" type="submit" disabled={busy}>{busy ? <Spinner size={16} /> : 'Assign'}</button>
          </>
        }>
        <form id="assign-form" onSubmit={submit} className="grid gap-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div>
            <label className="label">Person type</label>
            <select className="input" value={form.person_type} onChange={e => setForm({ ...form, person_type: e.target.value, person_id: '' })}>
              <option value="student">Student</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          <div>
            <label className="label">Person *</label>
            <select className="input" required value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
              <option value="">Select person</option>
              {(people?.[form.person_type] || []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Card UID *</label>
            <input className="input font-mono" required value={form.uid} onChange={e => setForm({ ...form, uid: e.target.value })} placeholder="e.g. STU000001 / EMP000001" />
          </div>
        </form>
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Import Cards (CSV)" width="max-w-lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>Close</button>
            <button className="btn-primary" form="bulk-form" type="submit" disabled={busy}>{busy ? <Spinner size={16} /> : 'Import'}</button>
          </>
        }>
        <form id="bulk-form" onSubmit={doBulk} className="grid gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            One card per line: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">uid,card_type,person_code</code><br />
            Example: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">STU10001,student,S-0001</code>
          </p>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          {bulkMsg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">{bulkMsg}</div>}
          <textarea className="input min-h-40 font-mono text-xs" value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} placeholder="STU10001,student,S-0001&#10;EMP10001,employee,E-0001" />
        </form>
      </Modal>
    </div>
  );
}
