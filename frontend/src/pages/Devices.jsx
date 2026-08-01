import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { timeAgo } from '../lib/format';
import { useToast } from '../context/ToastContext';

export default function Devices() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/devices');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ device_name: '', device_id: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/devices', form);
      toast.success('Device registered');
      setOpen(false); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  const toggleStatus = async (d) => {
    try { await api.put(`/devices/${d.id}`, { status: d.status === 'online' ? 'offline' : 'online' }); toast.success(d.status === 'online' ? 'Device set offline' : 'Device set online'); reload(); } catch { /* ignore */ }
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">RFID Devices</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.length || 0} registered readers</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm({ device_name: '', device_id: '', location: '' }); setOpen(true); }}>+ Register Device</button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <PageLoader /> : data?.length === 0 ? <EmptyState title="No devices registered" /> : data?.map(d => (
          <div key={d.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{d.device_name}</h3>
                <p className="font-mono text-xs text-slate-400">{d.device_id}</p>
              </div>
              <span className={`h-3 w-3 rounded-full ${d.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <p>📍 {d.location || 'No location set'}</p>
              <p>🕒 Last sync: {timeAgo(d.last_sync_time)}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge status={d.status} />
              <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => toggleStatus(d)}>Toggle</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Register Device" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="device-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Register'}</button>
          </>
        }>
        <form id="device-form" onSubmit={submit} className="grid gap-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div><label className="label">Device name</label><input className="input" required value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} placeholder="Main Gate Reader" /></div>
          <div><label className="label">Device ID</label><input className="input font-mono" required value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })} placeholder="DEV-MAIN-02" /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Main Entrance" /></div>
        </form>
      </Modal>
    </div>
  );
}
