const PAYMENT_PENDING_BANNER_ENABLED = true;

export default function PaymentPendingBanner() {
  if (!PAYMENT_PENDING_BANNER_ENABLED) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 border-b border-rose-300/80 bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-950/40 sm:text-sm"
    >
      <svg
        className="h-4 w-4 shrink-0 animate-pulse-dot"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
        <path d="M12 9v5M12 17h.01" strokeLinecap="round" />
      </svg>
      <span className="animate-payment-blink">PAYMENT PENDING</span>
      <span className="hidden font-medium tracking-normal text-rose-50/90 sm:inline">
        — PREVIOUS MONTH&apos;S HOSTINGER FEES AWAIT REIMBURSEMENT
      </span>
    </div>
  );
}
