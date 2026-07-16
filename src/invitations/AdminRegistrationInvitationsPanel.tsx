import { Ban, RefreshCw, Search, ShieldAlert, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import type { AuthSessionState } from "../auth/authSession";
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
  message: "Lista zaproszen nie zostala jeszcze pobrana."
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
  registrationInvitationsApi = defaultRegistrationInvitationsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  registrationInvitationsApi?: RegistrationInvitationsApi;
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
      message: "Pobieranie zaproszen."
    }));

    void registrationInvitationsApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setInvitationsState({
            status: "READY",
            result,
            message: "Lista zaproszen jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setInvitationsState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac listy zaproszen."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, registrationInvitationsApi, reloadToken]);

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

  if (authState.status !== "READY") {
    return (
      <section
        className="user-directory registration-invitations"
        aria-label="Zaproszenia"
      >
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator."
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
          title="Brak dostepu"
          message="Zaproszenia sa dostepne tylko dla administratora."
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
          <span>Odswiez</span>
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
          <span>workerId</span>
          <input
            disabled={formState.targetRole !== "PICKER" || isMutating}
            onChange={(event) => {
              setFormState((current) => ({
                ...current,
                workerId: event.target.value
              }));
            }}
            type="text"
            value={formState.workerId}
          />
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

      <InvitationFilters filters={filters} onChange={setFilters} />

      <div className="directory-summary" aria-label="Podsumowanie zaproszen">
        <DirectoryStat
          label="Wszystkie zaproszenia"
          value={String(invitationsState.result?.invitations.length ?? 0)}
        />
        <DirectoryStat label="Oczekujace" value={String(pendingCount)} />
        <DirectoryStat
          label="Bledne dokumenty"
          value={String(invitationsState.result?.invalidInvitations.length ?? 0)}
        />
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {invitationsState.status === "ERROR" ? (
        <p className="form-message form-message--error">{invitationsState.message}</p>
      ) : null}

      {invitationsState.status === "LOADING" && !invitationsState.result ? (
        <p className="empty-state">Pobieranie zaproszen.</p>
      ) : null}

      {invitationsState.result && filteredInvitations.length === 0 ? (
        <p className="empty-state">Brak zaproszen dla wybranych filtrow.</p>
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
                <th scope="col">workerId</th>
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
                  <td>{invitation.workerId ?? "brak"}</td>
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
        <div className="invalid-profiles" aria-label="Bledne zaproszenia">
          <div className="access-notice__icon">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">Bledne dokumenty</p>
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
    <div className="directory-filters invitation-filters" aria-label="Filtry zaproszen">
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
    return "Podaj nazwe zapraszanego uzytkownika.";
  }

  if (formState.targetRole === "PICKER" && !formState.workerId.trim()) {
    return "Zaproszenie dla zbieracza wymaga workerId.";
  }

  return null;
}

function getInvitationActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Operacja na zaproszeniu nie powiodla sie.";
}
