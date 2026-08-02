import { useState } from 'react';
import api from '../lib/api';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [avatar, setAvatar] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [form, setForm] = useState({ email: user?.email || '', currentPassword: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const uploadAvatar = async (e) => {
    e.preventDefault();
    if (!avatar) return setError('Select an image first');
    setAvatarBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('avatar', avatar);
      const { data } = await api.put('/auth/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUser({ ...(user || {}), ...data.data.user });
      setAvatar(null);
      setMsg('Profile picture updated.');
      toast.success('Profile picture updated');
    } catch (err) { setError(err.response?.data?.message || 'Upload failed'); } finally { setAvatarBusy(false); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      const body = { email: form.email };
      if (form.currentPassword && form.password) {
        body.currentPassword = form.currentPassword;
        body.password = form.password;
      }
      const { data } = await api.put('/auth/me', body);
      setUser({ ...(user || {}), ...data.data.user });
      setForm(f => ({ ...f, currentPassword: '', password: '' }));
      setMsg('Profile saved.');
      toast.success('Profile saved');
    } catch (err) { setError(err.response?.data?.message || 'Failed to save'); } finally { setSaving(false); }
  };

  return (
    <div className="animate-slide-up mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">My Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage your account picture and login details</p>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">Profile Picture</h3>
        <form onSubmit={uploadAvatar} className="flex flex-wrap items-center gap-4">
          {user?.avatar
            ? <img src={user.avatar} className="h-16 w-16 rounded-full object-cover" alt="avatar" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold uppercase text-white">{(user?.username || '?').charAt(0)}</div>}
          <div className="flex-1">
            <input className="input" type="file" accept="image/*" onChange={e => setAvatar(e.target.files?.[0] || null)} />
          </div>
          <button className="btn-primary" type="submit" disabled={avatarBusy || !avatar}>{avatarBusy ? <Spinner size={16} /> : 'Upload'}</button>
        </form>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">Account Details</h3>
        <form onSubmit={saveProfile} className="space-y-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">{msg}</div>}
          <div>
            <label className="label">Username</label>
            <input className="input" value={user?.username || ''} disabled />
          </div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="label">Current password</label><input className="input" type="password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} placeholder="Leave blank to keep" /></div>
            <div><label className="label">New password</label><input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save changes'}</button>
        </form>
      </div>
    </div>
  );
}