import { useState, useEffect } from 'react';
import api from '../lib/api';
import useFetch from '../lib/useFetch';
import Modal from '../components/Modal';
import Spinner, { PageLoader, EmptyState } from '../components/Spinner';
import Pagination, { useClientPagination } from '../components/Pagination';
import { useToast } from '../context/ToastContext';

const empty = {
  full_name: '', student_id: '', rfid_uid: '', rfid_uid_2: '',
  class_id: '', section_id: '', father_name: '', parent_contact: '', status: 'active'
};

export default function Students() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [params, setParams] = useState({});
  const { data, loading, reload } = useFetch('/students', [params], { params });
  const { data: classes } = useFetch('/reference/classes');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    setParams({ q: query || undefined, class_id: classId || undefined, limit: 10000 });
  }, [query, classId]);

  const { paginated, page, setPage, pageCount, total, pageSize, setPageSize } = useClientPagination(data?.items);

  const loadSections = async (classId, autoSelect = false) => {
    if (!classId) { setForm(f => ({ ...f, section_id: '' })); return; }
    const { data } = await api.get('/reference/sections', { params: { class_id: classId } });
    if (autoSelect && data.data?.[0]) setForm(f => ({ ...f, section_id: data.data[0].id }));
  };

  const openAdd = () => { setForm(empty); setEditingId(null); setError(''); setPhotoFile(null); setOpen(true); };
  const openEdit = (s) => {
    setForm({
      full_name: s.full_name, student_id: s.student_id, rfid_uid: s.rfid_uid || '',
      rfid_uid_2: s.rfid_uid_2 || '', class_id: s.class_id || '', section_id: s.section_id || '',
      father_name: s.father_name || '', parent_contact: s.parent_contact || '', status: s.status
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
          <input className="input" placeholder="Search name, ID, RFID…" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : total === 0 ? <EmptyState title="No students found" subtitle="Try adjusting your filters or add a new student." /> : (
          <>
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Student</th>
                <th className="th">Student ID</th>
                <th className="th">Class</th>
                <th className="th">RFID Cards</th>
                <th className="th">Father's Contact</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginated.map(s => (
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
                  </td>
                  <td className="td">{s.class_name || '—'} · {s.section_name || '—'}</td>
                  <td className="td font-mono text-xs">
                    <p>{s.rfid_uid || '—'}</p>
                    {s.rfid_uid_2 && <p className="text-slate-400">{s.rfid_uid_2}</p>}
                  </td>
                  <td className="td">
                    <p className="text-xs">{s.parent_contact || '—'}</p>
                  </td>
                  <td className="td text-right">
                    <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn-danger ml-1.5 !px-2.5 !py-1 text-xs" onClick={() => setDeleting(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} pageSize={pageSize} onPageSizeChange={setPageSize} total={total} onChange={setPage} />
          </>
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
          <div><label className="label">Student Name *</label><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Student ID</label><input className="input" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} placeholder="S-0001" /></div>
          <div>
            <label className="label">Student Class</label>
            <select className="input" value={form.class_id} onChange={e => { setForm({ ...form, class_id: e.target.value, section_id: '' }); loadSections(e.target.value, true); }}>
              <option value="">Select class</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">RFID Card 1</label><input className="input font-mono" value={form.rfid_uid} onChange={e => setForm({ ...form, rfid_uid: e.target.value })} placeholder="Card 1 UID" /></div>
          <div><label className="label">RFID Card 2</label><input className="input font-mono" value={form.rfid_uid_2} onChange={e => setForm({ ...form, rfid_uid_2: e.target.value })} placeholder="Card 2 UID (optional)" /></div>
          <div><label className="label">Father's Name</label><input className="input" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} /></div>
          <div><label className="label">Father's Contact Number</label><input className="input" value={form.parent_contact} onChange={e => setForm({ ...form, parent_contact: e.target.value })} /></div>
          <div>
            <label className="label">Profile Picture</label>
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
