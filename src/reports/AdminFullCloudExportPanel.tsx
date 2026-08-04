import { Archive, Download } from "lucide-react";
import { useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  loadFullCloudExport,
  type FullCloudExportArchive,
  type FullCloudExportProgress
} from "./fullCloudExport";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type FullCloudExportApi = {
  create: typeof loadFullCloudExport;
  download: (archive: FullCloudExportArchive) => void;
};

export const defaultFullCloudExportApi: FullCloudExportApi = {
  create: loadFullCloudExport,
  download: downloadFullCloudExport
};

type ExportState =
  | { status: "IDLE" }
  | { progress: FullCloudExportProgress | null; status: "EXPORTING" }
  | { archive: FullCloudExportArchive; status: "SUCCESS" }
  | { message: string; status: "ERROR" };

export function AdminFullCloudExportPanel({
  api = defaultFullCloudExportApi,
  authState,
  env,
  isOnline
}: {
  api?: FullCloudExportApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
}) {
  const [state, setState] = useState<ExportState>({ status: "IDLE" });
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  if (!isAdmin) {
    return null;
  }

  async function handleExport(): Promise<void> {
    if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
      return;
    }

    setState({ progress: null, status: "EXPORTING" });
    try {
      const archive = await api.create(env, {
        actorProfile: authState.profile,
        isOnline,
        onProgress: (progress) => {
          setState({ progress, status: "EXPORTING" });
        }
      });
      api.download(archive);
      setState({ archive, status: "SUCCESS" });
    } catch (error) {
      setState({
        message:
          error instanceof Error
            ? error.message
            : "Nie udalo sie przygotowac pelnego eksportu.",
        status: "ERROR"
      });
    }
  }

  return (
    <section className="full-cloud-export" aria-labelledby="full-cloud-export-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Archiwizacja</p>
          <h2 id="full-cloud-export-title">Pelny eksport chmury</h2>
          <p className="panel-detail">Dane potwierdzone w Firestore</p>
        </div>
        <Archive aria-hidden="true" size={24} />
      </header>

      <p className="form-message form-message--warning">
        Archiwum zawiera dane osobowe. Przechowuj je w zabezpieczonej lokalizacji.
      </p>

      <div className="form-actions">
        <button
          className="primary-button"
          disabled={!isOnline || state.status === "EXPORTING"}
          onClick={() => {
            void handleExport();
          }}
          type="button"
        >
          <Download aria-hidden="true" size={18} />
          {state.status === "EXPORTING"
            ? "Przygotowywanie eksportu chmury"
            : "Pobierz pelny eksport chmury"}
        </button>
      </div>

      {!isOnline ? (
        <p className="form-message form-message--warning">
          Pelny eksport chmury wymaga polaczenia z serwerem.
        </p>
      ) : null}

      {state.status === "EXPORTING" ? (
        <p aria-live="polite" className="form-message">
          {state.progress
            ? `Pobrano kolekcje ${String(
                state.progress.completedCollectionCount
              )} z ${String(state.progress.totalCollectionCount)}.`
            : "Rozpoczynanie eksportu."}
        </p>
      ) : null}

      {state.status === "SUCCESS" ? (
        <p aria-live="polite" className="form-message form-message--success">
          Pobrano {state.archive.manifest.summary.documentCount} dokumentow z{" "}
          {state.archive.manifest.summary.collectionCount} kolekcji. Pominieto{" "}
          {state.archive.omissions.length} dokumentow.
        </p>
      ) : null}

      {state.status === "ERROR" ? (
        <p aria-live="assertive" className="form-message form-message--error">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function downloadFullCloudExport(archive: FullCloudExportArchive): void {
  const bytes = new Uint8Array(archive.bytes.byteLength);
  bytes.set(archive.bytes);
  const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = archive.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
