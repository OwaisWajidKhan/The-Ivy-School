import { useState } from 'react';
import useFetch from '../lib/useFetch';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';

const EMPTY = '—';

export default function JuniorNursery() {
  const { data, loading, reload } = useFetch('/students/jn');
  const [person, setPerson] = useState(null);

  const items = data?.items || [];

  const phoneLink = (p) => (p ? <a className="text-brand-600 hover:underline dark:text-brand-400" href={`tel:${p.replace(/[^+\d]/g, '')}`}>{p}</a> : EMPTY);
  const mailLink = (e) => (e ? <a className="text-brand-600 hover:underline dark:text-brand-400" href={`mailto:${e}`}>{e}</a> : EMPTY);

  const counts = (s) => ({ father: s.parents?.find(p => p.relation === 'father'), mother: s.parents?.find(p => p.relation === 'mother') });

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Junior Nursery</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{items.length} enrolled · intake 2025-26</p>
        </div>
        <button className="btn-secondary" onClick={reload}>Refresh</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <PageLoader /> : items.length === 0 ? <EmptyState title="No Junior Nursery students" subtitle="Run the import script to load the intake." /> : (
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="th">Student</th>
                <th className="th">Parent Login</th>
                <th className="th">Mother</th>
                <th className="th">Father</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(s => {
                const { father, mother } = counts(s);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        {s.photo
                          ? <img src={s.photo} className="h-9 w-9 rounded-full object-cover" alt="" />
                          : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{s.full_name?.charAt(0)}</div>}
                        <div>
                          <p className="font-medium">{s.full_name}</p>
                          <p className="font-mono text-xs text-slate-400">{s.student_id} · {s.gender || 'n/a'} · DOB {fmtDate(s.dob)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <p className="font-mono text-xs">parent_{s.student_id}</p>
                      <p className="text-xs text-slate-400">Default: Parent@123</p>
                    </td>
                    <td className="td">
                      <p className="text-sm font-medium">{mother?.full_name || EMPTY}</p>
                      {mother && <p className="text-xs text-slate-500">{phoneLink(mother.phone)} {mother.profession ? `· ${mother.profession}` : ''}</p>}
                    </td>
                    <td className="td">
                      <p className="text-sm font-medium">{father?.full_name || EMPTY}</p>
                      {father && <p className="text-xs text-slate-500">{phoneLink(father.phone)} {father.profession ? `· ${father.profession}` : ''}</p>}
                    </td>
                    <td className="td text-right">
                      <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setPerson(s)}>View Profile</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={Boolean(person)} onClose={() => setPerson(null)} title={person ? `${person.full_name} — Parent Profile` : ''} width="max-w-3xl">
        {person && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              {person.photo
                ? <img src={person.photo} className="h-16 w-16 rounded-full object-cover" alt="" />
                : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{person.full_name?.charAt(0)}</div>}
              <div>
                <p className="text-lg font-bold">{person.full_name}</p>
                <p className="font-mono text-sm text-slate-500">{person.student_id} · {person.gender || 'n/a'} · DOB {fmtDate(person.dob)}</p>
                <p className="text-sm text-slate-500">{person.class_name} · {person.section_name}{person.address ? ` · ${person.address}` : ''}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(person.parents || []).map((pt, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold capitalize">{pt.relation}</p>
                    <Badge status={pt.relation} />
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Name</dt><dd>{pt.full_name || EMPTY}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Phone</dt><dd>{phoneLink(pt.phone)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Email</dt><dd className="break-all text-right">{mailLink(pt.email)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Education</dt><dd className="text-right">{pt.education || EMPTY}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Profession</dt><dd className="text-right">{pt.profession || EMPTY}</dd></div>
                    {pt.employer && <div className="flex justify-between gap-3"><dt className="text-slate-400">Employer</dt><dd className="text-right">{pt.employer}</dd></div>}
                    {pt.marital_status && <div className="flex justify-between gap-3"><dt className="text-slate-400">Marital</dt><dd className="text-right">{pt.marital_status}</dd></div>}
                    {pt.address && <div className="flex justify-between gap-3"><dt className="text-slate-400">Address</dt><dd className="text-right">{pt.address}</dd></div>}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}