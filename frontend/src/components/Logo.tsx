/** Branching B: a business initial with two possible routes. Decorative beside the wordmark. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="4 3 24 26" aria-hidden="true" focusable="false">
      <path
        d="M7 15.3V5h9c6 0 9 3 9 6.5 0 2.2-1.3 4-3.5 5 2.8.8 4.5 2.6 4.5 5.2C26 25.3 22.7 27 17 27H7v-9.3h6v-2.4H7Zm5.5-4.8H16c2.5 0 3.5.7 3.5 2s-1 2-3.5 2h-3.5v-4Zm0 9H17c2.5 0 3.5.7 3.5 2s-1 2-3.5 2h-4.5v-4Z"
        fill="var(--green)"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
