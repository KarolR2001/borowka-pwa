import { Ban, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatKilograms, formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import {
  SALE_CANCELLATION_REASON_MAX_LENGTH,
  SALE_CANCELLATION_REASON_MIN_LENGTH,
  calculateSaleCancellationImpact,
  type CancelSaleInput,
  type ListSaleCancellationCandidatesInput,
  type SaleCancellationCandidate,
  type SaleCancellationResult
} from "./saleCancellation";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SaleCancellationSectionApi = {
  cancelSale: (
    env: FirebaseEnv,
    input: CancelSaleInput
  ) => Promise<SaleCancellationResult>;
  listCancellationCandidates: (
    env: FirebaseEnv,
    input: ListSaleCancellationCandidatesInput
  ) => Promise<SaleCancellationCandidate[]>;
};

type CandidateState =
  | { candidates: SaleCancellationCandidate[]; status: "LOADING" }
  | { candidates: SaleCancellationCandidate[]; status: "READY" }
  | { candidates: SaleCancellationCandidate[]; message: string; status: "ERROR" };

export function SaleCancellationSection({
  actorProfile,
  api,
  deviceId,
  env,
  isOnline,
  onConfirmed
}: {
  actorProfile: UserProfile;
  api: SaleCancellationSectionApi;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  onConfirmed: (result: SaleCancellationResult) => void;
}) {
  const [candidateState, setCandidateState] = useState<CandidateState>({
    candidates: [],
    status: "LOADING"
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaleCancellationResult | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!isOnline) {
      setCandidateState({
        candidates: [],
        message: "Anulowanie operacji sprzedazy wymaga polaczenia z internetem.",
        status: "ERROR"
      });
      return undefined;
    }

    setCandidateState((current) => ({
      candidates: current.candidates,
      status: "LOADING"
    }));
    void api
      .listCancellationCandidates(env, { actorProfile, isOnline })
      .then((candidates) => {
        if (isMounted) {
          setCandidateState({ candidates, status: "READY" });
          setSelectedSaleId((current) =>
            candidates.some(({ sale }) => sale.id === current) ? current : ""
          );
        }
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setCandidateState((current) => ({
            candidates: current.candidates,
            message:
              caughtError instanceof Error
                ? caughtError.message
                : "Nie udalo sie pobrac aktywnych operacji sprzedazy.",
            status: "ERROR"
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [actorProfile, api, env, isOnline, reloadKey]);

  const selectedCandidate = useMemo(
    () =>
      candidateState.candidates.find(({ sale }) => sale.id === selectedSaleId) ?? null,
    [candidateState.candidates, selectedSaleId]
  );
  const impact = selectedCandidate
    ? calculateSaleCancellationImpact(selectedCandidate.sale)
    : null;
  const normalizedReason = reason.trim();
  const reasonIsValid =
    normalizedReason.length >= SALE_CANCELLATION_REASON_MIN_LENGTH &&
    normalizedReason.length <= SALE_CANCELLATION_REASON_MAX_LENGTH;

  async function handleCancel(): Promise<void> {
    if (!selectedCandidate || !confirmed || !reasonIsValid || !isOnline || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setResult(null);

    try {
      const cancellationResult = await api.cancelSale(env, {
        actorProfile,
        confirmed,
        deviceId,
        isOnline,
        reason,
        saleId: selectedCandidate.sale.id
      });
      setResult(cancellationResult);
      setSelectedSaleId("");
      setReason("");
      setConfirmed(false);
      setReloadKey((current) => current + 1);
      onConfirmed(cancellationResult);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie anulowac operacji sprzedazy."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="sale-cancellation-section">
      <div className="sale-cancellation-section__header">
        <div>
          <h3>Anulowanie aktywnej operacji</h3>
          <p>
            Dokument nie zostanie usuniety. Anulowanie odwraca jego wplyw na stan i
            przychod.
          </p>
        </div>
        <button
          className="secondary-button icon-button"
          disabled={!isOnline || candidateState.status === "LOADING" || isSaving}
          onClick={() => {
            setError(null);
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez aktywne operacje"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
          <span className="sr-only">Odswiez aktywne operacje</span>
        </button>
      </div>

      {candidateState.status === "LOADING" && candidateState.candidates.length === 0 ? (
        <p className="empty-state">Pobieranie aktywnych operacji z serwera.</p>
      ) : null}
      {candidateState.status === "ERROR" ? (
        <p className="form-message form-message--error" role="alert">
          {candidateState.message}
        </p>
      ) : null}
      {candidateState.status === "READY" && candidateState.candidates.length === 0 ? (
        <p className="empty-state">Brak aktywnych operacji do anulowania.</p>
      ) : null}

      {candidateState.candidates.length > 0 ? (
        <fieldset className="sale-cancellation-list">
          <legend>Wybierz operacje</legend>
          {candidateState.candidates.map((candidate) => {
            const { sale } = candidate;

            return (
              <label key={sale.id}>
                <input
                  checked={selectedSaleId === sale.id}
                  disabled={isSaving}
                  name="sale-cancellation-candidate"
                  onChange={() => {
                    setSelectedSaleId(sale.id);
                    setConfirmed(false);
                    setError(null);
                    setResult(null);
                  }}
                  type="radio"
                  value={sale.id}
                />
                <span>
                  <strong>
                    {sale.entryType === "SALE" ? "Sprzedaz" : "Korekta"} ·{" "}
                    {sale.businessDate}
                  </strong>
                  <span>
                    {candidate.seasonName} · {formatKilograms(sale.weightG)} ·{" "}
                    {formatMoney(sale.totalGrosz)}
                  </span>
                  {sale.note ? <span>{sale.note}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {selectedCandidate && impact ? (
        <section
          className="sale-stock-confirmation"
          aria-labelledby="sale-cancellation-confirmation-title"
        >
          <div className="sale-stock-confirmation__notice">
            <TriangleAlert aria-hidden="true" size={20} />
            <div>
              <h3 id="sale-cancellation-confirmation-title">
                Potwierdz skutki anulowania
              </h3>
              <p>
                Aby poprawic dane, anuluj bledna operacje, a nastepnie dodaj nowa poprawna
                operacje.
              </p>
            </div>
          </div>
          <dl className="sale-stock-confirmation__summary">
            <CancellationValue
              label="Typ"
              value={selectedCandidate.sale.entryType === "SALE" ? "Sprzedaz" : "Korekta"}
            />
            <CancellationValue
              label="Masa dokumentu"
              value={formatKilograms(selectedCandidate.sale.weightG)}
            />
            <CancellationValue
              label="Wplyw na stan"
              value={formatSignedKilograms(impact.stockImpactG)}
            />
            <CancellationValue
              label="Wplyw na przychod"
              value={formatSignedMoney(impact.revenueImpactGrosz)}
            />
          </dl>
          <label className="form-field">
            <span>Powod anulowania</span>
            <textarea
              aria-label="Powod anulowania"
              disabled={isSaving}
              maxLength={SALE_CANCELLATION_REASON_MAX_LENGTH}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirmed(false);
                setError(null);
              }}
              rows={3}
              value={reason}
            />
            <small>
              {String(normalizedReason.length)}/
              {String(SALE_CANCELLATION_REASON_MAX_LENGTH)}
            </small>
          </label>
          <label className="sale-correction-confirmation__acceptance">
            <input
              checked={confirmed}
              disabled={isSaving || !reasonIsValid}
              onChange={(event) => {
                setConfirmed(event.target.checked);
              }}
              type="checkbox"
            />
            Potwierdzam anulowanie, jego wplyw na stan i przychod oraz podany powod.
          </label>
          <div className="sale-stock-confirmation__actions">
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={() => {
                setSelectedSaleId("");
                setReason("");
                setConfirmed(false);
                setError(null);
              }}
              type="button"
            >
              Wroc do wyboru
            </button>
            <button
              className="danger-button"
              disabled={!confirmed || !reasonIsValid || isSaving}
              onClick={() => {
                void handleCancel();
              }}
              type="button"
            >
              <Ban aria-hidden="true" size={18} />
              {isSaving ? "Anulowanie..." : "Anuluj operacje"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="sale-confirmed sale-confirmed--ok" role="status">
          <CheckCircle2 aria-hidden="true" size={20} />
          <div>
            <strong>{result.message}</strong>
            <span>
              Stan po anulowaniu: {formatKilograms(result.postWriteAvailableWeightG)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CancellationValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatSignedKilograms(value: number): string {
  return `${value > 0 ? "+" : ""}${formatKilograms(value)}`;
}

function formatSignedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}
