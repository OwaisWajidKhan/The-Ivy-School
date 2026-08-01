import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate, timeAgo } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TYPES = ['Casual', 'Sick', 'Annual', 'Emergency', 'Without Pay'];

export default function Leaves() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/leaves');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type: 'Casual', start_date: '', end_date: '', reason: '' });
  const [doc, setDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const canReview = hasPermission('approve_leave');
  const canRequest = ['teacher', 'employee', 'parent'].includes(user?.role) || hasPermission('manage_leave');

  const filtered = filter ? data?.items.filter(l => l.status === filter) : data?.items;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) body.append(k, v); });
      if (doc) body.append('document', doc);
      await api.post('/leaves', body);
      toast.success('Leave request submitted');
      setOpen(false); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed to submit'); } finally { setSaving(false); }
  };

  const review = async (id, status) => {
    try {
      await api.put(`/leaves/${id}/status`, { status });
      toast.success(status === 'approved' ? 'Leave approved' : status === 'rejected' ? 'Leave rejected' : 'Leave cancelled');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Leave Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} total requests</p>
        </div>
        {canRequest && <button className="btn-primary" onClick={() => { setForm({ leave_type: 'Casual', start_date: '', end_date: '', reason: '' }); setError(''); setOpen(true); }}>+ Request Leave</button>}
      </div>

      {canReview && (
        <div className="card inline-flex gap-1 p-1">
          {['', 'pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${filter === s ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : filtered?.length === 0 ? <EmptyState title="No leave requests" /> : (
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Employee</th><th className="th">Type</th><th className="th">From</th><th className="th">To</th>
                <th className="th">Days</th><th className="th">Reason</th><th className="th">Requested</th><th className="th">Status</th>
                {canReview && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered?.map(l => (
                <tr key={l.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td">
                    <p className="font-medium">{l.full_name}</p>
                    <p className="text-xs text-slate-400 capitalize">{l.person_type}</p>
                  </td>
                  <td className="td">{l.leave_type}</td>
                  <td className="td">{fmtDate(l.start_date)}</td>
                  <td className="td">{fmtDate(l.end_date)}</td>
                  <td className="td">{l.days}</td>
                  <td className="td max-w-[200px] truncate">{l.reason || '—'}</td>
                  <td className="td text-xs">{timeAgo(l.created_at)}</td>
                  <td className="td"><Badge status={l.status} /></td>
                  {canReview && (
                    <td className="td text-right whitespace-nowrap">
                      {l.status === 'pending' && (
                        <>
                          <button className="btn-success !px-2.5 !py-1 text-xs" onClick={() => review(l.id, 'approved')}>Approve</button>
                          <button className="btn-danger ml-1.5 !px-2.5 !py-1 text-xs" onClick={() => review(l.id, 'rejected')}>Reject</button>
                        </>
                      )}
                      {l.status !== 'pending' && l.status !== 'cancelled' && (
                        <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => review(l.id, 'cancelled')}>Cancel</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Request Leave" width="max-w-lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="leave-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Submit request'}</button>
          </>
        }>
        <form id="leave-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="col-span-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div>
            <label className="label">Leave type</label>
            <select className="input" value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Start date</label><input className="input" type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div><label className="label">End date</label><input className="input" type="date" required value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <textarea className="input" rows="3" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Supporting document</label>
            <input className="input" type="file" onChange={e => setDoc(e.target.files[0])} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
