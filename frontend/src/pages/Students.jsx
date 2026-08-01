import { useState, useEffect } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';

const empty = {
  full_name: '', father_name: '', student_id: '', admission_number: '', rfid_uid: '',
  class_id: '', section_id: '', roll_number: '', dob: '', gender: 'Male',
  phone: '', parent_contact: '', address: '', status: 'active'
};

export default function Students() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/students', [params], { params });
  const { data: classes } = useFetch('/reference/classes');
  const [sections, setSections] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    setParams({ q: query || undefined, class_id: classId || undefined });
  }, [query, classId]);

  const loadSections = async (classId) => {
    if (!classId) { setSections([]); return; }
    const { data } = await api.get('/reference/sections', { params: { class_id: classId } });
    setSections(data.data);
  };

  const openAdd = () => { setForm(empty); setEditingId(null); setError(''); setPhotoFile(null); setOpen(true); };
  const openEdit = (s) => {
    setForm({
      full_name: s.full_name, father_name: s.father_name || '', student_id: s.student_id,
      admission_number: s.admission_number, rfid_uid: s.rfid_uid || '', class_id: s.class_id || '',
      section_id: s.section_id || '', roll_number: s.roll_number || '', dob: s.dob || '',
      gender: s.gender || 'Male', phone: s.phone || '', parent_contact: s.parent_contact || '',
      address: s.address || '', status: s.status
    });
    setEditingId(s.id);
    setError('');
    setPhotoFile(null);
    loadSections(s.class_id);
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) body.append(k, v); });
      if (photoFile) body.append('photo', photoFile);
      if (editingId) await api.put(`/students/${editingId}`, body);
      else await api.post('/students', body);
      toast.success(editingId ? 'Student updated' : 'Student saved');
      setOpen(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try { await api.delete(`/students/${id}`); toast.success('Student deleted'); reload(); } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    setDeleting(null);
  };

  const fullName = (s) => s.full_name;

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Students</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} total students</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Student</button>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Search name, ID, admission, RFID…" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.items.length === 0 ? <EmptyState title="No students found" subtitle="Try adjusting your filters or add a new student." /> : (
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Student</th>
                <th className="th">ID / Admission</th>
                <th className="th">Class</th>
                <th className="th">RFID UID</th>
                <th className="th">Contact</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.items.map(s => (
                <tr key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      {s.photo
                        ? <img src={s.photo} className="h-9 w-9 rounded-full object-cover" alt="" />
                        : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{fullName(s).charAt(0)}</div>}
                      <div>
                        <p className="font-medium">{s.full_name}</p>
                        <p className="text-xs text-slate-400">{s.father_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <p className="font-mono text-xs">{s.student_id}</p>
                    <p className="text-xs text-slate-400">{s.admission_number}</p>
                  </td>
                  <td className="td">{s.class_name || '—'} · {s.section_name || '—'}</td>
                  <td className="td font-mono text-xs">{s.rfid_uid || '—'}</td>
                  <td className="td">
                    <p className="text-xs">{s.parent_contact || '—'}</p>
                  </td>
                  <td className="td"><Badge status={s.status} /></td>
                  <td className="td text-right">
                    <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn-danger ml-1.5 !px-2.5 !py-1 text-xs" onClick={() => setDeleting(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Student' : 'Add Student'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="student-form" type="submit" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
          </>
        }>
        <form id="student-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="col-span-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
          <div><label className="label">Full name *</label><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Father name</label><input className="input" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} /></div>
          <div><label className="label">Student ID</label><input className="input" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} placeholder="S-0001" /></div>
          <div><label className="label">Admission number</label><input className="input" value={form.admission_number} onChange={e => setForm({ ...form, admission_number: e.target.value })} /></div>
          <div><label className="label">RFID UID</label><input className="input font-mono" value={form.rfid_uid} onChange={e => setForm({ ...form, rfid_uid: e.target.value })} placeholder="STU000001" /></div>
          <div><label className="label">Roll number</label><input className="input" type="number" value={form.roll_number} onChange={e => setForm({ ...form, roll_number: e.target.value })} /></div>
          <div>
            <label className="label">Class</label>
            <select className="input" value={form.class_id} onChange={e => { setForm({ ...form, class_id: e.target.value, section_id: '' }); loadSections(e.target.value); }}>
              <option value="">Select class</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <select className="input" value={form.section_id} onChange={e => setForm({ ...form, section_id: e.target.value })} disabled={!form.class_id}>
              <option value="">Select section</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">Date of birth</label><input className="input" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /></div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Parent contact</label><input className="input" value={form.parent_contact} onChange={e => setForm({ ...form, parent_contact: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option><option value="transferred">Transferred</option>
            </select>
          </div>
          <div>
            <label className="label">Photo</label>
            <input className="input" type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files[0])} />
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete student" width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" onClick={() => remove(deleting.id)}>Delete permanently</button>
          </>
        }>
        <p>Are you sure you want to delete <strong>{deleting?.full_name}</strong>? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
