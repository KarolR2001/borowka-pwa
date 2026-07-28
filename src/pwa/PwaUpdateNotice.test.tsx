import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createBrowserPwaUpdateIntentStorage,
  createPwaUpdateIntent
} from "./pwaUpdatePolicy";
import { PwaUpdateNotice, type PwaUpdateRegistration } from "./PwaUpdateNotice";

afterEach(() => {
  localStorage.clear();
});

describe("PwaUpdateNotice", () => {
  it("blocks applying an update while work or local data is active", () => {
    render(
      <PwaUpdateNotice
        currentUserUid="operator-1"
        deviceId="device-1"
        hasActiveForm={true}
        hasActiveHarvestSession={true}
        localDataInspected={true}
        registration={createRegistration()}
        syncDocuments={[
          {
            id: "entry-local",
            kind: "HARVEST_ENTRY",
            pendingSync: true
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Nowa wersja gotowa" })).toBeVisible();
    expect(screen.getByText(/Dokoncz albo anuluj aktywny formularz/)).toBeVisible();
    expect(screen.getByText(/poza aktywna sesja/)).toBeVisible();
    expect(screen.getByText(/Najpierw rozlicz 1 lokalnych dokumentow/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Zaktualizuj teraz" })).toBeDisabled();
  });

  it("writes an integrity intent before applying a safe update", async () => {
    const user = userEvent.setup();
    const storage = createBrowserPwaUpdateIntentStorage(localStorage);
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);

    render(
      <PwaUpdateNotice
        currentUserUid="operator-1"
        deviceId="device-1"
        hasActiveForm={false}
        hasActiveHarvestSession={false}
        intentStorage={storage}
        localDataInspected={true}
        registration={createRegistration({ updateServiceWorker })}
        syncDocuments={[
          {
            id: "entry-synced",
            kind: "HARVEST_ENTRY"
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zaktualizuj teraz" }));

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(storage.read()).toMatchObject({
      deviceId: "device-1",
      expectedLocalDocumentIds: ["entry-synced"],
      schemaVersion: "schema-0001",
      userUid: "operator-1"
    });
  });

  it("keeps a downloaded update available after deferral", async () => {
    const user = userEvent.setup();

    render(
      <PwaUpdateNotice
        currentUserUid={null}
        deviceId="device-1"
        hasActiveForm={false}
        hasActiveHarvestSession={false}
        localDataInspected={true}
        registration={createRegistration()}
        syncDocuments={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Odloz aktualizacje" }));

    expect(screen.getByRole("heading", { name: "Aktualizacja odroczona" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Wroc do aktualizacji" })).toBeEnabled();
  });

  it("reports successful post-update integrity and clears the marker", async () => {
    const storage = createBrowserPwaUpdateIntentStorage(localStorage);

    storage.write(
      createPwaUpdateIntent({
        appVersion: "0.0.9",
        deviceId: "device-1",
        schemaVersion: "schema-0001",
        syncDocuments: [
          {
            id: "entry-local",
            kind: "HARVEST_ENTRY",
            pendingSync: true
          }
        ],
        userUid: "operator-1"
      })
    );

    render(
      <PwaUpdateNotice
        currentUserUid="operator-1"
        deviceId="device-1"
        hasActiveForm={false}
        hasActiveHarvestSession={false}
        intentStorage={storage}
        localDataInspected={true}
        registration={createRegistration({ needRefresh: false })}
        syncDocuments={[
          {
            id: "entry-local",
            kind: "HARVEST_ENTRY",
            pendingSync: true
          }
        ]}
      />
    );

    expect(await screen.findByText("Kontrola po aktualizacji zakonczona")).toBeVisible();
    await waitFor(() => {
      expect(storage.read()).toBeNull();
    });
  });
});

function createRegistration(
  overrides: Partial<PwaUpdateRegistration> = {}
): PwaUpdateRegistration {
  return {
    dismissOfflineReady: vi.fn(),
    needRefresh: true,
    offlineReady: false,
    updateServiceWorker: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}
