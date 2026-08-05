import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import useFetch from '../lib/useFetch';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import { PageLoader } from '../components/Spinner';
import { fmtDate, timeAgo, fmtHours } from '../lib/format';
import { useAuth } from '../context/AuthContext';

const I = (path, w = 22) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/dashboard');

  if (loading || !data) return <PageLoader label="Loading dashboard…" />;

  const { students, employees, system, timeline, weekly, notificationFeed } = data;

  const cardStyle = 'text-brand-600 dark:text-brand-400';

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h2 className="text-xl font-bold">Welcome back, <span className="capitalize">{user?.username}</span> 👋</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Here's what's happening at The Ivy School today ({fmtDate(data.date)}).</p>
      </div>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Students Present"
          value={`${students.presentToday} / ${students.total}`}
          sub={`${students.late} late today`}
          icon={I('M22 10 12 5 2 10l10 5 10-5Z M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5 M22 10v6')}
          accent={cardStyle}
        />
        <StatCard
          label="Staff Present"
          value={`${employees.presentToday} / ${employees.total}`}
          sub={`${employees.late} late · ${employees.overtime} overtime`}
          icon={I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75')}
          accent={cardStyle}
        />
      </div>

      {notificationFeed?.length > 0 && (
        <div className="stagger grid grid-cols-1 gap-6">
          <div className="card card-hover p-5">
            <h3 className="mb-3 text-base font-semibold">Notifications</h3>
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {notificationFeed.map(n => (
                <div key={n.id} className={`rounded-lg border px-3 py-2 transition-colors hover:border-brand-400 ${n.read ? 'border-slate-100 dark:border-slate-800' : 'border-brand-200 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/10'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="stagger grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card card-hover p-5 xl:col-span-2">
          <h3 className="mb-4 text-base font-semibold">Attendance Trend — Last 7 Days</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="present" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#63224a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#63224a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip labelFormatter={d => `Date: ${d}`} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#63224a" strokeWidth={2} fill="url(#present)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-hover p-5">
          <h3 className="mb-4 text-base font-semibold">Today's Timeline</h3>
          <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
            {timeline.length === 0 && <p className="text-sm text-slate-400">No entries yet today.</p>}
            {timeline.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="hover-grow flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {(t.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.full_name}</p>
                  <p className="text-xs text-slate-400">{t.in_time} · {t.person_type}</p>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stagger grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card card-hover p-5">
          <h3 className="mb-3 text-base font-semibold">Recent Scans</h3>
          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {system.recentScans.length === 0 && <p className="text-sm text-slate-400">No scans recorded.</p>}
            {system.recentScans.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.full_name || s.raw_uid}</p>
                  <p className="text-xs text-slate-400">{s.location || '—'} · {s.direction}</p>
                </div>
                <span className="text-xs text-slate-400">{timeAgo(s.scan_time)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-hover p-5">
          <h3 className="mb-3 text-base font-semibold">Student Status</h3>
          <div className="space-y-3">
            {[
              ['Present', students.present, 'bg-emerald-500'],
              ['Late', students.late, 'bg-amber-500'],
              ['Half Day', students.half_day, 'bg-orange-500'],
              ['Absent', students.absent || Math.max(0, students.total - students.presentToday), 'bg-rose-500']
            ].map(([label, val, color]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-semibold">{val}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`animate-grow-bar h-2 rounded-full ${color}`} style={{ width: `${(val / Math.max(students.total, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-hover p-5">
          <h3 className="mb-3 text-base font-semibold">Staff Status</h3>
          <div className="space-y-3">
            {[
              ['Present', employees.present, 'bg-emerald-500'],
              ['Late', employees.late, 'bg-amber-500'],
              ['Overtime', employees.overtime, 'bg-violet-500'],
              ['Early Exit', employees.early_exit, 'bg-sky-500']
            ].map(([label, val, color]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-semibold">{val}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`animate-grow-bar h-2 rounded-full ${color}`} style={{ width: `${(val / Math.max(employees.total, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
