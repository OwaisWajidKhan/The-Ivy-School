import { useState, useRef } from 'react';
import api from '../lib/api';

export default function RFIDScanner({ deviceId = 'DEV-MAIN-01', location = 'Main Entrance', variant = 'compact' }) {
  const [uid, setUid] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const refocus = () => { setUid(''); inputRef.current?.focus(); };

  const scan = async (value) => {
    const id = (value ?? uid).trim();
    if (!id) return setError('RFID UID is required');
    setError(''); setResult(null);
    try {
      const { data } = await api.post('/attendance/scan', { uid: id, device_id: deviceId, location });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Scan failed');
    } finally {
      refocus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      scan(e.target.value);
    }
  };

  return (
    <div className={variant === 'kiosk' ? 'w-full max-w-3xl space-y-6' : 'space-y-6'}>
      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">RFID Scanner</h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Tap your card on the reader — the scan is recorded automatically. Keep this tab open.</p>
        <div>
          <label className="label">RFID UID</label>
          <input ref={inputRef} className="input font-mono text-lg" value={uid} onChange={e => setUid(e.target.value)} onKeyDown={onKeyDown} placeholder="Waiting for card scan…" autoFocus />
        </div>
        {error && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-base font-semibold">Scan Result</h3>
        {!result && !error && <p className="text-sm text-slate-400">Scan a card to see the result here.</p>}
        {result && (
          <div className={`flex flex-col overflow-hidden rounded-xl border sm:flex-row ${result.direction === 'IN' ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-orange-200 dark:border-orange-500/30'}`}>
            <div className={`flex w-full items-center justify-center p-10 sm:w-1/2 ${result.direction === 'IN' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
              {result.person?.photo ? (
                <img src={result.person.photo} alt="" className="h-40 w-40 rounded-full object-cover shadow-lg ring-4 ring-white dark:ring-slate-800" />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center rounded-full bg-brand-100 text-6xl font-bold text-brand-700 ring-4 ring-white dark:bg-brand-500/15 dark:text-brand-300 dark:ring-slate-800">
                  {(result.person?.name || '?').charAt(0)}
                </div>
              )}
            </div>
            <div className="w-full flex-1 space-y-4 p-6 sm:w-1/2 sm:p-8">
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${result.direction === 'IN' ? 'bg-emerald-500' : 'bg-orange-500'}`}>{result.direction === 'IN' ? 'IN' : 'OUT'}</span>
                <span className="text-xs capitalize text-slate-400">{result.person?.type}</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{result.person?.name}</p>
                <p className="mt-1 text-sm text-slate-500">{result.message}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['Student ID', result.person?.code]
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800">
                    <dt className="text-xs text-slate-400">{k}</dt>
                    <dd className="mt-0.5 text-lg font-semibold">{v || '—'}</dd>
                  </div>
                ))}
                {[
                  ['Check In time', result.summary?.in_time],
                  ['Check Out time', result.summary?.out_time || '—']
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800">
                    <dt className="text-xs text-slate-400">{k}</dt>
                    <dd className="mt-0.5 text-lg font-semibold">{v || '—'}</dd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}