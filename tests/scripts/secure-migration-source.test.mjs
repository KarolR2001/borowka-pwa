import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  secureMigrationSource,
  verifyMigrationSourceCustody
} from "../../scripts/secure-migration-source.mjs";

describe("secure migration source", () => {
  it("preserves immutable originals, dated working copies and a custody manifest", async () => {
    const root = await mkdtemp("/tmp/borowka-migration-source-");
    const inputPath = join(root, "Zbiory źródło.html");
    const secondInputPath = join(root, "Sprzedaż źródło.html");
    const xlsxPath = join(root, "Zbiory źródło.xlsx");
    const vaultDir = join(root, "private-vault");
    await writeFile(inputPath, "<html><body>test source</body></html>", "utf8");
    await writeFile(secondInputPath, "<html><body>second source</body></html>", "utf8");
    await writeFile(xlsxPath, new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    const result = await secureMigrationSource({
      capturedAtIso: "2026-08-05T08:09:10.123Z",
      htmlVersionStatus: "SINGLE_VERSION_CONFIRMED",
      inputPaths: [inputPath, secondInputPath],
      provenance: "Eksport HTML otrzymany od wlasciciela gospodarstwa 2026-08-05.",
      vaultDir,
      xlsxPath,
      xlsxStatus: "OBTAINED"
    });

    expect(result.manifest).toMatchObject({
      accessPolicy: {
        repositoryPolicy: "NEVER_COMMIT_SOURCE_DATA"
      },
      format: {
        name: "BOROWKA_MIGRATION_SOURCE_CUSTODY",
        version: 1
      },
      readiness: {
        analysisAllowed: true,
        htmlAssessmentComplete: true,
        sourceCopiesSecured: true,
        xlsxAssessmentComplete: true
      },
      sourceAssessment: {
        htmlVersionStatus: "SINGLE_VERSION_CONFIRMED",
        xlsxStatus: "OBTAINED"
      }
    });
    expect(result.manifest.files).toHaveLength(3);

    for (const file of result.manifest.files) {
      expect(file.byteLength).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.workingCopy).toMatch(
        /^working\/20260805T080910Z--[a-f0-9]{8}--[a-f0-9]{12}--/
      );
      expect(file.originalCopy).toMatch(/^originals\/[a-f0-9]{64}--/);

      const originalPath = join(vaultDir, file.originalCopy);
      const workingPath = join(vaultDir, file.workingCopy);
      const sourcePath =
        file.role === "SOURCE_XLSX"
          ? xlsxPath
          : file.originalFileName === "Sprzedaż źródło.html"
            ? secondInputPath
            : inputPath;
      expect(await readFile(originalPath)).toEqual(await readFile(sourcePath));
      expect(await readFile(workingPath)).toEqual(await readFile(originalPath));
      expect((await stat(originalPath)).mode & 0o777).toBe(0o400);
      expect((await stat(workingPath)).mode & 0o777).toBe(0o600);
      expect(file.provenance).toBe(
        "Eksport HTML otrzymany od wlasciciela gospodarstwa 2026-08-05."
      );
    }

    expect((await stat(vaultDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(vaultDir, "originals"))).mode & 0o777).toBe(0o500);
    expect((await stat(result.manifestPath)).mode & 0o777).toBe(0o400);
    const serializedManifest = await readFile(result.manifestPath, "utf8");
    expect(serializedManifest).not.toContain(root);
    expect(serializedManifest).not.toContain("test source");

    await expect(verifyMigrationSourceCustody(result.manifestPath)).resolves.toEqual({
      analysisAllowed: true,
      custodyId: result.manifest.custodyId,
      fileCount: 3,
      valid: true
    });

    const workingPath = join(vaultDir, result.manifest.files[0].workingCopy);
    await writeFile(workingPath, "changed working copy", "utf8");
    await expect(verifyMigrationSourceCustody(result.manifestPath)).rejects.toThrow(
      "Niezgodna kopia workingCopy"
    );
  });

  it("blocks analysis while assessments are open and rejects inconsistent XLSX claims", async () => {
    const root = await mkdtemp("/tmp/borowka-migration-source-open-");
    const inputPath = join(root, "source.html");
    await writeFile(inputPath, "<html></html>", "utf8");

    const openResult = await secureMigrationSource({
      capturedAtIso: "2026-08-05T08:09:10.123Z",
      htmlVersionStatus: "UNCONFIRMED",
      inputPath,
      provenance: "Niepotwierdzony eksport przekazany do zabezpieczenia.",
      vaultDir: join(root, "vault-open"),
      xlsxStatus: "REQUESTED"
    });
    expect(openResult.manifest.readiness).toEqual({
      analysisAllowed: false,
      htmlAssessmentComplete: false,
      sourceCopiesSecured: true,
      xlsxAssessmentComplete: false
    });

    await expect(
      secureMigrationSource({
        capturedAtIso: "2026-08-05T08:09:10.123Z",
        htmlVersionStatus: "SINGLE_VERSION_CONFIRMED",
        inputPath,
        provenance: "Zrodlo testowe.",
        vaultDir: join(root, "vault-invalid"),
        xlsxStatus: "OBTAINED"
      })
    ).rejects.toThrow("Status OBTAINED wymaga pliku XLSX");
  });

  it("rejects a manifest path escaping the private vault", async () => {
    const root = await mkdtemp("/tmp/borowka-migration-source-path-");
    const inputPath = join(root, "source.html");
    await writeFile(inputPath, "<html></html>", "utf8");
    const result = await secureMigrationSource({
      capturedAtIso: "2026-08-05T08:09:10.123Z",
      htmlVersionStatus: "SINGLE_VERSION_CONFIRMED",
      inputPath,
      provenance: "Zrodlo testowe.",
      vaultDir: join(root, "vault"),
      xlsxStatus: "NOT_AVAILABLE"
    });
    const tamperedManifest = /** @type {{ files: { originalCopy: string }[] }} */ (
      JSON.parse(await readFile(result.manifestPath, "utf8"))
    );
    tamperedManifest.files[0].originalCopy = "../../outside.html";
    await chmod(result.manifestPath, 0o600);
    await writeFile(
      result.manifestPath,
      `${JSON.stringify(tamperedManifest, null, 2)}\n`,
      "utf8"
    );
    await chmod(result.manifestPath, 0o400);

    await expect(verifyMigrationSourceCustody(result.manifestPath)).rejects.toThrow(
      "poza katalogiem originals"
    );
  });
});
