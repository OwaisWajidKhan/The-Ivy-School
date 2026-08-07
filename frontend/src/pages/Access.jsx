import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { useToast } from '../context/ToastContext';

const PROTECTED = ['admin'];

export default function Access() {
  const toast = useToast();
  const { data: roles, loading, reload } = useFetch('/access/roles');
  const { data: groups } = useFetch('/access/permissions');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deletingRole, setDeletingRole] = useState(false);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', permissions: [] }); setError(''); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, description: r.description || '', permissions: r.permissions || [] }); setError(''); setOpen(true); };

  const toggle = (key) => {
    setForm(f => {
      const has = f.permissions.includes(key);
      return { ...f, permissions: has ? f.permissions.filter(k => k !== key) : [...f.permissions, key] };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { name: form.name, description: form.description, permissions: form.permissions };
      if (editing) await api.put(`/access/roles/${editing.id}`, body);
      else await api.post('/access/roles', body);
      toast.success(editing ? 'Role updated' : 'Role created');
      setOpen(false); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDeletingRole(true);
    try { await api.delete(`/access/roles/${deleting.id}`); toast.success('Role deleted'); setDeleting(null); reload(); }
    catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); setDeleting(null); }
    finally { setDeletingRole(false); }
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Roles & Permissions</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Create roles and control what each role can access</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ New Role</button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <PageLoader /> : (
          (roles || []).map(r => (
            <div key={r.id} className="card card-hover flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold capitalize">{r.name}</span>
                <Badge status={PROTECTED.includes(r.name) ? 'active' : 'inactive'} />
              </div>
              <p className="mt-1 flex-1 text-sm text-slate-500 dark:text-slate-400">{r.description || 'No description'}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">{r.permissions?.length || 0} permissions · {r.user_count || 0} user(s)</span>
                <div className="flex gap-1.5">
                  <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openEdit(r)}>Edit</button>
                  {!PROTECTED.includes(r.name) && (
                    <button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => setDeleting(r)}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {!loading && (roles || []).length === 0 && <EmptyState title="No roles yet" subtitle="Create your first role to start assigning permissions." />}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Role' : 'New Role'} width="max-w-3xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="role-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
          </>
        }>
        <form id="role-form" onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Role name *</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Teacher" /></div>
            <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" /></div>
          </div>

          <div>
            <label className="label">Permissions</label>
            <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto rounded-lg border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-3">
              {(groups || []).map(g => (
                <div key={g.group} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700/70 dark:text-sage-300">{g.group}</p>
                  {g.items.map(p => (
                    <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-sage-50 dark:hover:bg-slate-800">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
                      <span className="text-sm">{p.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete role" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" onClick={doDelete} disabled={deletingRole}>{deletingRole ? <Spinner size={16} /> : 'Delete'}</button>
          </>
        }>
        <p>Delete the role <strong className="capitalize">{deleting?.name}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  );
}