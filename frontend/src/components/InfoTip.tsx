/** A small "?" that shows a plain-language explanation.
 *
 * The bubble is drawn with CSS only (see .info-tip in index.css), so it appears on
 * mouse hover, when you Tab to it with the keyboard, and when you tap it on a phone
 * -- the old browser "title" tooltip only worked with a mouse. Screen readers read
 * the same text from aria-label. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" data-tip={text} tabIndex={0} role="note" aria-label={text}>
      ?
    </span>
  );
}
