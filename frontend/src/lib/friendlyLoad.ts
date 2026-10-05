/** Words for "something did not load". The person never sees a status code, a stack trace or a web address. */

/** The API client says this when the browser could not talk to the backend at all. */
export function isUnreachable(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith("Could not reach the API");
}

export interface LoadWords {
  title: string;
  text: string;
}

/** `what` is a short phrase for the thing being loaded: "your scenarios", "your run history". */
export function loadErrorWords(message: string | null | undefined, what: string): LoadWords {
  if (isUnreachable(message)) {
    return {
      title: "We can't reach the program that does the sums",
      text: "It may not be running. Start it again (on this computer, run start.ps1), then press Try again. Nothing you saved is lost.",
    };
  }
  return {
    title: `We couldn't load ${what}`,
    text: "Something went wrong on our side. Nothing you saved is lost. Please try again in a moment.",
  };
}
