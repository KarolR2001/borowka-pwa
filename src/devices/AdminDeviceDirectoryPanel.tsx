import { RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { listDeviceDirectory, type DeviceDirectoryResult } from "./deviceDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type DeviceDirectoryApi = {
  list: (env: FirebaseEnv) => Promise<DeviceDirectoryResult>;
};

export const defaultDeviceDirectoryApi: DeviceDirectoryApi = {
  list: listDeviceDirectory
};

type DeviceDirectoryState =
  | {
      status: "IDLE" | "LOADING";
      result: DeviceDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: DeviceDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: DeviceDirectoryResult | null;
      message: string;
    };

const initialState: DeviceDirectoryState = {
  status: "IDLE",
  result: null,
  message: "Lista urzadzen nie zostala jeszcze pobrana."
};

export function AdminDeviceDirectoryPanel({
  authState,
  env,
  deviceDirectoryApi = defaultDeviceDirectoryApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  deviceDirectoryApi?: DeviceDirectoryApi;
}) {
  const [directoryState, setDirectoryState] =
    useState<DeviceDirectoryState>(initialState);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  const loadDevices = () => {
    setDirectoryState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie urzadzen."
    }));

    void deviceDirectoryApi
      .list(env)
      .then((result) => {
        setDirectoryState({
          status: "READY",
          result,
          message: "Lista urzadzen jest aktualna."
        });
      })
      .catch(() => {
        setDirectoryState((current) => ({
          status: "ERROR",
          result: current.result,
          message: "Nie udalo sie pobrac listy urzadzen."
        }));
      });
  };

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setDirectoryState(initialState);
      return undefined;
    }

    setDirectoryState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie urzadzen."
    }));

    void deviceDirectoryApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setDirectoryState({
            status: "READY",
            result,
            message: "Lista urzadzen jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setDirectoryState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac listy urzadzen."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [deviceDirectoryApi, env, isAdmin]);

  if (authState.status !== "READY") {
    return (
      <section className="device-directory" aria-label="Urzadzenia">
        <DeviceNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="device-directory" aria-label="Urzadzenia">
        <DeviceNotice
          title="Brak dostepu"
          message="Lista urzadzen jest dostepna tylko dla administratora."
        />
      </section>
    );
  }

  return (
    <section className="device-directory" aria-label="Urzadzenia">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Urzadzenia</p>
          <h2>Lista urzadzen</h2>
          <p className="panel-detail">{directoryState.message}</p>
        </div>
        <button
          className="secondary-action"
          disabled={directoryState.status === "LOADING"}
          onClick={loadDevices}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Odswiez</span>
        </button>
      </div>

      <div className="directory-summary" aria-label="Podsumowanie urzadzen">
        <DeviceStat
          label="Wszystkie urzadzenia"
          value={String(directoryState.result?.devices.length ?? 0)}
        />
        <DeviceStat
          label="Aktywne"
          value={String(
            directoryState.result?.devices.filter((device) => device.active).length ?? 0
          )}
        />
        <DeviceStat
          label="Bledne dokumenty"
          value={String(directoryState.result?.invalidDevices.length ?? 0)}
        />
      </div>

      {directoryState.status === "ERROR" ? (
        <p className="form-message form-message--error">{directoryState.message}</p>
      ) : null}

      {directoryState.status === "LOADING" && !directoryState.result ? (
        <p className="empty-state">Pobieranie urzadzen.</p>
      ) : null}

      {directoryState.result?.devices.length === 0 ? (
        <p className="empty-state">Brak zarejestrowanych urzadzen.</p>
      ) : null}

      {directoryState.result && directoryState.result.devices.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">Uzytkownik</th>
                <th scope="col">Platforma</th>
                <th scope="col">Offline</th>
                <th scope="col">Aktywne</th>
                <th scope="col">Id</th>
              </tr>
            </thead>
            <tbody>
              {directoryState.result.devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.deviceName}</td>
                  <td>{device.userUid}</td>
                  <td>{device.platform ?? "brak"}</td>
                  <td>{device.trustedOfflineStorage ? "Tak" : "Nie"}</td>
                  <td>{device.active ? "Tak" : "Nie"}</td>
                  <td>{device.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {directoryState.result && directoryState.result.invalidDevices.length > 0 ? (
        <div className="invalid-profiles" aria-label="Bledne urzadzenia">
          <div className="access-notice__icon">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">Bledne dokumenty</p>
            <ul>
              {directoryState.result.invalidDevices.map((invalidDevice) => (
                <li key={invalidDevice.id}>
                  <strong>{invalidDevice.id}</strong>: {invalidDevice.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DeviceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeviceNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="access-notice">
      <div className="access-notice__icon">
        <Smartphone aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="panel-detail">{message}</p>
      </div>
    </div>
  );
}
