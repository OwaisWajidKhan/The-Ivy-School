import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import JuniorNursery from './pages/JuniorNursery';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import ScanLogs from './pages/ScanLogs';
import Leaves from './pages/Leaves';
import Payroll from './pages/Payroll';
import Reports from './pages/Reports';
import Devices from './pages/Devices';
import Users from './pages/Users';
import Holidays from './pages/Holidays';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs';
import GatePasses from './pages/GatePasses';
import Cards from './pages/Cards';
import HR from './pages/HR';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import Spinner from './components/Spinner';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size={40} />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function Guard({ can, children }) {
  const { user, hasPermission } = useAuth();
  if (!user) return null;
  const ok = can === 'any' || can.some(c => c.startsWith('!') ? !hasPermission(c.slice(1)) : hasPermission(c));
  if (!ok) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/students" element={<Guard can={['manage_students', 'view_students']}><Students /></Guard>} />
                <Route path="/junior-nursery" element={<Guard can={['manage_students']}><JuniorNursery /></Guard>} />
                <Route path="/employees" element={<Guard can={['manage_employees', 'view_employees']}><Employees /></Guard>} />
                <Route path="/attendance" element={<Guard can={['manage_attendance', 'view_attendance']}><Attendance /></Guard>} />
                <Route path="/scans" element={<Guard can={['view_attendance', 'manage_attendance']}><ScanLogs /></Guard>} />
                <Route path="/leaves" element={<Leaves />} />
                <Route path="/gate-passes" element={<Guard can={['manage_students', 'approve_leave', 'manage_attendance', 'view_attendance']}><GatePasses /></Guard>} />
                <Route path="/hr" element={<Guard can={['manage_employees', 'manage_settings']}><HR /></Guard>} />
                <Route path="/cards" element={<Guard can={['manage_devices', 'manage_attendance']}><Cards /></Guard>} />
                <Route path="/payroll" element={<Guard can={['manage_payroll', 'generate_payroll']}><Payroll /></Guard>} />
                <Route path="/reports" element={<Guard can={['view_reports']}><Reports /></Guard>} />
                <Route path="/devices" element={<Guard can={['manage_devices']}><Devices /></Guard>} />
                <Route path="/users" element={<Guard can={['manage_settings']}><Users /></Guard>} />
                <Route path="/holidays" element={<Guard can={['manage_holidays']}><Holidays /></Guard>} />
                <Route path="/settings" element={<Guard can={['manage_settings']}><Settings /></Guard>} />
                <Route path="/audit" element={<Guard can={['view_audit_logs']}><AuditLogs /></Guard>} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
