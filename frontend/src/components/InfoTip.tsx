/** A small "ⓘ" that shows a plain-language explanation on hover/focus, via the
 * native title tooltip -- no extra library needed. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" title={text} tabIndex={0} role="note" aria-label={text}>
      ⓘ
    </span>
  );
}
