import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const firebaseToolsVersion = "15.23.0";
const javaHome = resolve(".tools/jdk-21.0.11+10-jre");
const nodeHome = resolve(".tools/node-v24.14.0-linux-x64");

if (!existsSync(resolve(javaHome, "bin/java"))) {
  throw new Error(
    `Local JRE not found at ${javaHome}. Install Temurin JRE 21 before running Firebase emulators.`
  );
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(
  command,
  ["--yes", `firebase-tools@${firebaseToolsVersion}`, ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      PATH: `${resolve(nodeHome, "bin")}:${resolve(javaHome, "bin")}:${process.env.PATH ?? ""}`
    },
    shell: process.platform === "win32",
    stdio: "inherit"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
