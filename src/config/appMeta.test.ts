import packageJson from "../../package.json";

import { APP_META } from "./appMeta";

describe("release candidate metadata", () => {
  it("uses the package version as the single application version", () => {
    expect(packageJson.version).toBe("1.0.0-rc.1");
    expect(APP_META.version).toBe(packageJson.version);
    expect(APP_META.buildDate).toBe("2026-08-10");
    expect(APP_META.schemaVersion).toBe("schema-0001");
    expect(APP_META.calculationVersion).toBe("calc-0001");
  });
});
