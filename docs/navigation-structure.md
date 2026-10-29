# Finding your way around Business Time Machine

The existing AppNav is the only main navigation. We keep the current URLs so saved links and bookmarks work.

| Owner's task | Main label | Existing route | Related pages |
| --- | --- | --- | --- |
| Understand the current business | Overview | `/today` | Inputs and assumptions `/how`, PDF report `/share` |
| Explore and compare decisions | Try an idea | `/explore` | Price slider `/try`, timeline `/timeline`, detailed builder `/scenarios`, comparison `/compare`, saved plans/results `/history` |
| Record what actually happened | Track results | `/journal` | Existing journal entries, edits, Undo and CSV download |
| Work out a practical target | Tools | `/tools` | Working entered-cost sales calculator; optional explicit link to Try an idea |

Overview leads with key figures and one main action, Try an idea. Optional explanations, monthly charts and editable assumptions sit behind labelled disclosures. The assumptions link `/today#assumed` opens the editable section. The tour opens only when requested through Show me around.

Try an idea keeps the existing four working choices. Its saved-work links open the existing history and comparison pages with the selected business. Saved results list plan names and actions first, with dates and calculation settings in optional details. Detailed setup and the specialist builder remain in Advanced; assumptions and PDF export are also reachable there and from Overview. Advanced closes after navigation and supports Escape with focus returned to its summary.

Track results keeps the journal's recording form first. Extra months and the comparison chart are optional disclosures. Saved entries, edits, recovery, CSV and the distinction between actual figures and simulated estimates remain intact.

Page navigation moves keyboard focus to main content and starts at the introduction. Hash links retain their own target. Mobile uses the same navigation, wrapping rather than adding another bar. Storage keys, API paths, saved records, calculations, report contents and print styling are unchanged.

## Where future practical tools belong

Tools now appears within the existing AppNav and opens the working “How much do I need to sell?” calculator at `/tools`. There is no separate top-level calculator link or empty catalogue. It is also available before business setup, with an explicit currency choice. The calculator never changes saved business inputs or plans. Its optional simulator handoff is a normal link, with no transfer of amounts.

Add future working tools gradually here. Individual tools may use `/tools/<name>` when enough content justifies separate pages. Keep one main action, familiar labels, explicit currency and monthly/total units, and optional calculation details. Do not publish disabled cards or unavailable calculators. Reuse business context without silently assuming costs. Test keyboard, mobile, validation, units and error/loading states.

Calculation rules for the first tool are in [sales-needed-tool.md](sales-needed-tool.md).

This change builds on PR #17, which includes the PDF report and integrated website improvements. It does not reimplement the separate sample-reuse work in PR #11 or merge unrelated branches.
