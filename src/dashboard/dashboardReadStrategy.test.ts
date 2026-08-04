import {
  dashboardPeriodQueryConstraints,
  estimateDashboardReads,
  PRD_EXPECTED_MAX_SCALE
} from "./dashboardReadStrategy";

describe("dashboard read strategy", () => {
  it("measures the expected maximum scale from the PRD", () => {
    expect(estimateDashboardReads(PRD_EXPECTED_MAX_SCALE)).toEqual({
      admin: {
        aggregateBilledReadUpperBound: 75,
        previousDocumentReads: 60_210
      },
      operator: {
        aggregateBilledReadUpperBound: 61,
        boundedDocumentReads: 118
      },
      picker: {
        averageSelectedSeasonDocumentReads: 31,
        previousAverageDocumentReads: 211
      }
    });
  });

  it("creates inclusive constraints only for defined period bounds", () => {
    const createWhere = vi.fn(
      (fieldPath: string, opStr: WhereFilterOp, value: unknown) =>
        ({ fieldPath, opStr, value }) as unknown as QueryConstraint
    );

    const constraints = dashboardPeriodQueryConstraints(
      "businessDate",
      { fromDate: "2026-07-01", toDate: null },
      createWhere
    );

    expect(createWhere).toHaveBeenCalledOnce();
    expect(constraints).toEqual([
      {
        fieldPath: "businessDate",
        opStr: ">=",
        value: "2026-07-01"
      }
    ]);
  });
});
import type { QueryConstraint, WhereFilterOp } from "firebase/firestore";
