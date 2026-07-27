import { readCurrentDeviceIdentity } from "./deviceIdentity";

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

const navigatorLike = {
  userAgentData: {
    platform: "Android"
  },
  userAgent: "Mozilla/5.0 Test Browser"
};

describe("device identity", () => {
  it("combines stable local id with display name and platform", () => {
    const identity = readCurrentDeviceIdentity({
      storage: createMemoryStorage("device-existing"),
      navigatorLike
    });

    expect(identity).toEqual({
      id: "device-existing",
      name: "Urzadzenie Android",
      platform: "Android"
    });
  });

  it("creates a new local id after local storage has been cleared", () => {
    const storage = createMemoryStorage();
    const firstIdentity = readCurrentDeviceIdentity({ storage, navigatorLike });

    storage.clear();

    const secondIdentity = readCurrentDeviceIdentity({ storage, navigatorLike });

    expect(firstIdentity.id).not.toBe(secondIdentity.id);
    expect(secondIdentity.name).toBe("Urzadzenie Android");
  });
});
