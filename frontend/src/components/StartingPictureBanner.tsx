import { STARTING_PICTURE } from "../lib/guide";

/** The honest caveat for a practice business made from the start-up guide: the simulator shows it as if it were already trading. */
export function StartingPictureBanner({ className = "" }: { className?: string }) {
  return (
    <p className={`starting-picture ${className}`.trim()} role="note">
      {STARTING_PICTURE}
    </p>
  );
}
