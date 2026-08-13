import { Ban, Banknote, Download, Eye, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { harvestSessionStatusLabel } from "../harvest/harvestSessionState";
import { POLISH_EXCEL_CSV_MIME_TYPE } from "../reports/polishExcelCsv";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { RecordDialog } from "../ui/RecordDialog";
import {
  createAdminPaymentCsv,
  createAdminPaymentCsvFilename,
  defaultPaymentDirectoryFilters,
  filterAdminPayments,
  listAdminPayments,
  summarizeAdminPayments,
  type AdminPaymentDirectoryItem,
  type AdminPaymentDirectoryResult,
  type PaymentDirectoryFilters
} from "./paymentDirectory";
import {
  cancelPayment,
  PAYMENT_CANCELLATION_REASON_MAX_LENGTH,
  type CancelPaymentInput,
  type PaymentCancellationResult
} from "./paymentCancellation";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminPaymentDirectoryApi = {
  cancel: (
    env: FirebaseEnv,
    input: CancelPaymentInput
  ) => Promise<PaymentCancellationResult>;
  downloadCsv: (content: string, filename: string) => void;
  list: (
    env: FirebaseEnv,
    actorProfile: Extract<AuthSessionState, { status: "READY" }>["profile"]
  ) => Promise<AdminPaymentDirectoryResult>;
};

export const defaultAdminPaymentDirectoryApi: AdminPaymentDirectoryApi = {
  cancel: cancelPayment,
  downloadCsv: downloadAdminPaymentCsv,
  list: listAdminPayments
};

type DirectoryState =
  | {
      status: "IDLE" | "LOADING";
      result: AdminPaymentDirectoryResult | null;
    }
  | {
      status: "READY";
      result: AdminPaymentDirectoryResult;
    }
  | {
      status: "ERROR";
      result: AdminPaymentDirectoryResult | null;
    };

const initialState: DirectoryState = {
  status: "IDLE",
  result: null
};

export function AdminPaymentDirectoryPanel({
  adminPaymentDirectoryApi = defaultAdminPaymentDirectoryApi,
  authState,
  deviceId,
  env,
  isOnline,
  onRequestCancellation
}: {
  adminPaymentDirectoryApi?: AdminPaymentDirectoryApi;
  authState: AuthSessionState;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  onRequestCancellation?: (paymentId: string) => void;
}) {
  const [state, setState] = useState<DirectoryState>(initialState);
  const [filters, setFilters] = useState<PaymentDirectoryFilters>(
    defaultPaymentDirectoryFilters
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [cancellationTargetId, setCancellationTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationConfirmed, setCancellationConfirmed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result
    }));
    void adminPaymentDirectoryApi
      .list(env, authState.profile)
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [adminPaymentDirectoryApi, authState, env, isAdmin, reloadKey]);

  const payments = useMemo(() => state.result?.payments ?? [], [state.result]);
  const filteredPayments = useMemo(
    () => filterAdminPayments(payments, filters),
    [filters, payments]
  );
  const summary = useMemo(
    () => summarizeAdminPayments(filteredPayments),
    [filteredPayments]
  );
  const selectedPayment =
    payments.find((payment) => payment.id === selectedPaymentId) ?? null;

  if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
    return (
      <section className="access-notice" aria-label="Historia wypłat">
        <Banknote aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Historia wypłat</p>
          <p>Lista wypłat jest dostępna tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  function exportVisiblePayments(): void {
    try {
      const exportedAtIso = new Date().toISOString();
      adminPaymentDirectoryApi.downloadCsv(
        createAdminPaymentCsv(filteredPayments, exportedAtIso),
        createAdminPaymentCsvFilename(exportedAtIso)
      );
      setExportError(null);
      setFeedback(`Wyeksportowano rekordy: ${String(filteredPayments.length)}.`);
    } catch {
      setFeedback(null);
      setExportError("Nie udało się zapisać pliku CSV.");
    }
  }

  function requestCancellation(paymentId: string): void {
    setCancellationTargetId(paymentId);
    setCancellationReason("");
    setCancellationConfirmed(false);
    onRequestCancellation?.(paymentId);
  }

  async function submitCancellation(): Promise<void> {
    const payment = payments.find((item) => item.id === cancellationTargetId);

    if (!payment?.sourceSession || authState.status !== "READY") {
      setExportError("Odśwież wypłatę i jej sesję źródłową przed anulowaniem.");
      return;
    }

    setIsCancelling(true);
    setExportError(null);
    setFeedback(null);

    try {
      const result = await adminPaymentDirectoryApi.cancel(env, {
        actorProfile: authState.profile,
        confirmed: cancellationConfirmed,
        deviceId,
        expectedSessionRevision: payment.sourceSession.revision,
        isOnline,
        paymentId: payment.id,
        reason: cancellationReason
      });
      setFeedback(result.message);
      setCancellationTargetId(null);
      setSelectedPaymentId(null);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Nie udało się anulować wypłaty."
      );
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <section className="payment-directory" aria-label="Historia wypłat">
      <div className="screen-actions" aria-label="Akcje historii wypłat">
        <div className="payment-directory__header-actions">
          <button
            aria-label="Eksportuj historię wypłat do CSV"
            className="secondary-button icon-button"
            disabled={filteredPayments.length === 0}
            onClick={exportVisiblePayments}
            title="Eksportuj CSV"
            type="button"
          >
            <Download aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <CollapsibleFilters>
        <PaymentDirectoryFilterControls
          filters={filters}
          onChange={setFilters}
          payments={payments}
        />
      </CollapsibleFilters>

      <div className="directory-summary" aria-label="Podsumowanie historii wypłat">
        <DirectoryStat
          label="Suma wypłat"
          value={formatMoney(summary.activeAmountGrosz)}
        />
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {exportError ? (
        <p className="form-message form-message--error">{exportError}</p>
      ) : null}
      {cancellationTargetId ? (
        <form
          className="payment-cancellation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCancellation();
          }}
        >
          <h3>Anulowanie wypłaty</h3>
          <p>
            Wypłata pozostanie w historii jako anulowana, a sesja wróci do zamkniętych i
            ponownie pojawi się na liscie do wypłaty.
          </p>
          <label className="field">
            <span>Powód anulowania</span>
            <textarea
              maxLength={PAYMENT_CANCELLATION_REASON_MAX_LENGTH}
              onChange={(event) => {
                setCancellationReason(event.target.value);
              }}
              required
              value={cancellationReason}
            />
          </label>
          <label className="confirmation-check">
            <input
              checked={cancellationConfirmed}
              onChange={(event) => {
                setCancellationConfirmed(event.target.checked);
              }}
              type="checkbox"
            />
            <span>
              Potwierdzam anulowanie wypłaty{" "}
              {formatMoney(
                payments.find((item) => item.id === cancellationTargetId)?.amountGrosz ??
                  0
              )}{" "}
              dla{" "}
              {payments.find((item) => item.id === cancellationTargetId)?.workerName ??
                "wybranej osoby"}
              .
            </span>
          </label>
          <div className="form-actions">
            <button
              disabled={
                isCancelling ||
                !isOnline ||
                !cancellationConfirmed ||
                cancellationReason.trim().length < 3
              }
              type="submit"
            >
              <Ban aria-hidden="true" size={18} />
              {isCancelling ? "Anulowanie..." : "Anuluj wypłatę"}
            </button>
            <button
              className="secondary-button"
              disabled={isCancelling}
              onClick={() => {
                setCancellationTargetId(null);
              }}
              type="button"
            >
              Zachowaj wypłatę
            </button>
          </div>
        </form>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać aktualnej historii wypłat.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidPaymentCount > 0 ||
        state.result.invalidSessionCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.missingSourceSessionCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagające kontroli: wypłaty {state.result.invalidPaymentCount}, sesje{" "}
          {state.result.invalidSessionCount}, sezony {state.result.invalidSeasonCount},
          brak sesji źródłowej {state.result.missingSourceSessionCount}.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii wypłat.</p>
      ) : null}
      {state.status !== "LOADING" && filteredPayments.length === 0 ? (
        <p className="empty-state">Brak wypłat spełniających filtry.</p>
      ) : null}
      {filteredPayments.length > 0 ? (
        <PaymentDirectoryTable
          onOpen={setSelectedPaymentId}
          payments={filteredPayments}
        />
      ) : null}
      {selectedPayment ? (
        <RecordDialog
          label="Szczegóły wypłaty"
          onClose={() => {
            setSelectedPaymentId(null);
          }}
        >
          <PaymentDirectoryDetails
            onClose={() => {
              setSelectedPaymentId(null);
            }}
            onRequestCancellation={requestCancellation}
            payment={selectedPayment}
          />
        </RecordDialog>
      ) : null}
    </section>
  );
}

function PaymentDirectoryFilterControls({
  filters,
  onChange,
  payments
}: {
  filters: PaymentDirectoryFilters;
  onChange: (filters: PaymentDirectoryFilters) => void;
  payments: readonly AdminPaymentDirectoryItem[];
}) {
  const seasonOptions = uniqueOptions(payments, "seasonId", "seasonName");
  const workerOptions = uniqueOptions(payments, "workerId", "workerName");

  return (
    <div className="payment-directory-filters" aria-label="Filtry historii wypłat">
      <label className="field">
        <span>Sezon</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, seasonId: event.target.value });
          }}
          value={filters.seasonId}
        >
          <option value="">Wszystkie sezony</option>
          {seasonOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Zbieracz</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, workerId: event.target.value });
          }}
          value={filters.workerId}
        >
          <option value="">Wszyscy zbieracze</option>
          {workerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Metoda</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              method: event.target.value as PaymentDirectoryFilters["method"]
            });
          }}
          value={filters.method}
        >
          <option value="ALL">Wszystkie metody</option>
          <option value="CASH">Gotówka</option>
          <option value="BANK_TRANSFER">Przelew bankowy</option>
          <option value="OTHER">Inna</option>
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              status: event.target.value as PaymentDirectoryFilters["status"]
            });
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie statusy</option>
          <option value="ACTIVE">Aktywne</option>
          <option value="CANCELLED">Anulowane</option>
          <option value="IMPORTED">Importowane</option>
        </select>
      </label>
      <DateRangeFields
        fromLabel="Wypłata od"
        fromValue={filters.paidFromDate}
        onFromChange={(paidFromDate) => {
          onChange({ ...filters, paidFromDate });
        }}
        onToChange={(paidToDate) => {
          onChange({ ...filters, paidToDate });
        }}
        toLabel="Wypłata do"
        toValue={filters.paidToDate}
      />
      <DateRangeFields
        fromLabel="Sesja od"
        fromValue={filters.sessionFromDate}
        onFromChange={(sessionFromDate) => {
          onChange({ ...filters, sessionFromDate });
        }}
        onToChange={(sessionToDate) => {
          onChange({ ...filters, sessionToDate });
        }}
        toLabel="Sesja do"
        toValue={filters.sessionToDate}
      />
    </div>
  );
}

function DateRangeFields({
  fromLabel,
  fromValue,
  onFromChange,
  onToChange,
  toLabel,
  toValue
}: {
  fromLabel: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toLabel: string;
  toValue: string;
}) {
  return (
    <>
      <label className="field">
        <span>{fromLabel}</span>
        <input
          onChange={(event) => {
            onFromChange(event.target.value);
          }}
          type="date"
          value={fromValue}
        />
      </label>
      <label className="field">
        <span>{toLabel}</span>
        <input
          onChange={(event) => {
            onToChange(event.target.value);
          }}
          type="date"
          value={toValue}
        />
      </label>
    </>
  );
}

function PaymentDirectoryTable({
  onOpen,
  payments
}: {
  onOpen: (paymentId: string) => void;
  payments: readonly AdminPaymentDirectoryItem[];
}) {
  return (
    <div className="directory-table-wrap">
      <table className="directory-table payment-directory-table mobile-card-table">
        <thead>
          <tr>
            <th scope="col">Data wypłaty</th>
            <th scope="col">Zbieracz</th>
            <th scope="col">Kwota</th>
            <th scope="col">Data sesji</th>
            <th scope="col">Szczegóły</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td data-label="Data wypłaty">
                {formatBusinessDate(payment.paidBusinessDate)}
              </td>
              <td data-label="Zbieracz">
                {payment.workerName}
                <span className="directory-cell-note">{payment.seasonName}</span>
              </td>
              <td data-label="Kwota">{formatMoney(payment.amountGrosz)}</td>
              <td data-label="Data sesji">
                {payment.sourceSession
                  ? formatBusinessDate(payment.sourceSession.businessDate)
                  : "brak"}
              </td>
              <td data-label="Szczegóły">
                <button
                  aria-label={`Otwórz szczegóły wypłaty ${payment.workerName} z ${formatBusinessDate(payment.paidBusinessDate)}`}
                  className="secondary-button icon-button"
                  onClick={() => {
                    onOpen(payment.id);
                  }}
                  title="Otwórz szczegóły wypłaty"
                  type="button"
                >
                  <Eye aria-hidden="true" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentDirectoryDetails({
  onClose,
  onRequestCancellation,
  payment
}: {
  onClose: () => void;
  onRequestCancellation: (paymentId: string) => void;
  payment: AdminPaymentDirectoryItem;
}) {
  return (
    <section
      className="payment-directory-details"
      aria-labelledby="payment-directory-details-title"
    >
      <header className="payment-directory-details__header">
        <div>
          <p className="eyebrow">Szczegóły wypłaty</p>
          <h3 id="payment-directory-details-title">{payment.workerName}</h3>
        </div>
        <button
          className="secondary-button icon-button"
          onClick={onClose}
          title="Zamknij szczegóły"
          type="button"
        >
          <X aria-hidden="true" size={18} />
          <span className="sr-only">Zamknij szczegóły</span>
        </button>
      </header>

      <dl className="payment-directory-details__grid">
        <Detail label="Kwota" value={formatMoney(payment.amountGrosz)} />
        <Detail
          label="Data wypłaty"
          value={formatBusinessDate(payment.paidBusinessDate)}
        />
        <Detail label="Metoda" value={paymentMethodLabel(payment.paymentMethod)} />
        <Detail label="Godzina zapisu" value={formatTimestamp(payment.createdAtIso)} />
        <Detail label="Notatka" value={payment.note ?? "brak"} />
        <Detail label="Status" value={paymentStatusLabel(payment.status)} />
        {payment.status === "CANCELLED" ? (
          <>
            <Detail
              label="Czas anulowania"
              value={formatTimestamp(payment.cancelledAtIso)}
            />
            <Detail
              label="Powód anulowania"
              value={payment.cancellationReason ?? "brak"}
            />
          </>
        ) : null}
      </dl>

      {payment.sourceSession ? (
        <div className="payment-directory-source-session">
          <h4>Sesja źródłowa</h4>
          <dl className="payment-directory-details__grid">
            <Detail
              label="Data sesji"
              value={formatBusinessDate(payment.sourceSession.businessDate)}
            />
            <Detail
              label="Status sesji"
              value={harvestSessionStatusLabel(payment.sourceSession.status)}
            />
            <Detail label="Plan" value={payment.sourceSession.planName} />
            <Detail
              label="Sposób obliczenia"
              value={
                payment.sourceSession.calculationBasis === "WEIGHT"
                  ? "Waga aktywnych wpisów"
                  : "Ilość aktywnych jednostek"
              }
            />
            <Detail
              label="Stawka"
              value={`${formatMoney(payment.sourceSession.rateGrosz)} / ${
                payment.sourceSession.unitLabel
              }`}
            />
            <Detail
              label="Wynik"
              value={`${formatQuantity(
                payment.sourceSession.totalQuantityMilli
              )} ${payment.sourceSession.unitLabel}, ${formatKilograms(
                payment.sourceSession.totalWeightG
              )}`}
            />
            <Detail
              label="Aktywne wpisy"
              value={String(payment.sourceSession.totalEntryCount)}
            />
            <Detail
              label="Czas zamknięcia"
              value={formatTimestamp(payment.sourceSession.closedAtIso)}
            />
          </dl>
        </div>
      ) : (
        <p className="form-message form-message--warning">
          Brak sesji źródłowej dla tej wypłaty.
        </p>
      )}

      {payment.status === "ACTIVE" ? (
        <button
          className="secondary-button"
          onClick={() => {
            onRequestCancellation(payment.id);
          }}
          type="button"
        >
          <Ban aria-hidden="true" size={18} />
          Przejdź do anulowania
        </button>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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

function uniqueOptions(
  payments: readonly AdminPaymentDirectoryItem[],
  valueKey: "seasonId" | "workerId",
  labelKey: "seasonName" | "workerName"
): { label: string; value: string }[] {
  return Array.from(
    new Map(
      payments.map((payment) => [
        payment[valueKey],
        {
          label: payment[labelKey],
          value: payment[valueKey]
        }
      ])
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label, "pl"));
}

function paymentMethodLabel(method: AdminPaymentDirectoryItem["paymentMethod"]): string {
  switch (method) {
    case "CASH":
      return "Gotówka";
    case "BANK_TRANSFER":
      return "Przelew bankowy";
    case "OTHER":
      return "Inna";
  }
}

function paymentStatusLabel(status: AdminPaymentDirectoryItem["status"]): string {
  return status === "ACTIVE" ? "Aktywna" : "Anulowana";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "brak";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "brak";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw"
  }).format(date);
}

function formatQuantity(quantityMilli: number): string {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0
  }).format(quantityMilli / 1000);
}

function downloadAdminPaymentCsv(content: string, filename: string): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.URL.createObjectURL !== "function"
  ) {
    throw new Error("Eksport wypłat wymaga przegladarki z obsluga plikow.");
  }

  const blob = new Blob([content], {
    type: POLISH_EXCEL_CSV_MIME_TYPE
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
