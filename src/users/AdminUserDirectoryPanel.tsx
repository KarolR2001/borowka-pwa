import { Search, ShieldAlert, UserCheck, UserCog, UsersRound, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { InfoHint } from "../ui/InfoHint";
import {
  defaultWorkerDirectoryApi,
  type WorkerDirectoryApi
} from "../workers/WorkerDirectoryPanel";
import type { WorkerDirectoryListItem } from "../workers/workerDirectory";
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
  message: "Lista nie została jeszcze pobrana."
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
  userDirectoryApi = defaultUserDirectoryApi,
  workerDirectoryApi = defaultWorkerDirectoryApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  userDirectoryApi?: UserDirectoryApi;
  workerDirectoryApi?: WorkerDirectoryApi;
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
  const [workers, setWorkers] = useState<WorkerDirectoryListItem[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersError, setWorkersError] = useState(false);
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
      message: "Pobieranie użytkowników."
    }));

    void userDirectoryApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setDirectoryState({
            status: "READY",
            result,
            message: "Lista użytkowników jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setDirectoryState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udało się pobrać listy użytkowników."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, userDirectoryApi]);

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setWorkers([]);
      return undefined;
    }

    setWorkersLoading(true);
    setWorkersError(false);

    void workerDirectoryApi
      .list(env, { viewerRole: "ADMIN" })
      .then((result) => {
        if (isMounted) {
          setWorkers(result.workers);
        }
      })
      .catch(() => {
        if (isMounted) {
          setWorkers([]);
          setWorkersError(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setWorkersLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, workerDirectoryApi]);

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
      setRoleChangeError("Potwierdź zmianę roli i powiązania.");
      return;
    }

    if (!navigator.onLine) {
      setRoleChangeError("Zmiana roli wymaga połączenia online.");
      return;
    }

    const updateRoleAndWorker =
      userDirectoryApi.updateRoleAndWorker ?? defaultUserDirectoryApi.updateRoleAndWorker;

    if (!updateRoleAndWorker) {
      setRoleChangeError("Operacja zmiany profilu nie jest dostępna.");
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
        message: "Lista użytkowników jest aktualna."
      });
      setRoleChangeFeedback("Zmieniono rolę lub powiązanie profilu.");
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
      setAccountStatusError("Potwierdź zmiane statusu konta.");
      return;
    }

    if (!navigator.onLine) {
      setAccountStatusError("Zmiana statusu wymaga połączenia online.");
      return;
    }

    const updateActivation =
      userDirectoryApi.updateActivation ?? defaultUserDirectoryApi.updateActivation;

    if (!updateActivation) {
      setAccountStatusError("Operacja zmiany statusu nie jest dostępna.");
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
        message: "Lista użytkowników jest aktualna."
      });
      setAccountStatusFeedback(
        accountStatusDraft.action === "BLOCK"
          ? "Zablokowano konto użytkownika."
          : "Reaktywowano konto użytkownika."
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
      <section className="user-directory" aria-label="Użytkownicy">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj się jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="user-directory" aria-label="Użytkownicy">
        <AccessNotice
          title="Brak dostępu"
          message="Lista użytkowników jest dostępna tylko dla administratora."
        />
      </section>
    );
  }

  return (
    <section className="user-directory" aria-label="Użytkownicy">
      {directoryState.result ? (
        <div className="screen-actions" aria-label="Akcje kont">
          {isLastActiveAdmin ? <LastAdminProtectionNotice /> : null}
          <CollapsibleSection
            icon={<UserCog aria-hidden="true" size={18} strokeWidth={2.2} />}
            label="Zmień rolę lub powiązanie"
          >
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
              workers={workers}
              workersError={workersError}
              workersLoading={workersLoading}
            />
          </CollapsibleSection>
          <CollapsibleSection
            icon={<UserX aria-hidden="true" size={18} strokeWidth={2.2} />}
            label="Zablokuj lub przywróć konto"
          >
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
              workers={workers}
              workersError={workersError}
              workersLoading={workersLoading}
            />
          </CollapsibleSection>
        </div>
      ) : null}

      <CollapsibleFilters>
        <DirectoryFilters filters={filters} onChange={setFilters} />
      </CollapsibleFilters>

      <div className="directory-summary" aria-label="Podsumowanie użytkowników">
        <DirectoryStat
          label="Wszystkie profile"
          value={String(directoryState.result?.profiles.length ?? 0)}
        />
      </div>

      {directoryState.status === "ERROR" ? (
        <p className="form-message form-message--error">{directoryState.message}</p>
      ) : null}

      {directoryState.status === "LOADING" && !directoryState.result ? (
        <p className="empty-state">Pobieranie użytkowników.</p>
      ) : null}

      {directoryState.result && filteredProfiles.length === 0 ? (
        <p className="empty-state">Brak użytkowników dla wybranych filtrów.</p>
      ) : null}

      {filteredProfiles.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table mobile-card-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">E-mail</th>
                <th scope="col">Rola</th>
                <th scope="col">Status</th>
                <th scope="col">Aktywne</th>
                <th scope="col">Powiązany zbieracz</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => (
                <tr key={profile.uid}>
                  <td data-label="Nazwa">{profile.displayName}</td>
                  <td data-label="E-mail">{profile.email}</td>
                  <td data-label="Rola">{userRoleLabel(profile.role)}</td>
                  <td data-label="Status">
                    {registrationStatusLabel(profile.registrationStatus)}
                  </td>
                  <td data-label="Aktywne">{profile.active ? "Tak" : "Nie"}</td>
                  <td data-label="Powiązany zbieracz">
                    {workerNameForProfile(workers, profile)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function workerNameForProfile(
  workers: WorkerDirectoryListItem[],
  profile: UserProfile
): string {
  if (!profile.workerId) {
    return "Nie powiązano";
  }

  return (
    workers.find((worker) => worker.id === profile.workerId)?.displayName ??
    "Powiązany zbieracz"
  );
}

function WorkerOptions({
  currentWorkerId,
  targetUid,
  workers,
  workersError,
  workersLoading
}: {
  currentWorkerId: string;
  targetUid: string;
  workers: WorkerDirectoryListItem[];
  workersError: boolean;
  workersLoading: boolean;
}) {
  const selectableWorkers = workers
    .filter(
      (worker) =>
        (worker.active && worker.linkedUser === null) ||
        worker.id === currentWorkerId ||
        worker.linkedUser?.uid === targetUid
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "pl"));

  return (
    <>
      <option value="">
        {workersLoading
          ? "Pobieranie zbieraczy..."
          : workersError
            ? "Nie udało się pobrać zbieraczy"
            : "Nie powiązano"}
      </option>
      {selectableWorkers.map((worker) => (
        <option key={worker.id} value={worker.id}>
          {worker.displayName}
          {worker.active ? "" : " (archiwalny)"}
        </option>
      ))}
    </>
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
    <div className="directory-filters" aria-label="Filtry użytkowników">
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
  profiles,
  workers,
  workersError,
  workersLoading
}: {
  draft: RoleChangeDraft;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
  onChange: (draft: RoleChangeDraft) => void;
  onSubmit: () => void;
  profiles: UserProfile[];
  workers: WorkerDirectoryListItem[];
  workersError: boolean;
  workersLoading: boolean;
}) {
  return (
    <form
      aria-label="Zmiana roli i powiązania"
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
        <span className="field__label">
          Powiązany zbieracz
          <InfoHint text="Wybierz zbieracza, którego zbiory i rozliczenia ma widzieć to konto. Dla roli Zbieracz wybór jest wymagany." />
        </span>
        <select
          aria-label="Powiązany zbieracz"
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              targetWorkerId: event.target.value,
              confirmed: false
            });
          }}
          value={draft.targetWorkerId}
        >
          <WorkerOptions
            currentWorkerId={draft.targetWorkerId}
            targetUid={draft.targetUid}
            workers={workers}
            workersError={workersError}
            workersLoading={workersLoading}
          />
        </select>
      </label>

      <label className="field">
        <span>Powód zmiany roli</span>
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
  profiles,
  workers,
  workersError,
  workersLoading
}: {
  draft: AccountStatusDraft;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
  onChange: (draft: AccountStatusDraft) => void;
  onSubmit: () => void;
  profiles: UserProfile[];
  workers: WorkerDirectoryListItem[];
  workersError: boolean;
  workersLoading: boolean;
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
        <span className="field__label">
          Zbieracz po reaktywacji
          <InfoHint text="Wybierz zbieracza, którego dane będzie widzieć reaktywowane konto. Wymagane dla roli Zbieracz." />
        </span>
        <select
          aria-label="Zbieracz po reaktywacji"
          disabled={isSubmitting || !isReactivation}
          onChange={(event) => {
            onChange({
              ...draft,
              targetWorkerId: event.target.value,
              confirmed: false
            });
          }}
          value={draft.targetWorkerId}
        >
          <WorkerOptions
            currentWorkerId={draft.targetWorkerId}
            targetUid={draft.targetUid}
            workers={workers}
            workersError={workersError}
            workersLoading={workersLoading}
          />
        </select>
      </label>

      <label className="field">
        <span>Powód zmiany statusu</span>
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
        urządzeniach.
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

  return "Nie udało się zapisać zmiany profilu.";
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
          To jest jedyne aktywne konto administratora. Własne konto nie jest dostępne do
          zmiany roli ani blokady; przed pracami administracyjnymi dodaj drugiego
          administratora.
        </p>
      </div>
    </div>
  );
}
