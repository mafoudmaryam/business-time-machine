/** The little clock in the top bar: a round clock face with a curved arrow going back in time. Decorative, so hidden from screen readers. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="var(--green)" />
      <circle cx="16" cy="16" r="11.5" fill="var(--cream)" />
      <path d="M16 9.5V16l4.2 2.6" fill="none" stroke="var(--green-heading)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.6 9.2 6.9 8l.4 3.4" fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
