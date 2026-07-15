import { getOrCreateDeviceId } from "./device";

function createMemoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set("borowka.deviceId", initialValue);
  }

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("device id", () => {
  it("returns an existing device id", () => {
    const storage = createMemoryStorage("device-existing");

    expect(getOrCreateDeviceId(storage)).toBe("device-existing");
  });

  it("creates and persists a new device id", () => {
    const storage = createMemoryStorage();

    const deviceId = getOrCreateDeviceId(storage);

    expect(deviceId).toMatch(/^[0-9a-f-]{36}$|^device-/);
    expect(storage.getItem("borowka.deviceId")).toBe(deviceId);
  });
});
