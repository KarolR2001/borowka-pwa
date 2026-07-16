import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "demo-borowka-pwa-dev";

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("Firestore deny-by-default rules", () => {
  it("reject anonymous reads and writes", async () => {
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv.unauthenticatedContext().firestore();
    const smokeDoc = doc(db, "smoke", "anonymous");

    await assertFails(getDoc(smokeDoc));
    await assertFails(setDoc(smokeDoc, { value: "blocked" }));
  });

  it("reject authenticated reads and writes outside account collections", async () => {
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("user-1", { email: "user@example.test" })
      .firestore();
    const smokeDoc = doc(db, "smoke", "authenticated");

    await assertFails(getDoc(smokeDoc));
    await assertFails(setDoc(smokeDoc, { value: "blocked" }));
  });
});
