const UNCONFIRMED_PREFIX = "scenario(s) have unconfirmed decisions: ";

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Rewrites the backend's raw 409 text into the sentence a café owner should read.
 * Any message it doesn't recognize is passed through unchanged. */
export function friendlyErrorMessage(message: string): string {
  if (!message.startsWith(UNCONFIRMED_PREFIX)) return message;

  const names = message
    .slice(UNCONFIRMED_PREFIX.length)
    .split(", ")
    .filter(Boolean)
    .map((name) => `'${name}'`);

  if (names.length === 0) return message;
  return `Please confirm the decisions in ${joinNames(names)} before running a simulation.`;
}
