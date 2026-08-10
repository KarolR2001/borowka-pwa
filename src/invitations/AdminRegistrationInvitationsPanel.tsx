import { Ban, RefreshCw, Search, ShieldAlert, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { InfoHint } from "../ui/InfoHint";
import {
  defaultWorkerDirectoryApi,
  type WorkerDirectoryApi
} from "../workers/WorkerDirectoryPanel";
import type { WorkerDirectoryListItem } from "../workers/workerDirectory";
import {
  INVITATION_STATUSES,
  USER_ROLES,
  invitationStatusLabel,
  userRoleLabel,
  type UserRole
} from "../domain/identity";
import {
  canCancelRegistrationInvitation,
  createRegistrationInvitation,
  defaultRegistrationInvitationFilters,
  filterRegistrationInvitations,
  isRegistrationInvitationRoleFilter,
  isRegistrationInvitationStatusFilter,
  listRegistrationInvitations,
  cancelRegistrationInvitation,
  type CreateRegistrationInvitationInput,
  type RegistrationInvitationDirectoryResult,
  type RegistrationInvitationDocument,
  type RegistrationInvitationFilters
} from "./registrationInvitations";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type RegistrationInvitationsApi = {
  list: (env: FirebaseEnv) => Promise<RegistrationInvitationDirectoryResult>;
  create: (
    env: FirebaseEnv,
    input: CreateRegistrationInvitationInput
  ) => Promise<RegistrationInvitationDocument>;
  cancel: (env: FirebaseEnv, invitationId: string) => Promise<void>;
};

export const defaultRegistrationInvitationsApi: RegistrationInvitationsApi = {
  list: listRegistrationInvitations,
  create: createRegistrationInvitation,
  cancel: cancelRegistrationInvitation
};

type InvitationsState =
  | {
      status: "IDLE" | "LOADING";
      result: RegistrationInvitationDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: RegistrationInvitationDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: RegistrationInvitationDirectoryResult | null;
      message: string;
    };

type InvitationFormState = {
  email: string;
  displayName: string;
  targetRole: UserRole;
  workerId: string;
};

const initialInvitationsState: InvitationsState = {
  status: "IDLE",
  result: null,
  message: "Lista zaproszeń nie została jeszcze pobrana."
};

const initialInvitationFormState: InvitationFormState = {
  email: "",
  displayName: "",
  targetRole: "OPERATOR",
  workerId: ""
};

export function AdminRegistrationInvitationsPanel({
  authState,
  env,
  registrationInvitationsApi = defaultRegistrationInvitationsApi,
  workerDirectoryApi = defaultWorkerDirectoryApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  registrationInvitationsApi?: RegistrationInvitationsApi;
  workerDirectoryApi?: WorkerDirectoryApi;
}) {
  const [filters, setFilters] = useState<RegistrationInvitationFilters>(
    defaultRegistrationInvitationFilters
  );
  const [formState, setFormState] = useState<InvitationFormState>(
    initialInvitationFormState
  );
  const [invitationsState, setInvitationsState] = useState<InvitationsState>(
    initialInvitationsState
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [isMutating, setIsMutating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerDirectoryListItem[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersError, setWorkersError] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setInvitationsState(initialInvitationsState);
      return undefined;
    }

    setInvitationsState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie zaproszeń."
    }));

    void registrationInvitationsApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setInvitationsState({
            status: "READY",
            result,
            message: "Lista zaproszeń jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setInvitationsState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udało się pobrać listy zaproszeń."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, registrationInvitationsApi, reloadToken]);

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
  }, [env, isAdmin, reloadToken, workerDirectoryApi]);

  const filteredInvitations = useMemo(
    () =>
      invitationsState.result
        ? filterRegistrationInvitations(invitationsState.result.invitations, filters)
        : [],
    [invitationsState.result, filters]
  );
  const pendingCount =
    invitationsState.result?.invitations.filter(
      (invitation) => invitation.status === "PENDING"
    ).length ?? 0;
  const unavailableWorkerIds = new Set(
    invitationsState.result?.invitations
      .filter((invitation) => invitation.status === "PENDING" && invitation.workerId)
      .flatMap((invitation) =>
        invitation.workerId === null ? [] : [invitation.workerId]
      ) ?? []
  );
  const availableWorkers = workers
    .filter(
      (worker) =>
        worker.active &&
        worker.linkedUser === null &&
        !unavailableWorkerIds.has(worker.id)
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "pl"));

  if (authState.status !== "READY") {
    return (
      <section
        className="user-directory registration-invitations"
        aria-label="Zaproszenia"
      >
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj się jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section
        className="user-directory registration-invitations"
        aria-label="Zaproszenia"
      >
        <AccessNotice
          title="Brak dostępu"
          message="Zaproszenia są dostępne tylko dla administratora."
        />
      </section>
    );
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    const validationError = validateInvitationForm(formState);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsMutating(true);

    try {
      const invitation = await registrationInvitationsApi.create(env, {
        email: formState.email,
        displayName: formState.displayName,
        targetRole: formState.targetRole,
        workerId: formState.targetRole === "PICKER" ? formState.workerId : null,
        createdBy: authState.profile.uid
      });

      setFormState(initialInvitationFormState);
      setFeedback(`Dodano zaproszenie dla ${invitation.emailNormalized}.`);
      setReloadToken((current) => current + 1);
    } catch (submitError: unknown) {
      setError(getInvitationActionErrorMessage(submitError));
    } finally {
      setIsMutating(false);
    }
  };

  const handleCancel = async (invitation: RegistrationInvitationDocument) => {
    setFeedback(null);
    setError(null);
    setIsMutating(true);

    try {
      await registrationInvitationsApi.cancel(env, invitation.id);
      setFeedback(`Anulowano zaproszenie dla ${invitation.emailNormalized}.`);
      setReloadToken((current) => current + 1);
    } catch (cancelError: unknown) {
      setError(getInvitationActionErrorMessage(cancelError));
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <section className="user-directory registration-invitations" aria-label="Zaproszenia">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Zaproszenia</p>
          <h2>Prerejestracja kont</h2>
          <p className="panel-detail">{invitationsState.message}</p>
        </div>
        <button
          className="secondary-action"
          disabled={invitationsState.status === "LOADING" || isMutating}
          onClick={() => {
            setReloadToken((current) => current + 1);
          }}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Odśwież</span>
        </button>
      </div>

      <form
        aria-label="Nowe zaproszenie"
        className="invitation-form"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="field">
          <span>E-mail</span>
          <input
            autoComplete="email"
            disabled={isMutating}
            inputMode="email"
            onChange={(event) => {
              setFormState((current) => ({
                ...current,
                email: event.target.value
              }));
            }}
            type="email"
            value={formState.email}
          />
        </label>

        <label className="field">
          <span>Nazwa</span>
          <input
            autoComplete="name"
            disabled={isMutating}
            onChange={(event) => {
              setFormState((current) => ({
                ...current,
                displayName: event.target.value
              }));
            }}
            type="text"
            value={formState.displayName}
          />
        </label>

        <label className="field">
          <span>Rola docelowa</span>
          <select
            disabled={isMutating}
            onChange={(event) => {
              const nextRole = event.target.value;

              if (isRegistrationInvitationRoleFilter(nextRole) && nextRole !== "ALL") {
                setFormState((current) => ({
                  ...current,
                  targetRole: nextRole,
                  workerId: nextRole === "PICKER" ? current.workerId : ""
                }));
              }
            }}
            value={formState.targetRole}
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
            Zbieracz
            <InfoHint text="Wybierz osobę utworzoną wcześniej w zakładce Zbieracze. Konto zostanie automatycznie powiązane z jej zbiorami i rozliczeniami." />
          </span>
          <select
            aria-label="Zbieracz dla konta"
            disabled={formState.targetRole !== "PICKER" || isMutating}
            onChange={(event) => {
              setFormState((current) => ({
                ...current,
                workerId: event.target.value
              }));
            }}
            value={formState.workerId}
          >
            <option value="">
              {workersLoading
                ? "Pobieranie zbieraczy..."
                : workersError
                  ? "Nie udało się pobrać zbieraczy"
                  : availableWorkers.length === 0
                    ? "Brak dostępnych zbieraczy"
                    : "Wybierz zbieracza"}
            </option>
            {availableWorkers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.displayName}
              </option>
            ))}
          </select>
        </label>

        <button
          className="primary-action invitation-form__submit"
          disabled={isMutating}
          type="submit"
        >
          <UserPlus aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Dodaj</span>
        </button>
      </form>

      <CollapsibleFilters>
        <InvitationFilters filters={filters} onChange={setFilters} />
      </CollapsibleFilters>

      <div className="directory-summary" aria-label="Podsumowanie zaproszeń">
        <DirectoryStat
          label="Wszystkie zaproszenia"
          value={String(invitationsState.result?.invitations.length ?? 0)}
        />
        <DirectoryStat label="Oczekujace" value={String(pendingCount)} />
        <DirectoryStat
          label="Błędne dokumenty"
          value={String(invitationsState.result?.invalidInvitations.length ?? 0)}
        />
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {invitationsState.status === "ERROR" ? (
        <p className="form-message form-message--error">{invitationsState.message}</p>
      ) : null}

      {invitationsState.status === "LOADING" && !invitationsState.result ? (
        <p className="empty-state">Pobieranie zaproszeń.</p>
      ) : null}

      {invitationsState.result && filteredInvitations.length === 0 ? (
        <p className="empty-state">Brak zaproszeń dla wybranych filtrów.</p>
      ) : null}

      {filteredInvitations.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">E-mail</th>
                <th scope="col">Rola</th>
                <th scope="col">Status</th>
                <th scope="col">Zbieracz</th>
                <th scope="col">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td>{invitation.displayName}</td>
                  <td>{invitation.emailNormalized}</td>
                  <td>{userRoleLabel(invitation.targetRole)}</td>
                  <td>{invitationStatusLabel(invitation.status)}</td>
                  <td>
                    {invitation.workerId
                      ? (workers.find((worker) => worker.id === invitation.workerId)
                          ?.displayName ?? "Powiązany zbieracz")
                      : "Nie dotyczy"}
                  </td>
                  <td>
                    {canCancelRegistrationInvitation(invitation) ? (
                      <button
                        aria-label={`Anuluj zaproszenie ${invitation.emailNormalized}`}
                        className="secondary-action"
                        disabled={isMutating}
                        onClick={() => {
                          void handleCancel(invitation);
                        }}
                        type="button"
                      >
                        <Ban aria-hidden="true" size={18} strokeWidth={2.2} />
                        <span>Anuluj</span>
                      </button>
                    ) : (
                      "Brak akcji"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {invitationsState.result &&
      invitationsState.result.invalidInvitations.length > 0 ? (
        <div className="invalid-profiles" aria-label="Błędne zaproszenia">
          <div className="access-notice__icon">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">Błędne dokumenty</p>
            <ul>
              {invitationsState.result.invalidInvitations.map((invalidInvitation) => (
                <li key={invalidInvitation.id}>
                  <strong>{invalidInvitation.id}</strong>: {invalidInvitation.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InvitationFilters({
  filters,
  onChange
}: {
  filters: RegistrationInvitationFilters;
  onChange: (filters: RegistrationInvitationFilters) => void;
}) {
  return (
    <div className="directory-filters invitation-filters" aria-label="Filtry zaproszeń">
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

            if (isRegistrationInvitationRoleFilter(nextRole)) {
              onChange({
                ...filters,
                targetRole: nextRole
              });
            }
          }}
          value={filters.targetRole}
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

            if (isRegistrationInvitationStatusFilter(nextStatus)) {
              onChange({
                ...filters,
                status: nextStatus
              });
            }
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie</option>
          {INVITATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {invitationStatusLabel(status)}
            </option>
          ))}
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

function validateInvitationForm(formState: InvitationFormState): string | null {
  if (!formState.email.trim().includes("@")) {
    return "Podaj poprawny e-mail.";
  }

  if (!formState.displayName.trim()) {
    return "Podaj nazwe zapraszanego użytkownika.";
  }

  if (formState.targetRole === "PICKER" && !formState.workerId.trim()) {
    return "Wybierz zbieracza, którego dane ma widzieć właściciel konta.";
  }

  return null;
}

function getInvitationActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Operacja na zaproszeniu nie powiodła się.";
}
