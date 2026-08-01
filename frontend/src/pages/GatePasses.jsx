import { useState, useEffect } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const REASONS = ['Early Pickup', 'Medical', 'Event', 'Other'];

export default function GatePasses() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/gate-passes', [params], { params });
  const { data: students } = useFetch('/students', [], { params: { limit: 500 } });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', reason: 'Early Pickup', exit_date: new Date().toISOString().slice(0, 10), guardian_name: '', guardian_cnic: '', guardian_relation: 'Parent', guardian_contact: '', reason_note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verifyUid, setVerifyUid] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => {
    setParams({ status: filter || undefined, q: query || undefined });
  }, [filter, query]);

  const canReview = hasPermission('approve_leave');
  const canRequest = canReview || hasPermission('manage_students');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/gate-passes', form);
      toast.success('Gate pass request submitted');
      setOpen(false); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed to request'); } finally { setSaving(false); }
  };

  const review = async (id, status) => {
    try {
      await api.put(`/gate-passes/${id}/status`, { status });
      toast.success(status === 'approved' ? 'Gate pass approved' : status === 'rejected' ? 'Gate pass rejected' : 'Gate pass cancelled');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const verifyExit = async (e) => {
    e.preventDefault();
    if (!verifyUid) return setVerifyError('RFID UID is required');
    setVerifyBusy(true); setVerifyError(''); setVerifyResult(null);
    try {
      const { data } = await api.post('/gate-passes/verify-exit', { uid: verifyUid });
      setVerifyResult(data.data);
      toast.success(`Exit verified for ${data.data.full_name}`);
      reload();
    } catch (err) { setVerifyError(err.response?.data?.message || 'Verification failed'); } finally { setVerifyBusy(false); }
  };

  const openSlip = (id) => {
    window.open(`/api/gate-passes/${id}/slip`, '_blank');
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Student Gate Passes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} total passes</p>
        </div>
        {canRequest && <button className="btn-primary" onClick={() => { setForm({ student_id: '', reason: 'Early Pickup', exit_date: new Date().toISOString().slice(0, 10), guardian_name: '', guardian_cnic: '', guardian_relation: 'Parent', guardian_contact: '', reason_note: '' }); setError(''); setOpen(true); }}>+ Request Gate Pass</button>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h3 className="mb-4 text-base font-semibold">Exit Verification (RFID)</h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Scan the student's RFID card at the gate. If they have an approved gate pass for today, it is marked as used and the exit is recorded.</p>
          <form onSubmit={verifyExit} className="space-y-3">
            <input className="input font-mono" placeholder="Scan / enter RFID UID… e.g. STU000001" value={verifyUid} onChange={e => setVerifyUid(e.target.value)} autoFocus />
            {verifyError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{verifyError}</div>}
            <button className="btn-primary w-full" disabled={verifyBusy}>{verifyBusy ? <Spinner size={16} /> : 'Verify exit'}</button>
          </form>
          {verifyResult && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="font-semibold">{verifyResult.full_name} verified</p>
              <p className="text-sm text-slate-500">{verifyResult.pass_no} · {verifyResult.reason} · {fmtDate(verifyResult.exit_date)}</p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Status: {verifyResult.status}{verifyResult.verifiedAt ? ` · verified at ${verifyResult.verifiedAt}` : ''}</p>
            </div>
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {['', 'pending', 'approved', 'used', 'rejected', 'cancelled'].map(s => (
                <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === s ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                </button>
              ))}
            </div>
          </div>
          {loading ? <div className="p-4"><PageLoader /></div> : data?.items.length === 0 ? <div className="p-4"><EmptyState title="No gate passes" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="th">Pass No</th>
                    <th className="th">Student</th>
                    <th className="th">Reason</th>
                    <th className="th">Exit Date</th>
                    <th className="th">Guardian</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.items.map(p => (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td font-mono text-xs">{p.pass_no}</td>
                      <td className="td">
                        <p className="font-medium">{p.full_name}</p>
                        <p className="font-mono text-xs text-slate-400">{p.student_id} {p.class_name ? `· ${p.class_name}${p.section_name ? ' ' + p.section_name : ''}` : ''}</p>
                      </td>
                      <td className="td">
                        <p>{p.reason}</p>
                        {p.reason_note && <p className="text-xs text-slate-400">{p.reason_note}</p>}
                      </td>
                      <td className="td">{fmtDate(p.exit_date)}</td>
                      <td className="td">
                        <p>{p.guardian_name || '—'}</p>
                        {p.guardian_contact && <p className="text-xs text-slate-400">{p.guardian_contact}</p>}
                      </td>
                      <td className="td"><Badge status={p.status} /></td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-2">
                          {p.status === 'pending' && canReview && (
                            <>
                              <button className="btn-success !px-2.5 !py-1 text-xs" onClick={() => review(p.id, 'approved')}>Approve</button>
                              <button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => review(p.id, 'rejected')}>Reject</button>
                            </>
                          )}
                          {(p.status === 'approved' || p.status === 'used') && (
                            <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openSlip(p.id)}>🖨 Slip</button>
                          )}
                          {p.status === 'approved' && (
                            <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => review(p.id, 'cancelled')}>Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Request Gate Pass" width="max-w-lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="gp-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Submit request'}</button>
          </>
        }>
        <form id="gp-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="col-span-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div>
            <label className="label">Student *</label>
            <select className="input" required value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Select student</option>
              {students?.items?.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reason *</label>
            <select className="input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Exit date *</label><input className="input" type="date" required value={form.exit_date} onChange={e => setForm({ ...form, exit_date: e.target.value })} /></div>
          <div><label className="label">Reason note</label><input className="input" value={form.reason_note} onChange={e => setForm({ ...form, reason_note: e.target.value })} placeholder="Optional details" /></div>
          <div><label className="label">Guardian name</label><input className="input" value={form.guardian_name} onChange={e => setForm({ ...form, guardian_name: e.target.value })} /></div>
          <div><label className="label">Guardian CNIC</label><input className="input" value={form.guardian_cnic} onChange={e => setForm({ ...form, guardian_cnic: e.target.value })} /></div>
          <div>
            <label className="label">Relation</label>
            <select className="input" value={form.guardian_relation} onChange={e => setForm({ ...form, guardian_relation: e.target.value })}>
              {['Parent', 'Father', 'Mother', 'Grandparent', 'Guardian', 'Other'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Guardian contact</label><input className="input" value={form.guardian_contact} onChange={e => setForm({ ...form, guardian_contact: e.target.value })} /></div>
        </form>
      </Modal>
    </div>
  );
}
