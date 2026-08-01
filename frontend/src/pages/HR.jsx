import { useState } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TABS = ['designations', 'subjects', 'assignments', 'documents'];

function useList(path, deps = []) {
  const { data, loading, reload } = useFetch(path, deps);
  return { items: Array.isArray(data) ? data : [], loading, reload };
}

export default function HR() {
  const [tab, setTab] = useState('designations');
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('manage_settings') || hasPermission('manage_employees');

  const deps = useList('/hr/designations', [tab]);
  const subs = useList('/hr/subjects', [tab]);
  const assigns = useList('/hr/assignments', [tab]);
  const teachers = useList('/hr/teachers', [tab]);
  const classes = useList('/reference/classes', [tab]);
  const sections = useList('/reference/sections', [tab]);
  const departments = useList('/reference/departments', [tab]);
  const employees = useList('/employees', [tab]);
  const [docs, setDocs] = useState([]);
  const [docsEmp, setDocsEmp] = useState(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openCreate = (mode, initial = {}) => {
    setForm({ mode, ...initial });
    setError('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { mode, ...body } = form;
    try {
      if (mode === 'designation') await api.post('/hr/designations', body);
      else if (mode === 'subject') await api.post('/hr/subjects', body);
      else if (mode === 'assignment') await api.post('/hr/assignments', body);
      toast.success('Saved successfully');
      setOpen(false);
      deps.reload(); subs.reload(); assigns.reload();
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); } finally { setBusy(false); }
  };

  const remove = async (mode, id) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (mode === 'designation') await api.delete(`/hr/designations/${id}`);
      else if (mode === 'subject') await api.delete(`/hr/subjects/${id}`);
      else if (mode === 'assignment') await api.delete(`/hr/assignments/${id}`);
      toast.success('Item deleted');
      deps.reload(); subs.reload(); assigns.reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const loadDocs = async (emp) => {
    setDocsEmp(emp);
    const { data } = await api.get(`/hr/employees/${emp.id}/documents`);
    setDocs(Array.isArray(data.data) ? data.data : []);
  };

  const uploadDoc = async (e) => {
    e.preventDefault();
    const f = e.target.file.files[0];
    if (!f || !docsEmp) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('doc_type', e.target.doc_type.value);
    fd.append('title', e.target.title.value || f.name);
    try {
      await api.post(`/hr/employees/${docsEmp.id}/documents`, fd);
      toast.success('Document uploaded');
      loadDocs(docsEmp);
      e.target.reset();
    } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
  };

  const delDoc = async (id) => {
    if (!confirm('Delete this document?')) return;
    try { await api.delete(`/hr/documents/${id}`); toast.success('Document deleted'); loadDocs(docsEmp); } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Human Resource</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Designations, subjects, teacher assignments & documents</p>
        </div>
        {canEdit && (
          <button className="btn-primary"
            onClick={() => tab === 'designations' ? openCreate('designation', { department_id: departments.items[0]?.id || '' })
              : tab === 'subjects' ? openCreate('subject')
              : tab === 'assignments' ? openCreate('assignment', { teacher_id: teachers.items[0]?.id || '', class_id: classes.items[0]?.id || '' })
              : null}>
            {tab === 'designations' ? '+ Add designation' : tab === 'subjects' ? '+ Add subject' : tab === 'assignments' ? '+ Assign teacher' : '+ Upload document'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t === 'designations' ? 'Designations' : t === 'assignments' ? 'Teacher Assignments' : t}
          </button>
        ))}
      </div>

      {tab === 'designations' && (
        <div className="card p-5">
          {deps.loading ? <PageLoader /> : deps.items.length === 0 ? <EmptyState title="No designations yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr><th className="th">Designation</th><th className="th">Department</th><th className="th">Description</th><th className="th">Employees</th>{canEdit && <th className="th text-right">Actions</th>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {deps.items.map(d => (
                    <tr key={d.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td font-medium">{d.name}</td>
                      <td className="td">{d.department || '—'}</td>
                      <td className="td">{d.description || '—'}</td>
                      <td className="td">{d.employee_count ?? 0}</td>
                      {canEdit && <td className="td text-right"><button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => remove('designation', d.id)}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'subjects' && (
        <div className="card p-5">
          {subs.loading ? <PageLoader /> : subs.items.length === 0 ? <EmptyState title="No subjects yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr><th className="th">Subject</th><th className="th">Code</th><th className="th">Description</th>{canEdit && <th className="th text-right">Actions</th>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {subs.items.map(s => (
                    <tr key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td font-medium">{s.name}</td>
                      <td className="td font-mono text-xs">{s.code || '—'}</td>
                      <td className="td">{s.description || '—'}</td>
                      {canEdit && <td className="td text-right"><button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => remove('subject', s.id)}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="card p-5">
          {assigns.loading ? <PageLoader /> : assigns.items.length === 0 ? <EmptyState title="No teacher assignments yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr><th className="th">Teacher</th><th className="th">Subject</th><th className="th">Class</th><th className="th">Section</th>{canEdit && <th className="th text-right">Actions</th>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {assigns.items.map(a => (
                    <tr key={a.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td font-medium">{a.teacher_name}</td>
                      <td className="td">{a.subject_name || '—'}</td>
                      <td className="td">{a.class_name || '—'}</td>
                      <td className="td">{a.section_name || '—'}</td>
                      {canEdit && <td className="td text-right"><button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => remove('assignment', a.id)}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-4">
            <h3 className="mb-3 text-base font-semibold">Employee Documents</h3>
            {employees.loading ? <PageLoader /> : employees.items.length === 0 ? <EmptyState title="No employees" /> : (
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {employees.items.map(e => (
                  <button key={e.id} onClick={() => loadDocs(e)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${docsEmp?.id === e.id ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : ''}`}>
                    {e.full_name} <span className="text-xs text-slate-400">{e.employee_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="card p-4 lg:col-span-2">
            {!docsEmp ? <EmptyState title="Select an employee to view documents" /> : (
              <>
                <h3 className="mb-3 text-base font-semibold">Documents · {docsEmp.full_name}</h3>
                {canEdit && (
                  <form onSubmit={uploadDoc} className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><label className="label">Type</label><select name="doc_type" className="input" defaultValue="Other"><option>CNIC</option><option>Degree</option><option>Contract</option><option>Experience Letter</option><option>Other</option></select></div>
                      <div><label className="label">Title</label><input name="title" className="input" placeholder="Optional" /></div>
                      <div><label className="label">File</label><input name="file" type="file" className="input" required /></div>
                    </div>
                    <button className="btn-primary mt-3" type="submit">Upload document</button>
                  </form>
                )}
                {docs.length === 0 ? <EmptyState title="No documents uploaded" /> : (
                  <div className="space-y-2">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 dark:border-slate-800">
                        <div>
                          <p className="text-sm font-medium">{d.title}</p>
                          <p className="text-xs text-slate-400">{d.doc_type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a className="btn-secondary !px-3 !py-1 text-xs" href={d.file_path} target="_blank" rel="noreferrer">View</a>
                          {canEdit && <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => delDoc(d.id)}>Delete</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.mode === 'designation' ? 'Add Designation' : form.mode === 'subject' ? 'Add Subject' : 'Assign Teacher'} width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="hr-form" type="submit" disabled={busy}>{busy ? <Spinner size={16} /> : 'Save'}</button>
          </>
        }>
        <form id="hr-form" onSubmit={submit} className="grid gap-4">
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          {form.mode === 'designation' && (
            <>
              <div><label className="label">Name *</label><input className="input" required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Department</label><select className="input" value={form.department_id || ''} onChange={e => setForm({ ...form, department_id: e.target.value })}><option value="">None</option>{departments.items.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div><label className="label">Description</label><input className="input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            </>
          )}
          {form.mode === 'subject' && (
            <>
              <div><label className="label">Name *</label><input className="input" required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Code</label><input className="input" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
              <div><label className="label">Description</label><input className="input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            </>
          )}
          {form.mode === 'assignment' && (
            <>
              <div><label className="label">Teacher *</label><select className="input" required value={form.teacher_id || ''} onChange={e => setForm({ ...form, teacher_id: e.target.value })}><option value="">Select teacher</option>{teachers.items.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
              <div><label className="label">Subject</label><select className="input" value={form.subject_id || ''} onChange={e => setForm({ ...form, subject_id: e.target.value })}><option value="">None</option>{subs.items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">Class *</label><select className="input" required value={form.class_id || ''} onChange={e => setForm({ ...form, class_id: e.target.value })}><option value="">Select class</option>{classes.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="label">Section</label><select className="input" value={form.section_id || ''} onChange={e => setForm({ ...form, section_id: e.target.value })}><option value="">None</option>{sections.items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
