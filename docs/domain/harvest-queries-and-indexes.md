# Harvest queries and indexes

Stage 5.19 defines the query contract for harvest session and entry lists.

## Session queries

| Query               | Collection        | Filters                        | Ordering                                    | Limit |
| ------------------- | ----------------- | ------------------------------ | ------------------------------------------- | ----- |
| Today's sessions    | `harvestSessions` | `businessDate == selectedDate` | `createdAtServer desc`                      | 100   |
| Open sessions       | `harvestSessions` | `status == OPEN`               | `businessDate desc`, `createdAtServer desc` | 100   |
| Worker sessions     | `harvestSessions` | `workerId == workerId`         | `businessDate desc`, `createdAtServer desc` | 100   |
| Season sessions     | `harvestSessions` | `seasonId == seasonId`         | `businessDate desc`, `createdAtServer desc` | 100   |
| Sessions by status  | `harvestSessions` | `status == status`             | `businessDate desc`, `createdAtServer desc` | 100   |
| Picker own sessions | `harvestSessions` | `workerId == profile.workerId` | `businessDate desc`, `createdAtServer desc` | 100   |
| Operator sessions   | `harvestSessions` | `createdBy == operatorUid`     | `businessDate desc`, `createdAtServer desc` | 100   |
| Review queue        | `harvestSessions` | `status == REVIEW_REQUIRED`    | `updatedAtServer desc`, `businessDate desc` | 50    |

## Entry queries

| Query               | Collection       | Filters                  | Ordering             | Limit |
| ------------------- | ---------------- | ------------------------ | -------------------- | ----- |
| Entries for session | `harvestEntries` | `sessionId == sessionId` | `sequenceNumber asc` | 500   |

No stage 5.19 query listens to all entries for a season. Entry reads must be
scoped to one session detail screen.

## Manifest

Required composite indexes are exported from `src/harvest/harvestQueries.ts`,
declared in `firestore.indexes.json`, and verified by
`tests/scripts/firestore-indexes.test.ts`.
