import { RefreshCw, Search, ShieldAlert, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  REGISTRATION_STATUSES,
  USER_ROLES,
  registrationStatusLabel,
  userRoleLabel
} from "../domain/identity";
import {
  defaultUserDirectoryFilters,
  filterUserProfiles,
  isUserDirectoryActivityFilter,
  isUserDirectoryRoleFilter,
  isUserDirectoryStatusFilter,
  listUserDirectory,
  type UserDirectoryFilters,
  type UserDirectoryResult
} from "./userDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type UserDirectoryApi = {
  list: (env: FirebaseEnv) => Promise<UserDirectoryResult>;
};

export const defaultUserDirectoryApi: UserDirectoryApi = {
  list: listUserDirectory
};

type DirectoryState =
  | {
      status: "IDLE" | "LOADING";
      result: UserDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: UserDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: UserDirectoryResult | null;
      message: string;
    };

const initialDirectoryState: DirectoryState = {
  status: "IDLE",
  result: null,
  message: "Lista nie zostala jeszcze pobrana."
};

export function AdminUserDirectoryPanel({
  authState,
  env,
  userDirectoryApi = defaultUserDirectoryApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  userDirectoryApi?: UserDirectoryApi;
}) {
  const [filters, setFilters] = useState<UserDirectoryFilters>(
    defaultUserDirectoryFilters
  );
  const [directoryState, setDirectoryState] =
    useState<DirectoryState>(initialDirectoryState);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setDirectoryState(initialDirectoryState);
      return undefined;
    }

    setDirectoryState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie uzytkownikow."
    }));

    void userDirectoryApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setDirectoryState({
            status: "READY",
            result,
            message: "Lista uzytkownikow jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setDirectoryState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac listy uzytkownikow."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, userDirectoryApi]);

  const filteredProfiles = useMemo(
    () =>
      directoryState.result
        ? filterUserProfiles(directoryState.result.profiles, filters)
        : [],
    [directoryState.result, filters]
  );

  if (authState.status !== "READY") {
    return (
      <section className="user-directory" aria-label="Uzytkownicy">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="user-directory" aria-label="Uzytkownicy">
        <AccessNotice
          title="Brak dostepu"
          message="Lista uzytkownikow jest dostepna tylko dla administratora."
        />
      </section>
    );
  }

  return (
    <section className="user-directory" aria-label="Uzytkownicy">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Uzytkownicy</p>
          <h2>Lista kont</h2>
          <p className="panel-detail">{directoryState.message}</p>
        </div>
        <button
          className="secondary-action"
          disabled={directoryState.status === "LOADING"}
          onClick={() => {
            setDirectoryState((current) => ({
              status: "LOADING",
              result: current.result,
              message: "Pobieranie uzytkownikow."
            }));

            void userDirectoryApi
              .list(env)
              .then((result) => {
                setDirectoryState({
                  status: "READY",
                  result,
                  message: "Lista uzytkownikow jest aktualna."
                });
              })
              .catch(() => {
                setDirectoryState((current) => ({
                  status: "ERROR",
                  result: current.result,
                  message: "Nie udalo sie pobrac listy uzytkownikow."
                }));
              });
          }}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Odswiez</span>
        </button>
      </div>

      <DirectoryFilters filters={filters} onChange={setFilters} />

      <div className="directory-summary" aria-label="Podsumowanie uzytkownikow">
        <DirectoryStat
          label="Wszystkie profile"
          value={String(directoryState.result?.profiles.length ?? 0)}
        />
        <DirectoryStat label="Po filtrach" value={String(filteredProfiles.length)} />
        <DirectoryStat
          label="Bledne dokumenty"
          value={String(directoryState.result?.invalidProfiles.length ?? 0)}
        />
      </div>

      {directoryState.status === "ERROR" ? (
        <p className="form-message form-message--error">{directoryState.message}</p>
      ) : null}

      {directoryState.status === "LOADING" && !directoryState.result ? (
        <p className="empty-state">Pobieranie uzytkownikow.</p>
      ) : null}

      {directoryState.result && filteredProfiles.length === 0 ? (
        <p className="empty-state">Brak uzytkownikow dla wybranych filtrow.</p>
      ) : null}

      {filteredProfiles.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">E-mail</th>
                <th scope="col">Rola</th>
                <th scope="col">Status</th>
                <th scope="col">Aktywne</th>
                <th scope="col">workerId</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => (
                <tr key={profile.uid}>
                  <td>{profile.displayName}</td>
                  <td>{profile.email}</td>
                  <td>{userRoleLabel(profile.role)}</td>
                  <td>{registrationStatusLabel(profile.registrationStatus)}</td>
                  <td>{profile.active ? "Tak" : "Nie"}</td>
                  <td>{profile.workerId ?? "brak"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {directoryState.result && directoryState.result.invalidProfiles.length > 0 ? (
        <div className="invalid-profiles" aria-label="Bledne profile">
          <div className="access-notice__icon">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">Bledne dokumenty</p>
            <ul>
              {directoryState.result.invalidProfiles.map((invalidProfile) => (
                <li key={invalidProfile.id}>
                  <strong>{invalidProfile.id}</strong>: {invalidProfile.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DirectoryFilters({
  filters,
  onChange
}: {
  filters: UserDirectoryFilters;
  onChange: (filters: UserDirectoryFilters) => void;
}) {
  return (
    <div className="directory-filters" aria-label="Filtry uzytkownikow">
      <label className="field">
        <span>Szukaj</span>
        <span className="search-field">
          <Search aria-hidden="true" size={18} strokeWidth={2.2} />
          <input
            onChange={(event) => {
              onChange({
                ...filters,
                search: event.target.value
              });
            }}
            type="search"
            value={filters.search}
          />
        </span>
      </label>

      <label className="field">
        <span>Rola</span>
        <select
          onChange={(event) => {
            const nextRole = event.target.value;

            if (isUserDirectoryRoleFilter(nextRole)) {
              onChange({
                ...filters,
                role: nextRole
              });
            }
          }}
          value={filters.role}
        >
          <option value="ALL">Wszystkie</option>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {userRoleLabel(role)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            const nextStatus = event.target.value;

            if (isUserDirectoryStatusFilter(nextStatus)) {
              onChange({
                ...filters,
                registrationStatus: nextStatus
              });
            }
          }}
          value={filters.registrationStatus}
        >
          <option value="ALL">Wszystkie</option>
          {REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {registrationStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Aktywnosc</span>
        <select
          onChange={(event) => {
            const nextActivity = event.target.value;

            if (isUserDirectoryActivityFilter(nextActivity)) {
              onChange({
                ...filters,
                activity: nextActivity
              });
            }
          }}
          value={filters.activity}
        >
          <option value="ALL">Wszystkie</option>
          <option value="ACTIVE">Aktywne</option>
          <option value="INACTIVE">Nieaktywne</option>
        </select>
      </label>
    </div>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccessNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="access-notice">
      <div className="access-notice__icon">
        <UsersRound aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="panel-detail">{message}</p>
      </div>
    </div>
  );
}
