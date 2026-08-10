import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminFullCloudExportPanel,
  downloadFullCloudExport,
  type FullCloudExportApi
} from "./AdminFullCloudExportPanel";
import type { FullCloudExportArchive } from "./fullCloudExport";

const adminState: AuthSessionState = {
  access: { role: "ADMIN", status: "READY" },
  message: "Profil aktywny.",
  profile: {
    active: true,
    displayName: "Admin",
    email: "admin@example.test",
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role: "ADMIN",
    uid: "admin-1",
    workerId: null
  },
  status: "READY",
  user: { displayName: "Admin", email: "admin@example.test", uid: "admin-1" }
};

describe("AdminFullCloudExportPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads a completed archive and reports progress", async () => {
    const user = userEvent.setup();
    const archive = testArchive();
    const download = vi.fn<FullCloudExportApi["download"]>();
    const create = vi
      .fn<FullCloudExportApi["create"]>()
      .mockImplementation((_env, input) => {
        input.onProgress?.({
          completedCollectionCount: 15,
          currentCollection: "workers",
          totalCollectionCount: 15
        });
        return Promise.resolve(archive);
      });

    render(
      <AdminFullCloudExportPanel
        api={{ create, download }}
        authState={adminState}
        env={{ VITE_FIREBASE_PROJECT_ID: "borowka-dev" }}
        isOnline
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Pobierz pelny eksport chmury" })
    );

    await waitFor(() => {
      expect(download).toHaveBeenCalledWith(archive);
    });
    expect(
      screen.getByText(
        "Archiwum zawiera dane osobowe i finansowe. Przechowuj je w zabezpieczonej lokalizacji."
      )
    ).toBeVisible();
    const createCall = create.mock.calls[0];
    expect(createCall[0]).toEqual({ VITE_FIREBASE_PROJECT_ID: "borowka-dev" });
    expect(createCall[1].actorProfile).toEqual(adminState.profile);
    expect(createCall[1].isOnline).toBe(true);
    expect(createCall[1].onProgress).toBeTypeOf("function");
    expect(
      screen.getByText("Pobrano 12 dokumentow z 15 kolekcji. Pominieto 1 dokumentow.")
    ).toBeVisible();
  });

  it.each(["OPERATOR", "PICKER"] as const)("is hidden from the %s role", (role) => {
    const create = vi.fn<FullCloudExportApi["create"]>();

    const { container } = render(
      <AdminFullCloudExportPanel
        api={{ create, download: vi.fn() }}
        authState={{
          ...adminState,
          access: { role, status: "READY" },
          profile: { ...adminState.profile, role }
        }}
        env={{}}
        isOnline
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks the server export offline", () => {
    render(
      <AdminFullCloudExportPanel
        api={{ create: vi.fn(), download: vi.fn() }}
        authState={adminState}
        env={{}}
        isOnline={false}
      />
    );

    expect(
      screen.getByRole("button", { name: "Pobierz pelny eksport chmury" })
    ).toBeDisabled();
    expect(
      screen.getByText("Pelny eksport chmury wymaga polaczenia z serwerem.")
    ).toBeVisible();
  });

  it("downloads through a temporary blob URL and revokes it immediately", () => {
    const createObjectURL = vi.fn(() => "blob:borowka-export");
    const revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadFullCloudExport(testArchive());

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:borowka-export");
    expect(document.querySelector('a[href="blob:borowka-export"]')).toBeNull();
  });
});

function testArchive(): FullCloudExportArchive {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    filename: "export.zip",
    manifest: {
      application: {
        buildDate: "2026-08-04T00:00:00.000Z",
        buildId: "test",
        calculationVersion: "1",
        name: "Borowka PWA",
        schemaVersion: "1",
        version: "1.0.0"
      },
      collections: [],
      environment: {
        appEnvironment: "development",
        firebaseProjectId: "borowka-dev",
        source: "FIRESTORE_SERVER"
      },
      exportedAtIso: "2026-08-04T20:00:00.000Z",
      exportedBy: { email: "admin@example.test", role: "ADMIN", uid: "admin-1" },
      files: [],
      format: {
        dataScope: "ALL_FIRESTORE_COLLECTIONS",
        name: "BOROWKA_FULL_CLOUD_EXPORT",
        purpose: "PORTABLE_ARCHIVE",
        source: "FIRESTORE_SERVER",
        version: 2
      },
      omissions: { count: 1, path: "errors.json" },
      seasonTotals: [],
      summary: { collectionCount: 15, documentCount: 12, legacyDocumentCount: 0 }
    },
    omissions: [{ collection: "devices", documentId: "device-1", reason: "Test" }]
  };
}
