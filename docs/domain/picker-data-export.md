# Picker data export

Package 7.14 provides an optional CSV export of a picker's own sessions and
payments. Availability is controlled by
`appSettings/domain.pickerOwnReportExportEnabled`.

## Authorization and privacy

- only an active approved picker with a non-empty `workerId` can load the
  report;
- Firestore queries always constrain sessions and payments to that `workerId`;
- decoded documents are checked again against the authenticated profile;
- the CSV does not contain operator or administrator notes, authors, audit
  details, other workers, or internal account identifiers;
- an active administrator can change only the availability flag and
  `updatedAt`; schema and initialization fields remain immutable.

## Source and completeness

An online export uses server-only reads for settings, sessions, payments and
seasons. An offline export uses only previously prepared Firestore cache.

Every CSV contains:

- generation time in UTC;
- data source (`SERWER` or `CACHE`);
- completeness marker;
- picker `workerId`;
- selected season and session-date range.

Cache exports are explicitly marked `NIEPELNY - DANE Z CACHE` in both the UI and
the file.

## Content and calculations

`NALICZENIE` rows contain session identity, business date, status, plan,
quantity, kilograms and official amount. `WYPLATA` rows contain payment and
source-session identity, payment date, method, status and amount.

The summary:

- accrues only `CLOSED` and `PAID` sessions;
- counts only `ACTIVE` payments as paid;
- reports cancelled payments separately;
- calculates remaining amount as accrued minus active paid amount.

## Polish Excel format

The file uses UTF-8 BOM, `sep=;`, quoted semicolon-separated cells, CRLF line
endings, decimal commas, raw milli/gram/grosz columns and protection against
formula prefixes `=`, `+`, `-` and `@`.
