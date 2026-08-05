import { useState, useEffect } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { useToast } from '../context/ToastContext';

const empty = {
  full_name: '', mobile: '', department_id: '', status: 'active'
};

export default function Employees() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [deptId, setDeptId] = useState('');
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/employees', [params], { params });
  const { data: departments } = useFetch('/reference/departments');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    setParams({ q: query || undefined, department_id: deptId || undefined });
  }, [query, deptId]);

  const openAdd = () => { setForm(empty); setEditingId(null); setError(''); setPhotoFile(null); setOpen(true); };
  const openEdit = (e) => {
    setForm({
      full_name: e.full_name, mobile: e.mobile || '', department_id: e.department_id || '', status: e.status
    });
    setEditingId(e.id);
    setError('');
    setPhotoFile(null);
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) body.append(k, v); });
      if (photoFile) body.append('photo', photoFile);
      if (editingId) await api.put(`/employees/${editingId}`, body);
      else await api.post('/employees', body);
      toast.success(editingId ? 'Employee updated' : 'Employee saved');
      setOpen(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try { await api.delete(`/employees/${id}`); toast.success('Employee deleted'); reload(); } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Employees</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} total employees</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Search name, number…" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
            <option value="">All departments</option>
            {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.items.length === 0 ? <EmptyState title="No employees found" /> : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Number</th>
                <th className="th">Department</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.items.map(e => (
                <tr key={e.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      {e.photo
                        ? <img src={e.photo} className="h-9 w-9 rounded-full object-cover" alt="" />
                        : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{e.full_name.charAt(0)}</div>}
                      <div>
                        <p className="font-medium">{e.full_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td font-mono text-xs">{e.mobile || '—'}</td>
                  <td className="td">{e.department || '—'}</td>
                  <td className="td text-right">
                    <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openEdit(e)}>Edit</button>
                    <button className="btn-danger ml-1.5 !px-2.5 !py-1 text-xs" onClick={() => setDeleting(e)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Employee' : 'Add Employee'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="emp-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
          </>
        }>
        <form id="emp-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="col-span-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div><label className="label">Name *</label><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Number</label><input className="input" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="03xx-xxxxxxx" /></div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">Select</option>
              {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Picture</label>
            <input className="input" type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files[0])} />
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete employee" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" onClick={() => remove(deleting.id)}>Delete permanently</button>
          </>
        }>
        <p>Are you sure you want to delete <strong>{deleting?.full_name}</strong>? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
