# Track results: one journal, clearer meaning

## Data and accounting meaning

The existing `journal_entries` table, unique business/month key, `/journal` route and GET/POST/PUT/delete/restore endpoints remain. New nullable `actual_sales` and `actual_costs` store sales earned and costs incurred for one calendar month. Existing `actual_profit`, `actual_cash` and `actual_visits` become nullable without changing stored values. `costs_complete` defaults false. No new tracking system or external AI dependency is introduced.

A save needs at least one finite actual figure; notes alone do not create a month. Sales and costs are non-negative, up to 1e12. Cash and owner-reported profit can be negative; visits are non-negative up to 1e9. Missing is null, never zero. Both sales and costs are required before confirming completeness. With a sales/cost breakdown, the server derives profit only for complete costs and rejects a separate client-supplied profit. Legacy profit can still be corrected as owner-reported when no breakdown is supplied. Older clients cannot overwrite a record with a breakdown unless they explicitly include both new fields.

`btm_engine.journal.recorded_result` owns subtraction using Decimal on the entered numeric strings, returning a nullable balance and profit. An incomplete balance is “before unrecorded costs,” including a negative balance. It is never described as profit. The API retains the existing float storage contract; it is not a full accounting ledger. The form shows currency and keeps actual cents visible.

Cash is the existing month-end bank/till balance, a stock rather than receipts or payments. Cash flow cannot be inferred. A cash balance is not sales, profit or cash received that month. Costs are incurred for the month, rather than everything paid out. Check tax, financing, equipment and accounting treatment; the owner confirms completeness. The model’s operating-profit scope may differ from the owner’s accounts, so compare costs on a like-for-like basis.

## Frozen comparisons

For a new row, select the latest non-deleted Overview/Today baseline run created before the recorded calendar month and covering it. Same-month or later runs are excluded. Save a JSON snapshot of the relevant monthly low/middle/high revenue, profit, cash and visits bands, month, currency, run ID, creation date, engine version, seed and iterations. Do not estimate costs by subtracting separate medians: no separate cost band exists. Missing expected or actual figures have no difference.

The absence of a plan is also frozen. A later or backdated plan never retroactively attaches to that record. Corrections, repeated saves and soft delete/restore retain the original snapshot. Comparisons and accuracy metadata survive source-run edits or removal. Optional historical chart points use frozen profit bands and omit incomplete/missing profits; mixed-currency charts are hidden rather than combining currencies. CSV appends costs, completeness, plan identifiers/date and comparison currency while retaining existing columns and spreadsheet-injection protection.

Historical input assumptions were not retained with original Today runs, so they are not reconstructed from current business settings. “Review current assumptions” opens `/today#assumed` with that limit stated. No automatic model update occurs. The explanation reports the observed difference without inferring why it happened; one month does not establish a cause or real-world success probability.

## Migration and preservation

Alembic `c4f8a2d6e0b1`, following `b3d7f1a9c5e2`, extends the same table and preserves IDs, amounts, notes, dates, soft deletes and uniqueness. All existing rows, including hidden rows, receive a snapshot of the eligible plan available at upgrade, or explicit absence. `source=legacy_upgrade` is visibly disclosed: the originally viewed comparison was not stored and cannot be recovered exactly. New rows use `source=saved`.

Apply migrations to a backed-up database when installing this version. No personal database was migrated during this change; verification used temporary databases and a separate disposable preview. A downgrade refuses records with new sales/cost values or null legacy-required fields because the old schema cannot represent them; it must not discard those figures silently. Legacy-only rows support an up/down/up round trip.

Corrections replace actuals in the same monthly row and record `updated_at`; they are not a full versioned audit trail. Saving an already recorded month is labelled as a correction. Soft delete remains recoverable through Undo. The picker includes stored older months for correction, even beyond the normal twelve-month list. Missing months are not fabricated or zero-filled.

## Screen and verification

One main recording action, one selected-month summary, optional history and details. Sales-money breakdown first; the comparison table becomes labelled stacked rows at phone widths. No badge, streak or celebration. Blank inputs, partial saves, explicit zero, profit/loss, correction, retry, pending saves, old responses after business switching, selected periods, keyboard/error focus, accessible labels and automated accessibility are covered. Migration tests preserve legacy rows and test rollback safeguards. Full suites: 423 engine, 714 backend passed plus one expected skip, 890 frontend in 64 files. Build and lint complete with existing warnings. Desktop and 390px iframe layouts were inspected against the running API; the temporary iframe is not shipped. PDF export and simulation equations remain unchanged and were not visually re-rendered for this change.
