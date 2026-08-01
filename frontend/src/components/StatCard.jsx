export default function StatCard({ label, value, sub, icon, accent = 'text-brand-600 dark:text-brand-400' }) {
  return (
    <div className="card card-hover group flex items-start justify-between p-5">
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
      <div className={`rounded-lg bg-slate-100 p-2.5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 dark:bg-slate-800 ${accent}`}>{icon}</div>
    </div>
  );
}
