/** The engine always names the do-nothing comparison "baseline" -- shown to
 * the owner as "If you change nothing" instead, everywhere a scenario name
 * is displayed. The stored/API name is never changed, only how it's shown. */
export function displayScenarioName(name: string): string {
  return name === "baseline" ? "If you change nothing" : name;
}

/** Name for "Duplicate as new version": "Price rise" -> "Price rise v2" -> "Price rise v3"...
 * It drops any version suffix already on the name (so it never becomes "v2 v2") and picks the
 * lowest version number, starting at 2, that no existing scenario already uses. */
export function nextVersionName(name: string, existingNames: string[]): string {
  const base = name.replace(/(\s+v\d+)+\s*$/i, "").trim() || name.trim();
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  let version = 2;
  while (taken.has(`${base} v${version}`.toLowerCase())) version += 1;
  return `${base} v${version}`;
}
