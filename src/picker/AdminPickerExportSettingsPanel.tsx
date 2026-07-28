import { Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  readPickerReportExportSetting,
  updatePickerReportExportSetting,
  type PickerReportExportSetting,
  type UpdatePickerReportExportSettingInput
} from "./pickerReportExportSettings";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerExportSettingsApi = {
  read: (
    env: FirebaseEnv,
    input: {
      actorProfile: UpdatePickerReportExportSettingInput["actorProfile"];
      isOnline: boolean;
    }
  ) => Promise<PickerReportExportSetting>;
  update: (
    env: FirebaseEnv,
    input: UpdatePickerReportExportSettingInput
  ) => Promise<void>;
};

export const defaultPickerExportSettingsApi: PickerExportSettingsApi = {
  read: readPickerReportExportSetting,
  update: updatePickerReportExportSetting
};

type SettingsState =
  | { result: PickerReportExportSetting | null; status: "IDLE" | "LOADING" }
  | { result: PickerReportExportSetting; status: "READY" }
  | { result: PickerReportExportSetting | null; status: "ERROR" };

const initialState: SettingsState = { result: null, status: "IDLE" };

export function AdminPickerExportSettingsPanel({
  authState,
  env,
  isOnline,
  settingsApi = defaultPickerExportSettingsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  settingsApi?: PickerExportSettingsApi;
}) {
  const [state, setState] = useState<SettingsState>(initialState);
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void settingsApi
      .read(env, { actorProfile: authState.profile, isOnline })
      .then((result) => {
        if (isMounted) {
          setEnabled(result.enabled);
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({ result: current.result, status: "ERROR" }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isAdmin, isOnline, settingsApi]);

  if (!isAdmin) {
    return null;
  }

  async function handleSave(): Promise<void> {
    if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await settingsApi.update(env, {
        actorProfile: authState.profile,
        enabled
      });
      const result = await settingsApi.read(env, {
        actorProfile: authState.profile,
        isOnline: true
      });
      setEnabled(result.enabled);
      setState({ result, status: "READY" });
      setFeedback("Zapisano dostepnosc eksportu pickera.");
    } catch {
      setFeedback("Nie udalo sie zapisac ustawienia eksportu.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className="picker-export-settings"
      aria-labelledby="picker-export-settings-title"
    >
      <header className="directory-header">
        <div>
          <p className="eyebrow">Ustawienie funkcji</p>
          <h2 id="picker-export-settings-title">Eksport danych pickera</h2>
          <p className="panel-detail">
            Status: {state.result?.enabled ? "wlaczony" : "wylaczony"}
          </p>
        </div>
        <Settings2 aria-hidden="true" size={24} />
      </header>
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac ustawienia eksportu.
        </p>
      ) : null}
      <label className="checkbox-row">
        <input
          checked={enabled}
          disabled={state.status !== "READY" || isSaving || !isOnline}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setFeedback(null);
          }}
          type="checkbox"
        />
        <span>Picker moze pobrac wlasne zestawienie CSV</span>
      </label>
      <div className="form-actions">
        <button
          className="primary-button"
          disabled={
            state.status !== "READY" ||
            isSaving ||
            !isOnline ||
            enabled === state.result.enabled
          }
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          <Save aria-hidden="true" size={18} />
          {isSaving ? "Zapisywanie" : "Zapisz ustawienie"}
        </button>
      </div>
      {!isOnline ? (
        <p className="form-message form-message--warning">
          Zmiana ustawienia wymaga polaczenia.
        </p>
      ) : null}
      {feedback ? (
        <p aria-live="polite" className="form-message">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
