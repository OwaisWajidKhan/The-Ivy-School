import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import Pagination, { useClientPagination } from '../components/Pagination';
import { useToast } from '../context/ToastContext';

export default function Users() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/admin/users', [], { params: { limit: 10000 } });
  const { data: roles } = useFetch('/access/roles');
  const { paginated, page, setPage, pageCount, total, pageSize, setPageSize } = useClientPagination(data?.items);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: '', person_type: 'admin', person_id: '', status: 'active' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(form)) body.append(k, v || '');
      if (avatarFile) body.append('avatar', avatarFile);
      await api.post('/admin/users', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('User created');
      setOpen(false); setAvatarFile(null); reload();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Users & Admins</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} user accounts</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm({ username: '', email: '', password: '', role: roles?.[0]?.name || '', person_type: 'admin', person_id: '', status: 'active' }); setAvatarFile(null); setOpen(true); }}>+ Create User</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : total === 0 ? <EmptyState title="No users" /> : (
          <>
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">Username</th><th className="th">Email</th><th className="th">Role</th><th className="th">Linked to</th><th className="th">Last login</th><th className="th">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginated.map(u => (
                <tr key={u.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td font-medium">{u.username}</td>
                  <td className="td text-xs">{u.email || '—'}</td>
                  <td className="td capitalize">{u.role_name.replace(/_/g, ' ')}</td>
                  <td className="td text-xs capitalize">{u.person_type} {u.linked_name ? `· ${u.linked_name}` : ''}</td>
                  <td className="td text-xs">{u.last_login_at || '—'}</td>
                  <td className="td"><Badge status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} pageSize={pageSize} onPageSizeChange={setPageSize} total={total} onChange={setPage} />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create User" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="user-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Create'}</button>
          </>
        }>
        <form id="user-form" onSubmit={submit} className="grid gap-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Username</label><input className="input" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
            <div><label className="label">Password</label><input className="input" type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {(roles || []).map(r => <option key={r.id} value={r.name}>{r.name.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Person type</label>
              <select className="input" value={form.person_type} onChange={e => setForm({ ...form, person_type: e.target.value })}>
                <option value="admin">Admin</option><option value="employee">Employee</option><option value="student">Student</option>
              </select>
            </div>
          </div>
          <div><label className="label">Linked person ID</label><input className="input" type="number" value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })} placeholder="Optional" /></div>
          <div>
            <label className="label">Profile picture</label>
            <div className="flex items-center gap-3">
              {avatarFile && <img src={URL.createObjectURL(avatarFile)} className="h-10 w-10 rounded-full object-cover" alt="preview" />}
              <input className="input" type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] || null)} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
