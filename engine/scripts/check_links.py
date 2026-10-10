"""Checks every web address in the start-up guide's data file and writes what it found to
`btm_engine/data/link_status.json`, so the plan page can say when each link was last checked.

Run it by hand before a release (it is NOT part of the automatic tests, because it needs the internet):

    python engine/scripts/check_links.py              # check everything, write link_status.json
    python engine/scripts/check_links.py --dry-run    # check, print, do not write

What the results mean:
    ok        the page answered 200 at that address
    redirect  the page answered, but at another address (the new address is recorded: update the data file)
    blocked   the site refused an automatic visitor (403, 401, 429). It may be fine for a person: open it by hand
    certificate  this computer could not verify the site's security certificate (common with security software that
              inspects traffic). The page may be fine in a browser: open it by hand. We never switch the check off
    broken    404 or 410: the page is gone. Fix or remove the row that uses it
    error     no answer (timeout, DNS, certificate): try again later

Exit code: 1 if any link is broken or gave an error, otherwise 0. Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "btm_engine" / "data"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BusinessTimeMachine-link-check/1.0 (personal project)"


def _same(a: str, b: str) -> bool:
    return a.split("#")[0].rstrip("/").lower() == b.split("#")[0].rstrip("/").lower()


def classify(status: int | None, final_url: str, url: str, note: str = "") -> str:
    if status is None:
        return "certificate" if "CERTIFICATE_VERIFY_FAILED" in note else "error"
    if status in (401, 403, 429):
        return "blocked"
    if status in (404, 410):
        return "broken"
    if 200 <= status < 300:
        return "ok" if _same(final_url, url) else "redirect"
    return "error"


def check(url: str, timeout: float = 25.0, attempts: int = 2) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
    context = ssl.create_default_context()
    status, final, note = None, url, ""
    for _ in range(attempts):                # a second try, because connections sometimes drop for no reason
        status, final, note = None, url, ""
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                status, final = response.status, response.geturl()
        except urllib.error.HTTPError as exc:
            status, final = exc.code, exc.geturl() or url
        except Exception as exc:  # timeouts, DNS, certificates: plain words, never a crash
            note = f"{type(exc).__name__}: {exc}"[:200]
        if status is not None and status < 500:
            break
    return {"status": status, "result": classify(status, final, url, note), "final_url": final, "note": note}


def urls_in(data: dict) -> list[str]:
    return sorted({s["url"] for s in data["sources"].values()})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="print the results, do not write link_status.json")
    args = parser.parse_args()

    data = json.loads((DATA / "startup_ranges.json").read_text(encoding="utf-8"))
    today = dt.date.today().isoformat()
    results = {}
    for url in urls_in(data):
        outcome = check(url)
        outcome["checked"] = today
        results[url] = outcome
        print(f"{outcome['result']:<9} {outcome['status'] or '---':>4}  {url}" + (f"  -> {outcome['final_url']}" if outcome["result"] == "redirect" else "")
              + (f"  ({outcome['note']})" if outcome["note"] else ""))
    summary = {r: sum(1 for v in results.values() if v["result"] == r) for r in ("ok", "redirect", "blocked", "certificate", "broken", "error")}
    print("\nSummary:", ", ".join(f"{n} {r}" for r, n in summary.items()))
    if not args.dry_run:
        (DATA / "link_status.json").write_text(json.dumps({"checked": today, "summary": summary, "results": results}, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Wrote", DATA / "link_status.json")
    return 1 if summary["broken"] or summary["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
