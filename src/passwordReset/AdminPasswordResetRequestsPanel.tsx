import { KeyRound, LockKeyhole, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { userRoleLabel } from "../domain/identity";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { RecordDialog } from "../ui/RecordDialog";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  completePasswordResetRequest,
  getAdminPasswordResetErrorMessage,
  listPasswordResetRequests,
  type CompletePasswordResetInput,
  type PasswordResetRequest,
  type PasswordResetRequestsResult
} from "./passwordResetRequests";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PasswordResetRequestsApi = {
  list: (
    env: FirebaseEnv,
    input: { actorProfile: CompletePasswordResetInput["actorProfile"] }
  ) => Promise<PasswordResetRequestsResult>;
  complete: (env: FirebaseEnv, input: CompletePasswordResetInput) => Promise<void>;
};

export const defaultPasswordResetRequestsApi: PasswordResetRequestsApi = {
  complete: completePasswordResetRequest,
  list: listPasswordResetRequests
};

type RequestState =
  | {
      status: "LOADING";
      result: PasswordResetRequestsResult | null;
      error: string | null;
    }
  | { status: "READY"; result: PasswordResetRequestsResult; error: string | null }
  | { status: "ERROR"; result: PasswordResetRequestsResult | null; error: string };

const initialRequestState: RequestState = {
  error: null,
  result: null,
  status: "LOADING"
};

export function AdminPasswordResetRequestsPanel({
  api = defaultPasswordResetRequestsApi,
  authState,
  env,
  isOnline
}: {
  api?: PasswordResetRequestsApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
}) {
  const [state, setState] = useState<RequestState>(initialRequestState);
  const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null>(
    null
  );
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  const loadRequests = async () => {
    if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
      setState(initialRequestState);
      return;
    }

    setState((current) => ({
      error: null,
      result: current.result,
      status: "LOADING"
    }));

    try {
      const result = await api.list(env, { actorProfile: authState.profile });
      setState({ error: null, result, status: "READY" });
    } catch (error) {
      setState((current) => ({
        error: getAdminPasswordResetErrorMessage(error),
        result: current.result,
        status: "ERROR"
      }));
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [api, authState, env, isAdmin]);

  const pendingRequests = useMemo(
    () => state.result?.requests.filter((request) => request.status === "PENDING") ?? [],
    [state.result]
  );

  const closeDialog = () => {
    if (isSubmitting) return;
    setSelectedRequest(null);
    setNewPassword("");
    setPasswordConfirmation("");
    setDialogError(null);
  };

  const openRequest = (request: PasswordResetRequest) => {
    setSelectedRequest(request);
    setNewPassword("");
    setPasswordConfirmation("");
    setDialogError(null);
  };

  const submitNewPassword = async () => {
    if (!selectedRequest || authState.status !== "READY") return;

    if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      setDialogError(
        `Hasło musi mieć co najmniej ${String(ADMIN_PASSWORD_MIN_LENGTH)} znaków.`
      );
      return;
    }

    if (newPassword !== passwordConfirmation) {
      setDialogError("Hasła muszą być takie same.");
      return;
    }

    setIsSubmitting(true);
    setDialogError(null);
    setFeedback(null);

    try {
      await api.complete(env, {
        actorProfile: authState.profile,
        newPassword,
        requestId: selectedRequest.id
      });
      closeDialogAfterSubmit();
      setFeedback("Nowe hasło zostało nadane.");
      await loadRequests();
    } catch (error) {
      setDialogError(getAdminPasswordResetErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialogAfterSubmit = () => {
    setSelectedRequest(null);
    setNewPassword("");
    setPasswordConfirmation("");
    setDialogError(null);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="password-reset-requests" aria-label="Prośby o zmianę hasła">
      <CollapsibleSection
        icon={<KeyRound aria-hidden="true" size={18} strokeWidth={2.2} />}
        label={`Prośby o zmianę hasła (${String(pendingRequests.length)})`}
        open={pendingRequests.length > 0}
      >
        {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
        {state.error ? (
          <p className="form-message form-message--error">{state.error}</p>
        ) : null}
        {state.status === "LOADING" && !state.result ? (
          <p className="empty-state">Pobieranie próśb.</p>
        ) : null}
        {state.result && pendingRequests.length === 0 ? (
          <p className="empty-state">Brak oczekujących próśb o zmianę hasła.</p>
        ) : null}
        {pendingRequests.length > 0 ? (
          <ul className="password-reset-requests__list">
            {pendingRequests.map((request) => (
              <li key={request.id}>
                <div>
                  <strong>{request.displayName}</strong>
                  <span>{request.email}</span>
                  <span>{userRoleLabel(request.role)}</span>
                </div>
                <button
                  className="secondary-action"
                  disabled={!isOnline}
                  onClick={() => {
                    openRequest(request);
                  }}
                  type="button"
                >
                  <LockKeyhole aria-hidden="true" size={16} strokeWidth={2.2} />
                  <span>Nadaj hasło</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleSection>

      {selectedRequest ? (
        <RecordDialog fullScreen label="Nadaj nowe hasło" onClose={closeDialog}>
          <form
            className="fullscreen-operation password-reset-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void submitNewPassword();
            }}
          >
            <div className="fullscreen-operation__header">
              <div>
                <p className="eyebrow">Konto użytkownika</p>
                <h2>Nadaj nowe hasło</h2>
              </div>
              <button
                aria-label="Zamknij"
                className="icon-button"
                disabled={isSubmitting}
                onClick={closeDialog}
                title="Zamknij"
                type="button"
              >
                <X aria-hidden="true" size={20} strokeWidth={2.2} />
              </button>
            </div>

            <div className="password-reset-dialog__account">
              <strong>{selectedRequest.displayName}</strong>
              <span>{selectedRequest.email}</span>
              <span>{userRoleLabel(selectedRequest.role)}</span>
            </div>

            <label className="field">
              <span>Nowe hasło</span>
              <input
                autoComplete="new-password"
                disabled={isSubmitting || !isOnline}
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setDialogError(null);
                }}
                type="password"
                value={newPassword}
              />
            </label>

            <label className="field">
              <span>Powtórz nowe hasło</span>
              <input
                autoComplete="new-password"
                disabled={isSubmitting || !isOnline}
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  setDialogError(null);
                }}
                type="password"
                value={passwordConfirmation}
              />
            </label>

            <p className="panel-detail">
              Ustal hasło o długości co najmniej {String(ADMIN_PASSWORD_MIN_LENGTH)}{" "}
              znaków i przekaż je użytkownikowi bezpiecznym kanałem.
            </p>

            {dialogError ? (
              <p className="form-message form-message--error">{dialogError}</p>
            ) : null}

            <div className="form-actions">
              <button
                className="primary-action"
                disabled={isSubmitting || !isOnline}
                type="submit"
              >
                <LockKeyhole aria-hidden="true" size={18} strokeWidth={2.2} />
                <span>{isSubmitting ? "Zapisywanie..." : "Nadaj nowe hasło"}</span>
              </button>
              <button
                className="secondary-action"
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                Anuluj
              </button>
            </div>
          </form>
        </RecordDialog>
      ) : null}
    </section>
  );
}
