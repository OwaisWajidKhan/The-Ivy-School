import { useState } from 'react';
import useFetch from '../lib/useFetch';
import Modal from '../components/Modal';
import { PageLoader, EmptyState } from '../components/Spinner';
import { fmtDate } from '../lib/format';

const EMPTY = '—';

const ROLE_STYLE = {
  father: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  mother: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  guardian: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
};

function RolePill({ relation }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${ROLE_STYLE[relation] || 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300'}`}>
      {relation}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm text-slate-700 dark:text-slate-200">{children || EMPTY}</dd>
    </div>
  );
}

export default function JuniorNursery() {
  const { data, loading, reload } = useFetch('/students/jn');
  const [person, setPerson] = useState(null);

  const items = data?.items || [];

  const phoneLink = (p) => (p ? <a className="text-brand-600 hover:underline dark:text-brand-400" href={`tel:${p.replace(/[^+\d]/g, '')}`}>{p}</a> : EMPTY);

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
                      {mother && <p className="text-xs text-slate-500">{phoneLink(mother.phone)}{mother.profession ? ` · ${mother.profession}` : ''}</p>}
                    </td>
                    <td className="td">
                      <p className="text-sm font-medium">{father?.full_name || EMPTY}</p>
                      {father && <p className="text-xs text-slate-500">{phoneLink(father.phone)}{father.profession ? ` · ${father.profession}` : ''}</p>}
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

      <Modal open={Boolean(person)} onClose={() => setPerson(null)} title="Student & Parent Profile" width="max-w-3xl">
        {person && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:gap-5 sm:bg-slate-100/70 sm:p-5 dark:bg-slate-800/40 sm:dark:bg-slate-800/40">
              {person.photo
                ? <img src={person.photo} className="h-20 w-20 shrink-0 rounded-full object-cover shadow-sm" alt="" />
                : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-3xl font-bold text-white shadow-sm">{person.full_name?.charAt(0)}</div>}
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold leading-tight">{person.full_name}</p>
                <p className="mt-0.5 font-mono text-sm text-slate-500 dark:text-slate-400">{person.student_id} · {person.gender || 'n/a'} · Born {fmtDate(person.dob)}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-medium capitalize">{person.class_name || 'Junior Nursery'}</span>{person.section_name ? ` · Section ${person.section_name}` : ''}
                </p>
                <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">Login: parent_{person.student_id} <span className="text-slate-400">(default Parent@123)</span></p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {(person.parents || []).length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">No parent profiles recorded for this student.</div>
              )}
              {(person.parents || []).map((pt, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <RolePill relation={pt.relation} />
                      <span className="text-sm font-semibold text-slate-600 capitalize dark:text-slate-300">Parent · {pt.relation}</span>
                    </div>
                  </div>
                  <div className="px-4 py-2">
                    <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                      <Field label="Name">{pt.full_name}</Field>
                      <Field label="Phone">{phoneLink(pt.phone)}</Field>
                      <Field label="Email">{pt.email ? <a className="break-all text-brand-600 hover:underline dark:text-brand-400" href={`mailto:${pt.email}`}>{pt.email}</a> : null}</Field>
                      <Field label="Education">{pt.education}</Field>
                      <Field label="Profession">{pt.profession}</Field>
                      <Field label="Employer">{pt.employer}</Field>
                      <Field label="Marital">{pt.marital_status}</Field>
                      {pt.address && <Field label="Address">{pt.address}</Field>}
                    </dl>
                  </div>
                </div>
              ))}
            </div>

            {person.email && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm dark:bg-brand-500/10">
                <span className="font-medium text-brand-700 dark:text-brand-300">Student email: </span>
                <a className="break-all text-brand-600 hover:underline dark:text-brand-400" href={`mailto:${person.email}`}>{person.email}</a>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}