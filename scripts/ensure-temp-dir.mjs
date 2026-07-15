import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const tempDirectory = resolve(scriptDirectory, "../.tmp");

mkdirSync(tempDirectory, { recursive: true });
