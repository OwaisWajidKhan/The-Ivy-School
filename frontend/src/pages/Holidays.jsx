import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';

export default function Holidays() {
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading, reload } = useFetch('/reference/holidays', [year], { params: { year } });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', type: 'Public', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/reference/holidays', form);
      toast.success('Holiday added');
      setOpen(false); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this holiday?')) return;
    await api.delete(`/reference/holidays/${id}`);
    toast.success('Holiday deleted');
    reload();
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Holidays</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Holidays are excluded from working-day and payroll calculations</p>
        </div>
        <div className="flex gap-2">
          <input className="input w-28" type="number" value={year} onChange={e => setYear(+e.target.value)} />
          <button className="btn-primary" onClick={() => { setForm({ name: '', date: '', type: 'Public', description: '' }); setOpen(true); }}>+ Add Holiday</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.length === 0 ? <EmptyState title="No holidays in this year" /> : (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">Name</th><th className="th">Date</th><th className="th">Type</th><th className="th">Description</th><th className="th text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map(h => (
                <tr key={h.id}>
                  <td className="td font-medium">{h.name}</td>
                  <td className="td">{fmtDate(h.date)}</td>
                  <td className="td">{h.type}</td>
                  <td className="td text-sm text-slate-500">{h.description || '—'}</td>
                  <td className="td text-right"><button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => remove(h.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Holiday" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="holiday-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
          </>
        }>
        <form id="holiday-form" onSubmit={submit} className="grid gap-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date</label><input className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {['Public', 'Religious', 'School Event', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        </form>
      </Modal>
    </div>
  );
}
