/** Concept C: a replay loop and play symbol for trying a decision before committing. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path d="M25.5 9.5A11.5 11.5 0 1 0 27 21" stroke="var(--green)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M19 9.5h7v-7" stroke="var(--green)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 10.5v11l8.5-5.5z" fill="var(--green)" strokeLinejoin="round" />
    </svg>
  );
}
