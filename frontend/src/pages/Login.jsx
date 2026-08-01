import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Spinner from '../components/Spinner';
import { useToast } from '../context/ToastContext';

const DEMO = [
  { u: 'superadmin', p: 'Admin@123', label: 'Super Admin' },
  { u: 'admin', p: 'Admin@123', label: 'School Admin' },
  { u: 'hr', p: 'Admin@123', label: 'HR' },
  { u: 'teacher_2', p: 'Teacher@123', label: 'Teacher' },
  { u: 'emp1', p: 'Emp@123', label: 'Employee' },
  { u: 'parent1', p: 'Parent@123', label: 'Parent' }
];

export default function Login() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      toast.success('Signed in successfully');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-600 via-brand-700 to-slate-900 p-4">
      <button onClick={toggle} className="hover-grow fixed right-4 top-4 rounded-lg bg-white/10 p-2 text-white backdrop-blur">
        {dark ? '☀️' : '🌙'}
      </button>
      <div className="w-full max-w-md">
        <div className="animate-slide-down mb-8 text-center">
          <div className="animate-float mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-black text-brand-700 shadow-lg">I</div>
          <h1 className="text-2xl font-bold text-white">The Ivy School</h1>
          <p className="text-sm text-brand-100">Cloud Attendance Management System</p>
        </div>

        <form onSubmit={submit} className="animate-slide-up rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
          <h2 className="mb-1 text-lg font-bold text-slate-800 dark:text-white">Sign in</h2>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Use your account credentials to continue</p>

          {error && (
            <div className="animate-pop mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
              {error}
            </div>
          )}

          <label className="label">Username</label>
          <input className="input mb-4" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. admin" autoFocus />

          <label className="label">Password</label>
          <input className="input mb-5" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? <Spinner size={18} /> : 'Sign in'}
          </button>
        </form>

        <div className="card animate-slide-up mt-4 p-4" style={{ animationDelay: '0.1s' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Demo accounts</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DEMO.map((d, i) => (
              <button
                key={d.u}
                className="hover-lift rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
                style={{ animationDelay: `${0.15 + i * 0.05}s` }}
                onClick={() => { setUsername(d.u); setPassword(d.p); }}
              >
                <span className="block font-semibold">{d.label}</span>
                <span className="text-slate-400">{d.u}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
