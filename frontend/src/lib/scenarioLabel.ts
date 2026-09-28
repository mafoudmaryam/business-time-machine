/** The engine always names the do-nothing comparison "baseline" -- shown to
 * the owner as "If you change nothing" instead, everywhere a scenario name
 * is displayed. The stored/API name is never changed, only how it's shown. */
export function displayScenarioName(name: string): string {
  return name === "baseline" ? "If you change nothing" : name;
}
