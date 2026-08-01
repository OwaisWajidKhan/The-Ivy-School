import { useState, useEffect } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/admin/settings');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await api.put('/admin/settings', { key, value });
      toast.success('Setting saved');
      setKey(''); setValue('');
      setMsg('Setting saved.');
      reload();
    } catch (err) { setMsg(err.response?.data?.message || 'Failed to save'); } finally { setSaving(false); }
  };

  const knownKeys = ['school_name', 'school_tagline', 'school_start_time', 'school_end_time', 'late_grace_minutes', 'duplicate_scan_window_sec', 'half_day_threshold_hours', 'school_logo', 'school_address', 'school_contact_email', 'school_contact_phone', 'school_footer_text', 'school_timezone'];

  const brandingKeys = [
    ['school_name', 'School name'],
    ['school_tagline', 'Tagline'],
    ['school_logo', 'Logo URL'],
    ['school_address', 'Address'],
    ['school_contact_email', 'Contact email'],
    ['school_contact_phone', 'Contact phone'],
    ['school_footer_text', 'Footer text'],
    ['school_timezone', 'Timezone']
  ];
  const [brand, setBrand] = useState({});
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandMsg, setBrandMsg] = useState('');
  const [brandLoading, setBrandLoading] = useState(false);

  useEffect(() => {
    api.get('/admin/branding')
      .then(({ data }) => { setBrand(data.data); setBrandLoading(false); })
      .catch(() => setBrandLoading(false));
  }, []);

  const saveBranding = async (e) => {
    e.preventDefault();
    setBrandSaving(true); setBrandMsg('');
    try {
      for (const [k, v] of Object.entries(brand)) {
        await api.put('/admin/settings', { key: k, value: v ?? '' });
      }
      toast.success('Branding saved');
      setBrandMsg('Branding saved.');
      reload();
    } catch (err) { setBrandMsg(err.response?.data?.message || 'Failed to save branding'); } finally { setBrandSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">School Settings</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Setting key</label>
            <input className="input" list="known-keys" value={key} onChange={e => {
              setKey(e.target.value);
              const known = data?.find(s => s.key === e.target.value);
              if (known) setValue(known.value);
            }} />
            <datalist id="known-keys">{knownKeys.map(k => <option key={k} value={k} />)}</datalist>
          </div>
          <div><label className="label">Value</label><input className="input" value={value} onChange={e => setValue(e.target.value)} /></div>
          {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
          <button className="btn-primary" type="submit" disabled={saving || !key}>{saving ? <Spinner size={16} /> : 'Save setting'}</button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">School Branding</h2>
        <form onSubmit={saveBranding} className="space-y-4">
          {brandLoading ? <PageLoader label="Loading branding…" /> : (
            <>
              {brandMsg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{brandMsg}</p>}
              {brandingKeys.map(([k, label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input className="input" value={brand[k] || ''} onChange={e => setBrand({ ...brand, [k]: e.target.value })} />
                </div>
              ))}
              <button className="btn-primary" type="submit" disabled={brandSaving}>{brandSaving ? <Spinner size={16} /> : 'Save branding'}</button>
            </>
          )}
        </form>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800"><h2 className="text-lg font-bold">Current Settings</h2></div>
        {loading ? <PageLoader /> : data?.length === 0 ? <EmptyState title="No settings" /> : (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr><th className="th">Key</th><th className="th">Value</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map(s => (
                <tr key={s.key}>
                  <td className="td font-mono text-xs">{s.key}</td>
                  <td className="td">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
