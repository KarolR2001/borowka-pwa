import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const firebaseToolsVersion = "15.23.0";
const localJavaHome = resolve(".tools/jdk-21.0.11+10-jre");
const nodeHome = resolve(".tools/node-v24.14.0-linux-x64");
const javaHome = existsSync(resolve(localJavaHome, "bin/java"))
  ? localJavaHome
  : process.env.JAVA_HOME;

if (!javaHome) {
  throw new Error(
    `Java runtime not found. Install Temurin JRE 21 locally at ${localJavaHome} or provide JAVA_HOME.`
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
