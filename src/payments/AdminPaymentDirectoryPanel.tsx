import { Ban, Banknote, Download, Eye, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { harvestSessionStatusLabel } from "../harvest/harvestSessionState";
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

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminPaymentDirectoryApi = {
  downloadCsv: (content: string, filename: string) => void;
  list: (
    env: FirebaseEnv,
    actorProfile: Extract<AuthSessionState, { status: "READY" }>["profile"]
  ) => Promise<AdminPaymentDirectoryResult>;
};

export const defaultAdminPaymentDirectoryApi: AdminPaymentDirectoryApi = {
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
  env,
  onRequestCancellation
}: {
  adminPaymentDirectoryApi?: AdminPaymentDirectoryApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
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
      <section className="access-notice" aria-label="Historia wyplat">
        <Banknote aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Historia wyplat</p>
          <p>Lista wyplat jest dostepna tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  function exportVisiblePayments(): void {
    try {
      const exportedAtIso = new Date().toISOString();
      adminPaymentDirectoryApi.downloadCsv(
        createAdminPaymentCsv(filteredPayments),
        createAdminPaymentCsvFilename(exportedAtIso)
      );
      setExportError(null);
      setFeedback(`Wyeksportowano rekordy: ${String(filteredPayments.length)}.`);
    } catch {
      setFeedback(null);
      setExportError("Nie udalo sie zapisac pliku CSV.");
    }
  }

  function requestCancellation(paymentId: string): void {
    setCancellationTargetId(paymentId);
    onRequestCancellation?.(paymentId);
  }

  return (
    <section className="payment-directory" aria-labelledby="payment-directory-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Rozliczenia</p>
          <h2 id="payment-directory-title">Historia wyplat</h2>
          <p className="panel-detail">
            {state.status === "LOADING"
              ? "Pobieranie aktualnych danych z serwera."
              : "Aktywne, anulowane i importowane wyplaty."}
          </p>
        </div>
        <div className="payment-directory__header-actions">
          <button
            className="secondary-button"
            disabled={filteredPayments.length === 0}
            onClick={exportVisiblePayments}
            type="button"
          >
            <Download aria-hidden="true" size={18} />
            Eksport CSV
          </button>
          <button
            className="secondary-button icon-button"
            disabled={state.status === "LOADING"}
            onClick={() => {
              setExportError(null);
              setFeedback(null);
              setReloadKey((current) => current + 1);
            }}
            title="Odswiez historie wyplat"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} />
            <span className="sr-only">Odswiez historie wyplat</span>
          </button>
        </div>
      </header>

      <PaymentDirectoryFilterControls
        filters={filters}
        onChange={setFilters}
        payments={payments}
      />

      <div className="directory-summary" aria-label="Podsumowanie historii wyplat">
        <DirectoryStat label="Widoczne" value={String(summary.totalCount)} />
        <DirectoryStat label="Aktywne" value={String(summary.activeCount)} />
        <DirectoryStat
          label="Suma aktywnych"
          value={formatMoney(summary.activeAmountGrosz)}
        />
        <DirectoryStat label="Anulowane" value={String(summary.cancelledCount)} />
        <DirectoryStat label="Importowane" value={String(summary.importedCount)} />
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {exportError ? (
        <p className="form-message form-message--error">{exportError}</p>
      ) : null}
      {cancellationTargetId ? (
        <p className="form-message form-message--warning">
          Wybrano wyplate {cancellationTargetId} do anulowania.
        </p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac aktualnej historii wyplat.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidPaymentCount > 0 ||
        state.result.invalidSessionCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.missingSourceSessionCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagajace kontroli: wyplaty {state.result.invalidPaymentCount}, sesje{" "}
          {state.result.invalidSessionCount}, sezony {state.result.invalidSeasonCount},
          brak sesji zrodlowej {state.result.missingSourceSessionCount}.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii wyplat.</p>
      ) : null}
      {state.status !== "LOADING" && filteredPayments.length === 0 ? (
        <p className="empty-state">Brak wyplat spelniajacych filtry.</p>
      ) : null}
      {filteredPayments.length > 0 ? (
        <PaymentDirectoryTable
          onOpen={setSelectedPaymentId}
          payments={filteredPayments}
        />
      ) : null}
      {selectedPayment ? (
        <PaymentDirectoryDetails
          onClose={() => {
            setSelectedPaymentId(null);
          }}
          onRequestCancellation={requestCancellation}
          payment={selectedPayment}
        />
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
    <div className="payment-directory-filters" aria-label="Filtry historii wyplat">
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
          <option value="CASH">Gotowka</option>
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
        fromLabel="Wyplata od"
        fromValue={filters.paidFromDate}
        onFromChange={(paidFromDate) => {
          onChange({ ...filters, paidFromDate });
        }}
        onToChange={(paidToDate) => {
          onChange({ ...filters, paidToDate });
        }}
        toLabel="Wyplata do"
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
      <table className="directory-table payment-directory-table">
        <thead>
          <tr>
            <th scope="col">Data wyplaty</th>
            <th scope="col">Zbieracz</th>
            <th scope="col">Kwota</th>
            <th scope="col">Metoda</th>
            <th scope="col">Status</th>
            <th scope="col">Data sesji</th>
            <th scope="col">Autor</th>
            <th scope="col">Szczegoly</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{formatBusinessDate(payment.paidBusinessDate)}</td>
              <td>
                {payment.workerName}
                <span className="directory-cell-note">{payment.seasonName}</span>
              </td>
              <td>{formatMoney(payment.amountGrosz)}</td>
              <td>{paymentMethodLabel(payment.paymentMethod)}</td>
              <td>
                <PaymentStatusLabels payment={payment} />
              </td>
              <td>
                {payment.sourceSession
                  ? formatBusinessDate(payment.sourceSession.businessDate)
                  : "brak"}
              </td>
              <td>{payment.createdBy}</td>
              <td>
                <button
                  className="secondary-button icon-button"
                  onClick={() => {
                    onOpen(payment.id);
                  }}
                  title={`Otworz szczegoly wyplaty ${payment.id}`}
                  type="button"
                >
                  <Eye aria-hidden="true" size={18} />
                  <span className="sr-only">Otworz szczegoly wyplaty {payment.id}</span>
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
          <p className="eyebrow">Szczegoly wyplaty</p>
          <h3 id="payment-directory-details-title">{payment.workerName}</h3>
        </div>
        <button
          className="secondary-button icon-button"
          onClick={onClose}
          title="Zamknij szczegoly"
          type="button"
        >
          <X aria-hidden="true" size={18} />
          <span className="sr-only">Zamknij szczegoly</span>
        </button>
      </header>

      <dl className="payment-directory-details__grid">
        <Detail label="Id wyplaty" value={payment.id} />
        <Detail label="Id sesji" value={payment.sessionId} />
        <Detail label="Kwota" value={formatMoney(payment.amountGrosz)} />
        <Detail
          label="Data wyplaty"
          value={formatBusinessDate(payment.paidBusinessDate)}
        />
        <Detail label="Metoda" value={paymentMethodLabel(payment.paymentMethod)} />
        <Detail label="Autor" value={payment.createdBy} />
        <Detail label="Czas serwera" value={formatTimestamp(payment.createdAtIso)} />
        <Detail label="Notatka" value={payment.note ?? "brak"} />
        <Detail
          label="Status"
          value={`${paymentStatusLabel(payment.status)}${
            payment.legacyImport ? ", import historyczny" : ""
          }`}
        />
        {payment.status === "CANCELLED" ? (
          <>
            <Detail label="Anulowal" value={payment.cancelledBy ?? "brak"} />
            <Detail
              label="Czas anulowania"
              value={formatTimestamp(payment.cancelledAtIso)}
            />
            <Detail
              label="Powod anulowania"
              value={payment.cancellationReason ?? "brak"}
            />
          </>
        ) : null}
      </dl>

      {payment.sourceSession ? (
        <div className="payment-directory-source-session">
          <h4>Sesja zrodlowa</h4>
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
              label="Sposob obliczenia"
              value={
                payment.sourceSession.calculationBasis === "WEIGHT"
                  ? "Waga aktywnych wpisow"
                  : "Ilosc aktywnych jednostek"
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
            <Detail label="Zamknal" value={payment.sourceSession.closedBy ?? "brak"} />
            <Detail
              label="Czas zamkniecia"
              value={formatTimestamp(payment.sourceSession.closedAtIso)}
            />
            <Detail label="Rewizja" value={String(payment.sourceSession.revision)} />
          </dl>
        </div>
      ) : (
        <p className="form-message form-message--warning">
          Brak sesji zrodlowej dla tej wyplaty.
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
          Przejdz do anulowania
        </button>
      ) : null}
    </section>
  );
}

function PaymentStatusLabels({ payment }: { payment: AdminPaymentDirectoryItem }) {
  return (
    <span className="payment-directory-statuses">
      <span
        className={`status-badge ${
          payment.status === "ACTIVE" ? "status-badge--active" : ""
        }`}
      >
        {paymentStatusLabel(payment.status)}
      </span>
      {payment.legacyImport ? <span className="status-badge">Importowana</span> : null}
    </span>
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
      return "Gotowka";
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
    throw new Error("Eksport wyplat wymaga przegladarki z obsluga plikow.");
  }

  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8"
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
