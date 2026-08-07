import { Link } from 'react-router-dom';
import useFetch from '../lib/useFetch';
import RFIDScanner from '../components/RFIDScanner';
import { PageLoader } from '../components/Spinner';

export default function ScannerKiosk() {
  const { data: branding, loading } = useFetch('/admin/branding');

  const name = branding?.school_name || 'The Ivy School';
  const tagline = branding?.school_tagline || 'Attendance System';
  const logo = branding?.school_logo || null;

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-gradient-to-br from-forest-700 via-forest-800 to-brand-900 px-4 py-8">
      <Link to="/" className="hover-grow absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur ring-1 ring-white/20">
        ← Back
      </Link>

      <div className="animate-slide-down mb-8 flex flex-col items-center text-center">
        {logo ? (
          <img src={logo} alt={name} className="mb-4 h-24 w-24 rounded-2xl bg-white object-cover shadow-lg ring-4 ring-white/20" />
        ) : (
          <div className="animate-float mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-white text-4xl font-black text-forest-700 shadow-lg">
            {name.charAt(0)}
          </div>
        )}
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{name}</h1>
        <p className="mt-1 text-sm text-sage-200">{tagline}</p>
      </div>

      <div className="animate-slide-up w-full max-w-3xl">
        {loading ? <PageLoader label="Loading…" /> : <RFIDScanner variant="kiosk" deviceId="DEV-KIOSK-01" location="Main Entrance" />}
      </div>
    </div>
  );
}