# Admin payment directory

Package 7.6 adds the administrator's current payment history and source-session
details.

## Authoritative read

The directory is available only to an active approved administrator. It reads
payments, harvest sessions and seasons directly from the Firestore server. Each
valid payment remains visible even when its source session is missing; the
directory reports that integrity problem separately instead of hiding the
financial record.

The list distinguishes:

- active payments;
- cancelled payments with cancellation metadata;
- historical imports independently of their active or cancelled status.

## Filters and totals

The administrator can filter by season, worker, payment business-date range,
source-session business-date range, payment method and status. The visible
summary is recalculated after every filter change.

`activeAmountGrosz` is the sum of `amountGrosz` from payment documents whose
status is exactly `ACTIVE`. Cancelled payments never increase the paid total,
and no shortcut field from a harvest session is used for this sum.

## Details and cancellation boundary

Opening a payment shows its ID, source session, amount, method, author, server
time, note, import marker and cancellation metadata. Source-session details
include its business date, status, plan and rate snapshot, result, close author,
close time and revision.

An active payment exposes a command that selects and forwards its payment ID to
the cancellation workflow. Package 7.7 implements the transactional
cancellation itself.

## CSV export

CSV export includes only the currently filtered records. It uses:

- UTF-8 with BOM;
- `sep=;` and semicolon-separated quoted fields for Polish Excel;
- CRLF line endings;
- amounts with a decimal comma;
- protection against cells beginning with `=`, `+`, `-` or `@`.

The export contains payment and session IDs, dates, amount, method, status,
historical-import marker, author, server time, note and cancellation metadata.

## Verification

- `paymentDirectory.test.ts` covers joins, all filter dimensions, active-only
  totals and CSV safety.
- `AdminPaymentDirectoryPanel.test.tsx` covers list, details, export,
  cancellation entry and denied non-admin access.
- `App.test.tsx` covers placement in the administrator workspace.
- `payment-directory.test.ts` uses Firestore Emulator and current Security
  Rules to verify the server read and active-only sum.
