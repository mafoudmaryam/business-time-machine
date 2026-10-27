import { describe, expect, it } from "vitest";
import { ADVANCED_LINKS, MAIN_LINKS, businessPageLink, navigationBusinessId } from "./navLinks";

describe("owner task navigation", () => {
  it("uses existing routes and hides Tools until a working tool ships", () => {
    expect(MAIN_LINKS.map(link => [link.label, link.to])).toEqual([
      ["Overview", "/today"], ["Try an idea", "/explore"], ["Track results", "/journal"],
    ]);
    expect([...MAIN_LINKS, ...ADVANCED_LINKS].some(link => link.to.startsWith("/tools"))).toBe(false);
  });
  it.each(["/scenarios", "/compare", "/history"])("keeps the selected business for %s", path => {
    expect(businessPageLink(path, 7)).toBe(`${path}?business=7`);
    expect(businessPageLink(path, null)).toBe(path);
    expect(navigationBusinessId(path, "?business=9", 7)).toBe(9);
    expect(navigationBusinessId(path, "?business=invalid", 7)).toBe(7);
  });
  it("leaves setup, assumptions and PDF addresses intact", () => {
    for (const path of ["/setup", "/how", "/share"]) expect(businessPageLink(path, 7)).toBe(path);
    expect(navigationBusinessId("/today", "?business=9", 7)).toBe(7);
  });
});
