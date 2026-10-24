/** A clock with branching hands: time, a choice, and a possible direction. Decorative beside the wordmark. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--green-heading)" />
      <path d="M25.8 18A10 10 0 1 1 16 6" fill="none" stroke="var(--cream)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 10v7m0 0 6-6m-6 6 5 5m-3-11h4v4" fill="none" stroke="var(--cream)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
