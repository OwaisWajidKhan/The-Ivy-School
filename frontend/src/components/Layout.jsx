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
  cards: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></svg>,
  reports: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="14" width="3" height="4" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>,
  scan: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>,
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
            ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/10'
            : 'text-white/65 hover:translate-x-1 hover:bg-white/10 hover:text-white'
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
        { to: '/employees', label: 'Employees', icon: ICONS.employees, show: hasPermission('manage_employees') || hasPermission('view_employees') }
      ]
    },
    {
      label: 'Operations',
      items: [
        { to: '/attendance', label: 'Attendance', icon: ICONS.attendance, show: hasPermission('manage_attendance') || hasPermission('view_attendance') },
        { to: '/scanner', label: 'RFID Kiosk', icon: ICONS.scan, show: hasPermission('manage_attendance') || hasPermission('view_attendance') || hasPermission('kiosk_scan') },
        { to: '/scans', label: 'Scan History', icon: ICONS.scan, show: hasPermission('manage_attendance') || hasPermission('view_attendance') },
        { to: '/reports', label: 'Reports', icon: ICONS.reports, show: hasPermission('view_reports') }
      ]
    },
    {
      label: 'Administration',
      items: [
        { to: '/cards', label: 'RFID Cards', icon: ICONS.cards, show: hasPermission('manage_devices') || hasPermission('manage_attendance') },
        { to: '/access', label: 'Roles & Permissions', icon: ICONS.users, show: hasPermission('manage_settings') },
        { to: '/users', label: 'Users & Admins', icon: ICONS.users, show: hasPermission('manage_settings') || hasPermission('create_admins') },
        { to: '/settings', label: 'Settings', icon: ICONS.settings, show: hasPermission('manage_settings') }
      ]
    }
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="animate-float flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sage-400 to-forest-700 text-lg font-bold text-white shadow-lg shadow-black/20">I</div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">The Ivy School</p>
          <p className="text-xs text-sage-200/80">Attendance System</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group, i) => {
          const visible = group.items.filter(it => it.show);
          if (!visible.length) return null;
          return (
            <div key={i} className="animate-fade-in">
              {group.label && (
                <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-sage-200/60">{group.label}</p>
              )}
              <div className="stagger space-y-0.5">
                {visible.map(it => <NavItem key={it.to} {...it} onClick={() => setMobileOpen(false)} />)}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="hover-lift rounded-lg bg-white/10 p-3 ring-1 ring-white/10">
          <p className="text-sm font-semibold capitalize text-white">{user?.username}</p>
          <p className="text-xs text-sage-200/80 capitalize">{user?.role?.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-forest-800 bg-gradient-to-b from-forest-700 via-forest-700 to-forest-900 lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-forest-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-forest-800 bg-gradient-to-b from-forest-700 via-forest-700 to-forest-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-sage-200/70 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-sage-100 dark:hover:bg-slate-800 lg:hidden">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
            </button>
            <h1 className="text-gradient text-lg font-bold tracking-tight">Attendance Management</h1>
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
