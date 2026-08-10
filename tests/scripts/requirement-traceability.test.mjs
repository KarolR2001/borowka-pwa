/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildTraceabilityRows,
  classifyRequirement,
  parseRequirementIds,
  renderMatrix,
  validateEvidenceFiles,
  validateRows
} from "../../scripts/requirement-traceability.mjs";

const idsPath = path.resolve("docs/testing/prd-requirement-ids.txt");
const matrixPath = path.resolve("docs/testing/requirements-traceability.md");

describe("PRD requirement traceability", () => {
  it("maps every unique requirement and acceptance criterion", async () => {
    const ids = parseRequirementIds(await readFile(idsPath, "utf8"));
    const rows = buildTraceabilityRows(ids);

    expect(ids).toHaveLength(392);
    expect(new Set(ids)).toHaveLength(392);
    expect(ids).toEqual([...ids].sort());
    expect(validateRows(rows)).toEqual([]);
    expect(await validateEvidenceFiles(rows)).toEqual([]);
    expect(rows.filter(({ status }) => status === "GAP")).toEqual([]);
  });

  it("keeps historical import explicitly outside the frozen RC", () => {
    expect(classifyRequirement("BR-CALC-020")).toMatchObject({
      domain: "Dane historyczne",
      status: "EXCLUDED_SCOPE"
    });
  });

  it("keeps physical device scenarios deferred instead of passing them", () => {
    for (const id of ["OFF-T01", "OFF-T02", "OFF-T03", "OFF-T04", "OFF-T05", "OFF-T06"]) {
      expect(classifyRequirement(id).status).toBe("DEFERRED_DEVICE");
    }
  });

  it("matches the generated matrix committed to the repository", async () => {
    const ids = parseRequirementIds(await readFile(idsPath, "utf8"));
    const matrix = await readFile(matrixPath, "utf8");

    expect(matrix).toBe(renderMatrix(buildTraceabilityRows(ids)));
  });
});
