export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-black text-brand-600">404</p>
      <h2 className="mt-2 text-xl font-bold">Page not found</h2>
      <p className="mt-1 text-sm text-slate-500">The page you're looking for doesn't exist.</p>
      <a href="/" className="btn-primary mt-4">Back to dashboard</a>
    </div>
  );
}
