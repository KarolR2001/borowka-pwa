import { pathToFileURL } from "node:url";

import { verifyMigrationSourceCustody } from "./secure-migration-source.mjs";

/** @returns {Promise<void>} */
async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || process.argv.length !== 3) {
    throw new Error("Uzycie: npm run migration:verify-source -- <manifest.json>");
  }
  const result = await verifyMigrationSourceCustody(manifestPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(
    /** @param {unknown} error */ (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Nieznany blad."}\n`
      );
      process.exitCode = 1;
    }
  );
}
