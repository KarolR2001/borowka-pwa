import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type FirestoreIndexOrder = "ASCENDING" | "DESCENDING";

type FirestoreIndexField = {
  fieldPath: string;
  order: FirestoreIndexOrder;
};

type FirestoreIndex = {
  collectionGroup: string;
  queryScope: string;
  fields: FirestoreIndexField[];
};

type FirestoreIndexManifest = {
  indexes: FirestoreIndex[];
  fieldOverrides: unknown[];
};

const expectedCompositeIndexes = [
  ["registrationInvitations", "emailNormalized:ASCENDING", "status:ASCENDING"],
  ["seasons", "status:ASCENDING", "startDate:DESCENDING"],
  ["settlementPlans", "active:ASCENDING", "code:ASCENDING"],
  ["users", "active:ASCENDING", "registrationStatus:ASCENDING", "workerId:ASCENDING"],
  ["users", "role:ASCENDING", "active:ASCENDING"],
  ["workers", "active:ASCENDING", "normalizedName:ASCENDING"],
  ["workers", "currentPlanId:ASCENDING", "active:ASCENDING", "normalizedName:ASCENDING"],
  ["workerRateVersions", "workerId:ASCENDING", "validFrom:DESCENDING"],
  [
    "workerRateVersions",
    "workerId:ASCENDING",
    "active:ASCENDING",
    "validFrom:DESCENDING"
  ],
  ["workerRateVersions", "planId:ASCENDING", "active:ASCENDING"]
];

function readIndexManifest(): FirestoreIndexManifest {
  const parsed: unknown = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));

  if (!isIndexManifest(parsed)) {
    throw new Error("firestore.indexes.json has an unexpected structure.");
  }

  return parsed;
}

function isIndexManifest(value: unknown): value is FirestoreIndexManifest {
  if (!isRecord(value) || !Array.isArray(value.indexes)) {
    return false;
  }

  if (!Array.isArray(value.fieldOverrides)) {
    return false;
  }

  return value.indexes.every(isFirestoreIndex);
}

function isFirestoreIndex(value: unknown): value is FirestoreIndex {
  if (
    !isRecord(value) ||
    typeof value.collectionGroup !== "string" ||
    typeof value.queryScope !== "string" ||
    !Array.isArray(value.fields)
  ) {
    return false;
  }

  return value.fields.every(isFirestoreIndexField);
}

function isFirestoreIndexField(value: unknown): value is FirestoreIndexField {
  return (
    isRecord(value) &&
    typeof value.fieldPath === "string" &&
    (value.order === "ASCENDING" || value.order === "DESCENDING")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function indexKey(index: FirestoreIndex) {
  return [
    index.collectionGroup,
    ...index.fields.map((field) => `${field.fieldPath}:${field.order}`)
  ].join("|");
}

describe("firestore indexes", () => {
  it("keeps required stage 4 composite indexes in the manifest", () => {
    const indexManifest = readIndexManifest();
    const manifestKeys = new Set(indexManifest.indexes.map(indexKey));

    expect([...manifestKeys].sort()).toEqual(
      expectedCompositeIndexes.map((index) => index.join("|")).sort()
    );
  });

  it("uses collection-scoped indexes without duplicate definitions", () => {
    const indexManifest = readIndexManifest();
    const manifestKeys = indexManifest.indexes.map(indexKey);

    expect(indexManifest.fieldOverrides).toEqual([]);
    expect(indexManifest.indexes).toHaveLength(new Set(manifestKeys).size);
    expect(
      indexManifest.indexes.every((index) => index.queryScope === "COLLECTION")
    ).toBe(true);
  });
});
