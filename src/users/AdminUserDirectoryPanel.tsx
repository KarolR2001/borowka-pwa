import {
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserCog,
  UsersRound,
  UserX
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import {
  REGISTRATION_STATUSES,
  USER_ROLES,
  registrationStatusLabel,
  userRoleLabel,
  type UserProfile,
  type UserRole
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
import {
  updateUserActivation,
  updateUserRoleAndWorker,
  type UserActivationAction,
  type UserActivationUpdateInput,
  type UserRoleAndWorkerUpdateInput
} from "./userProfileUpdates";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type UserDirectoryApi = {
  list: (env: FirebaseEnv) => Promise<UserDirectoryResult>;
  updateRoleAndWorker?: (
    env: FirebaseEnv,
    input: UserRoleAndWorkerUpdateInput
  ) => Promise<unknown>;
  updateActivation?: (
    env: FirebaseEnv,
    input: UserActivationUpdateInput
  ) => Promise<unknown>;
};

export const defaultUserDirectoryApi: UserDirectoryApi = {
  list: listUserDirectory,
  updateActivation: updateUserActivation,
  updateRoleAndWorker: updateUserRoleAndWorker
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

type RoleChangeDraft = {
  targetUid: string;
  targetRole: UserRole;
  targetWorkerId: string;
  reason: string;
  confirmed: boolean;
};

type AccountStatusDraft = {
  targetUid: string;
  action: UserActivationAction;
  targetRole: UserRole;
  targetWorkerId: string;
  reason: string;
  confirmed: boolean;
};

const initialDirectoryState: DirectoryState = {
  status: "IDLE",
  result: null,
  message: "Lista nie zostala jeszcze pobrana."
};

const initialRoleChangeDraft: RoleChangeDraft = {
  targetUid: "",
  targetRole: "OPERATOR",
  targetWorkerId: "",
  reason: "",
  confirmed: false
};

const initialAccountStatusDraft: AccountStatusDraft = {
  targetUid: "",
  action: "BLOCK",
  targetRole: "OPERATOR",
  targetWorkerId: "",
  reason: "",
  confirmed: false
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
  const [roleChangeDraft, setRoleChangeDraft] =
    useState<RoleChangeDraft>(initialRoleChangeDraft);
  const [accountStatusDraft, setAccountStatusDraft] = useState<AccountStatusDraft>(
    initialAccountStatusDraft
  );
  const [roleChangeFeedback, setRoleChangeFeedback] = useState<string | null>(null);
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);
  const [isRoleChangeSubmitting, setIsRoleChangeSubmitting] = useState(false);
  const [accountStatusFeedback, setAccountStatusFeedback] = useState<string | null>(null);
  const [accountStatusError, setAccountStatusError] = useState<string | null>(null);
  const [isAccountStatusSubmitting, setIsAccountStatusSubmitting] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";
  const currentUserUid = authState.status === "READY" ? authState.user.uid : null;

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
  const editableRoleChangeProfiles = useMemo(
    () =>
      directoryState.result
        ? directoryState.result.profiles.filter(
            (profile) =>
              profile.uid !== currentUserUid &&
              profile.active &&
              profile.registrationStatus === "APPROVED"
          )
        : [],
    [currentUserUid, directoryState.result]
  );
  const editableAccountStatusProfiles = useMemo(
    () =>
      directoryState.result
        ? directoryState.result.profiles.filter(
            (profile) => profile.uid !== currentUserUid
          )
        : [],
    [currentUserUid, directoryState.result]
  );
  const selectedRoleChangeProfile = useMemo(
    () =>
      editableRoleChangeProfiles.find(
        (profile) => profile.uid === roleChangeDraft.targetUid
      ) ?? null,
    [editableRoleChangeProfiles, roleChangeDraft.targetUid]
  );
  const selectedAccountStatusProfile = useMemo(
    () =>
      editableAccountStatusProfiles.find(
        (profile) => profile.uid === accountStatusDraft.targetUid
      ) ?? null,
    [accountStatusDraft.targetUid, editableAccountStatusProfiles]
  );
  const activeApprovedAdminCount = useMemo(
    () =>
      directoryState.result
        ? directoryState.result.profiles.filter(
            (profile) =>
              profile.role === "ADMIN" &&
              profile.active &&
              profile.registrationStatus === "APPROVED"
          ).length
        : 0,
    [directoryState.result]
  );
  const isLastActiveAdmin =
    authState.status === "READY" &&
    authState.profile.role === "ADMIN" &&
    authState.profile.active &&
    authState.profile.registrationStatus === "APPROVED" &&
    activeApprovedAdminCount === 1;

  useEffect(() => {
    if (!directoryState.result) {
      return;
    }

    const currentSelection = editableRoleChangeProfiles.find(
      (profile) => profile.uid === roleChangeDraft.targetUid
    );

    if (currentSelection) {
      return;
    }

    if (editableRoleChangeProfiles.length === 0) {
      setRoleChangeDraft((current) =>
        current.targetUid === ""
          ? current
          : {
              ...initialRoleChangeDraft
            }
      );
      return;
    }

    const firstEditableProfile = editableRoleChangeProfiles[0];

    setRoleChangeDraft((current) => ({
      ...current,
      targetUid: firstEditableProfile.uid,
      targetRole: firstEditableProfile.role,
      targetWorkerId: firstEditableProfile.workerId ?? ""
    }));
  }, [directoryState.result, editableRoleChangeProfiles, roleChangeDraft.targetUid]);

  useEffect(() => {
    if (!directoryState.result) {
      return;
    }

    const currentSelection = editableAccountStatusProfiles.find(
      (profile) => profile.uid === accountStatusDraft.targetUid
    );

    if (currentSelection) {
      return;
    }

    if (editableAccountStatusProfiles.length === 0) {
      setAccountStatusDraft((current) =>
        current.targetUid === ""
          ? current
          : {
              ...initialAccountStatusDraft
            }
      );
      return;
    }

    const firstEditableProfile = editableAccountStatusProfiles[0];

    setAccountStatusDraft((current) => ({
      ...current,
      targetUid: firstEditableProfile.uid,
      action: getDefaultActivationAction(firstEditableProfile),
      targetRole: firstEditableProfile.role,
      targetWorkerId: firstEditableProfile.workerId ?? ""
    }));
  }, [
    accountStatusDraft.targetUid,
    directoryState.result,
    editableAccountStatusProfiles
  ]);

  const handleRoleChangeSubmit = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setRoleChangeFeedback(null);
    setRoleChangeError(null);

    if (!selectedRoleChangeProfile) {
      setRoleChangeError("Wybierz profil do zmiany.");
      return;
    }

    if (!roleChangeDraft.confirmed) {
      setRoleChangeError("Potwierdz zmiane roli i powiazania.");
      return;
    }

    if (!navigator.onLine) {
      setRoleChangeError("Zmiana roli wymaga polaczenia online.");
      return;
    }

    const updateRoleAndWorker =
      userDirectoryApi.updateRoleAndWorker ?? defaultUserDirectoryApi.updateRoleAndWorker;

    if (!updateRoleAndWorker) {
      setRoleChangeError("Operacja zmiany profilu nie jest dostepna.");
      return;
    }

    setIsRoleChangeSubmitting(true);

    try {
      await updateRoleAndWorker(env, {
        actorProfile: authState.profile,
        targetUid: selectedRoleChangeProfile.uid,
        targetRole: roleChangeDraft.targetRole,
        targetWorkerId: roleChangeDraft.targetWorkerId,
        reason: roleChangeDraft.reason,
        deviceId: getOrCreateDeviceId()
      });

      const result = await userDirectoryApi.list(env);

      setDirectoryState({
        status: "READY",
        result,
        message: "Lista uzytkownikow jest aktualna."
      });
      setRoleChangeFeedback("Zmieniono role lub powiazanie profilu.");
      setRoleChangeDraft((current) => ({
        ...current,
        reason: "",
        confirmed: false
      }));
    } catch (error: unknown) {
      setRoleChangeError(getRoleChangeErrorMessage(error));
    } finally {
      setIsRoleChangeSubmitting(false);
    }
  };

  const handleAccountStatusSubmit = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setAccountStatusFeedback(null);
    setAccountStatusError(null);

    if (!selectedAccountStatusProfile) {
      setAccountStatusError("Wybierz profil do zmiany statusu.");
      return;
    }

    if (!accountStatusDraft.confirmed) {
      setAccountStatusError("Potwierdz zmiane statusu konta.");
      return;
    }

    if (!navigator.onLine) {
      setAccountStatusError("Zmiana statusu wymaga polaczenia online.");
      return;
    }

    const updateActivation =
      userDirectoryApi.updateActivation ?? defaultUserDirectoryApi.updateActivation;

    if (!updateActivation) {
      setAccountStatusError("Operacja zmiany statusu nie jest dostepna.");
      return;
    }

    setIsAccountStatusSubmitting(true);

    try {
      await updateActivation(env, {
        actorProfile: authState.profile,
        targetUid: selectedAccountStatusProfile.uid,
        action: accountStatusDraft.action,
        targetRole: accountStatusDraft.targetRole,
        targetWorkerId: accountStatusDraft.targetWorkerId,
        reason: accountStatusDraft.reason,
        deviceId: getOrCreateDeviceId()
      });

      const result = await userDirectoryApi.list(env);

      setDirectoryState({
        status: "READY",
        result,
        message: "Lista uzytkownikow jest aktualna."
      });
      setAccountStatusFeedback(
        accountStatusDraft.action === "BLOCK"
          ? "Zablokowano konto uzytkownika."
          : "Reaktywowano konto uzytkownika."
      );
      setAccountStatusDraft((current) => ({
        ...current,
        action: current.action === "BLOCK" ? "REACTIVATE" : "BLOCK",
        reason: "",
        confirmed: false
      }));
    } catch (error: unknown) {
      setAccountStatusError(getProfileUpdateErrorMessage(error));
    } finally {
      setIsAccountStatusSubmitting(false);
    }
  };

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

      {directoryState.result ? (
        <>
          {isLastActiveAdmin ? <LastAdminProtectionNotice /> : null}
          <RoleChangeForm
            draft={roleChangeDraft}
            error={roleChangeError}
            feedback={roleChangeFeedback}
            isSubmitting={isRoleChangeSubmitting}
            onChange={setRoleChangeDraft}
            onSubmit={() => {
              void handleRoleChangeSubmit();
            }}
            profiles={editableRoleChangeProfiles}
          />
          <AccountStatusForm
            draft={accountStatusDraft}
            error={accountStatusError}
            feedback={accountStatusFeedback}
            isSubmitting={isAccountStatusSubmitting}
            onChange={setAccountStatusDraft}
            onSubmit={() => {
              void handleAccountStatusSubmit();
            }}
            profiles={editableAccountStatusProfiles}
          />
        </>
      ) : null}

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

function getDefaultActivationAction(profile: UserProfile): UserActivationAction {
  return profile.active && profile.registrationStatus === "APPROVED"
    ? "BLOCK"
    : "REACTIVATE";
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

function RoleChangeForm({
  draft,
  error,
  feedback,
  isSubmitting,
  onChange,
  onSubmit,
  profiles
}: {
  draft: RoleChangeDraft;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
  onChange: (draft: RoleChangeDraft) => void;
  onSubmit: () => void;
  profiles: UserProfile[];
}) {
  return (
    <form
      aria-label="Zmiana roli i powiazania"
      className="role-change-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Profil roli</span>
        <select
          disabled={isSubmitting || profiles.length === 0}
          onChange={(event) => {
            const nextProfile = profiles.find(
              (profile) => profile.uid === event.target.value
            );

            onChange({
              ...draft,
              targetUid: event.target.value,
              targetRole: nextProfile?.role ?? draft.targetRole,
              targetWorkerId: nextProfile?.workerId ?? "",
              confirmed: false
            });
          }}
          value={draft.targetUid}
        >
          {profiles.map((profile) => (
            <option key={profile.uid} value={profile.uid}>
              {profile.displayName} ({profile.email})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Nowa rola</span>
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            const nextRole = event.target.value;

            if (!USER_ROLES.includes(nextRole as UserRole)) {
              return;
            }

            onChange({
              ...draft,
              targetRole: nextRole as UserRole,
              confirmed: false
            });
          }}
          value={draft.targetRole}
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {userRoleLabel(role)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>workerId</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              targetWorkerId: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.targetWorkerId}
        />
      </label>

      <label className="field">
        <span>Powod zmiany roli</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              reason: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.reason}
        />
      </label>

      <label className="checkbox-field role-change-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam zmiane roli i powiazania</span>
      </label>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <button
        className="primary-action role-change-form__submit"
        disabled={isSubmitting || profiles.length === 0}
        type="submit"
      >
        <UserCog aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Zapisz zmiane</span>
      </button>
    </form>
  );
}

function AccountStatusForm({
  draft,
  error,
  feedback,
  isSubmitting,
  onChange,
  onSubmit,
  profiles
}: {
  draft: AccountStatusDraft;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
  onChange: (draft: AccountStatusDraft) => void;
  onSubmit: () => void;
  profiles: UserProfile[];
}) {
  const isReactivation = draft.action === "REACTIVATE";
  const SubmitIcon = isReactivation ? UserCheck : UserX;

  return (
    <form
      aria-label="Blokada i reaktywacja konta"
      className="account-status-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Profil statusu</span>
        <select
          disabled={isSubmitting || profiles.length === 0}
          onChange={(event) => {
            const nextProfile = profiles.find(
              (profile) => profile.uid === event.target.value
            );

            onChange({
              ...draft,
              targetUid: event.target.value,
              action: nextProfile
                ? getDefaultActivationAction(nextProfile)
                : draft.action,
              targetRole: nextProfile?.role ?? draft.targetRole,
              targetWorkerId: nextProfile?.workerId ?? "",
              confirmed: false
            });
          }}
          value={draft.targetUid}
        >
          {profiles.map((profile) => (
            <option key={profile.uid} value={profile.uid}>
              {profile.displayName} ({profile.email})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Operacja</span>
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            const nextAction = event.target.value;

            if (nextAction !== "BLOCK" && nextAction !== "REACTIVATE") {
              return;
            }

            onChange({
              ...draft,
              action: nextAction,
              confirmed: false
            });
          }}
          value={draft.action}
        >
          <option value="BLOCK">Blokada</option>
          <option value="REACTIVATE">Reaktywacja</option>
        </select>
      </label>

      <label className="field">
        <span>Rola po reaktywacji</span>
        <select
          disabled={isSubmitting || !isReactivation}
          onChange={(event) => {
            const nextRole = event.target.value;

            if (!USER_ROLES.includes(nextRole as UserRole)) {
              return;
            }

            onChange({
              ...draft,
              targetRole: nextRole as UserRole,
              confirmed: false
            });
          }}
          value={draft.targetRole}
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {userRoleLabel(role)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>workerId po reaktywacji</span>
        <input
          disabled={isSubmitting || !isReactivation}
          onChange={(event) => {
            onChange({
              ...draft,
              targetWorkerId: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.targetWorkerId}
        />
      </label>

      <label className="field">
        <span>Powod zmiany statusu</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              reason: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.reason}
        />
      </label>

      <p className="account-status-form__warning">
        Blokada nie usuwa konta Authentication ani lokalnych oczekujacych danych na
        urzadzeniach.
      </p>

      <label className="checkbox-field account-status-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam zmiane statusu konta</span>
      </label>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <button
        className="primary-action account-status-form__submit"
        disabled={isSubmitting || profiles.length === 0}
        type="submit"
      >
        <SubmitIcon aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>{isReactivation ? "Reaktywuj konto" : "Zablokuj konto"}</span>
      </button>
    </form>
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

function getRoleChangeErrorMessage(error: unknown): string {
  return getProfileUpdateErrorMessage(error);
}

function getProfileUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie zapisac zmiany profilu.";
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

function LastAdminProtectionNotice() {
  return (
    <div className="access-notice" aria-label="Ochrona ostatniego administratora">
      <div className="access-notice__icon">
        <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">Ochrona administratora</p>
        <p className="panel-detail">
          To jest jedyne aktywne konto administratora. Wlasne konto nie jest dostepne do
          zmiany roli ani blokady; przed pracami administracyjnymi dodaj drugiego
          administratora.
        </p>
      </div>
    </div>
  );
}
