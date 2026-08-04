import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const ICONS = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  students: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /><path d="M22 10v6" /></svg>,
  employees: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  attendance: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" strokeLinecap="round" /></svg>,
  leaves: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11H6a4 4 0 0 0-4 4v6h8" /><path d="M15 11h3a4 4 0 0 1 4 4v6h-8" /><circle cx="12" cy="8" r="5" /></svg>,
  gatepass: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>,
  cards: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></svg>,
  hr: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18" /><path d="M4 21V7l6-4v18" /><path d="M10 21V3l10 5v13" /><path d="M6 10h4M6 14h4M14 10h4M14 14h4" /></svg>,
  payroll: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M12 10v9M8 15h8" /></svg>,
  reports: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="14" width="3" height="4" /></svg>,
  devices: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  holidays: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 15l1.5 1.5L17 13" /></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>,
  audit: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>,
  scan: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>,
  nursery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="20" r="2" /><circle cx="15" cy="20" r="2" /><path d="M7 20h10" /><path d="M8 12h8" /><path d="M10 8c0-2 2-3 2-5 0 2 2 3 2 5" /><path d="M9 16h6c1 0 2-1 2-2" /></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
};

function NavItem({ to, icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
            : 'text-slate-600 hover:translate-x-1 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`
      }
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>
      {label}
    </NavLink>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [wiggle, setWiggle] = useState(false);
  const ref = useRef(null);

  const load = () => {
    api.get('/notifications', { params: { limit: 12 } })
      .then(res => {
        const u = res.data.data.unread || 0;
        setItems(res.data.data.items || []);
        if (u > unread && unread > 0) { setWiggle(true); setTimeout(() => setWiggle(false), 700); }
        setUnread(u);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => { clearInterval(id); document.removeEventListener('mousedown', onDoc); };
  }, []);

  const markAll = async () => {
    try { await api.put('/notifications/read-all'); setUnread(0); load(); } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(o => !o); if (!open) load(); }} className="hover-grow relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title="Notifications">
        <span className={wiggle ? 'animate-wiggle inline-block' : 'inline-block'}>{ICONS.bell}</span>
        {unread > 0 && (
          <span className="animate-pop absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card animate-slide-down absolute right-0 z-20 mt-2 w-80 max-w-[85vw] p-2">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && <button className="text-xs text-brand-600 hover:underline dark:text-brand-400" onClick={markAll}>Mark all read</button>}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications</p>}
              {items.map(n => (
                <div key={n.id} className={`rounded-lg px-3 py-2 ${n.read ? '' : 'bg-brand-50 dark:bg-brand-500/10'}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{n.created_at}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, hasPermission } = useAuth();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const navGroups = [
    {
      items: [
        { to: '/', label: 'Dashboard', icon: ICONS.dashboard, show: true }
      ]
    },
    {
      label: 'People',
      items: [
        { to: '/students', label: 'Students', icon: ICONS.students, show: hasPermission('manage_students') || hasPermission('view_students') },
        { to: '/junior-nursery', label: 'Junior Nursery', icon: ICONS.nursery, show: hasPermission('manage_students') },
        { to: '/employees', label: 'Employees', icon: ICONS.employees, show: hasPermission('manage_employees') || hasPermission('view_employees') }
      ]
    },
    {
      label: 'Operations',
      items: [
        { to: '/attendance', label: 'Attendance', icon: ICONS.attendance, show: hasPermission('manage_attendance') || hasPermission('view_attendance') },
        { to: '/scans', label: 'Scan History', icon: ICONS.scan, show: hasPermission('manage_attendance') || hasPermission('view_attendance') },
        { to: '/leaves', label: 'Leaves', icon: ICONS.leaves, show: true },
        { to: '/gate-passes', label: 'Gate Passes', icon: ICONS.gatepass, show: hasPermission('manage_students') || hasPermission('approve_leave') || hasPermission('manage_attendance') || hasPermission('view_attendance') },
        { to: '/payroll', label: 'Payroll', icon: ICONS.payroll, show: hasPermission('manage_payroll') || hasPermission('generate_payroll') },
        { to: '/reports', label: 'Reports', icon: ICONS.reports, show: hasPermission('view_reports') }
      ]
    },
    {
      label: 'Human Resource',
      items: [
        { to: '/hr', label: 'HR Management', icon: ICONS.hr, show: hasPermission('manage_employees') || hasPermission('manage_settings') }
      ]
    },
    {
      label: 'Administration',
      items: [
        { to: '/cards', label: 'RFID Cards', icon: ICONS.cards, show: hasPermission('manage_devices') || hasPermission('manage_attendance') },
        { to: '/devices', label: 'Devices', icon: ICONS.devices, show: hasPermission('manage_devices') },
        { to: '/users', label: 'Users & Admins', icon: ICONS.users, show: hasPermission('manage_settings') || hasPermission('create_admins') },
        { to: '/holidays', label: 'Holidays', icon: ICONS.holidays, show: hasPermission('manage_holidays') },
        { to: '/settings', label: 'Settings', icon: ICONS.settings, show: hasPermission('manage_settings') },
        { to: '/audit', label: 'Audit Logs', icon: ICONS.audit, show: hasPermission('view_audit_logs') }
      ]
    }
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="animate-float flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white">I</div>
        <div>
          <p className="text-sm font-bold leading-tight">The Ivy School</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Attendance System</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group, i) => {
          const visible = group.items.filter(it => it.show);
          if (!visible.length) return null;
          return (
            <div key={i} className="animate-fade-in">
              {group.label && (
                <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{group.label}</p>
              )}
              <div className="stagger space-y-0.5">
                {visible.map(it => <NavItem key={it.to} {...it} onClick={() => setMobileOpen(false)} />)}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="hover-lift rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
          <p className="text-sm font-semibold capitalize">{user?.username}</p>
          <p className="text-xs text-slate-500 capitalize dark:text-slate-400">{user?.role?.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
            </button>
            <h1 className="text-lg font-bold tracking-tight">Attendance Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={toggle} className="hover-grow rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title="Toggle theme">
              <span className="inline-block transition-transform duration-500" style={{ transform: dark ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              {dark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
              )}
              </span>
            </button>
            <div className="relative">
<button onClick={() => setProfileOpen(o => !o)} className="hover-grow flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                {user?.avatar
                  ? <img src={user.avatar} className="h-8 w-8 rounded-full object-cover" alt="" />
                  : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold uppercase text-white">
                    {(user?.username || '?').charAt(0)}
                  </div>}
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div className="card animate-slide-down absolute right-0 z-20 mt-2 w-52 p-2">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold capitalize">{user?.username}</p>
                      <p className="text-xs text-slate-500 capitalize">{user?.role?.replace(/_/g, ' ')}</p>
                    </div>
                    <button className="btn-secondary w-full" onClick={() => { navigate('/profile'); setProfileOpen(false); }}>Profile</button>
                    <button className="btn-secondary mt-1 w-full" onClick={() => { navigate('/settings'); setProfileOpen(false); }}>Settings</button>
                    <button className="btn-danger mt-1 w-full" onClick={logout}>Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
