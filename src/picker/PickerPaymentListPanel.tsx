import { Eye, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatMoney } from "../domain/format";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { RecordDialog } from "../ui/RecordDialog";
import {
  defaultPickerPaymentFilters,
  filterPickerPaymentItems,
  loadPickerPaymentList,
  summarizePickerPaymentPeriod,
  type PickerPaymentFilters,
  type PickerPaymentListInput,
  type PickerPaymentListItem,
  type PickerPaymentListResult
} from "./pickerPaymentList";
import {
  PickerSessionDetailsPanel,
  type PickerSessionDetailsApi
} from "./PickerSessionDetailsPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerPaymentListApi = {
  load: (
    env: FirebaseEnv,
    input: PickerPaymentListInput
  ) => Promise<PickerPaymentListResult>;
};

export const defaultPickerPaymentListApi: PickerPaymentListApi = {
  load: loadPickerPaymentList
};

type PaymentListState =
  | { result: PickerPaymentListResult | null; status: "IDLE" | "LOADING" }
  | { result: PickerPaymentListResult; status: "READY" }
  | { result: PickerPaymentListResult | null; status: "ERROR" };

const initialState: PaymentListState = {
  result: null,
  status: "IDLE"
};

export function PickerPaymentListPanel({
  authState,
  env,
  isOnline,
  onReportIssue,
  pickerPaymentListApi = defaultPickerPaymentListApi,
  pickerSessionDetailsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  onReportIssue?: (sessionId: string) => void;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
}) {
  const [state, setState] = useState<PaymentListState>(initialState);
  const [filters, setFilters] = useState<PickerPaymentFilters>(
    defaultPickerPaymentFilters
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void pickerPaymentListApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline
      })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({ result: current.result, status: "ERROR" }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isOnline, isPicker, pickerPaymentListApi]);

  const visiblePayments = useMemo(
    () => filterPickerPaymentItems(state.result?.payments ?? [], filters),
    [filters, state.result]
  );
  const summary = useMemo(
    () =>
      summarizePickerPaymentPeriod(
        state.result ?? { payments: [], sessions: [] },
        filters
      ),
    [filters, state.result]
  );

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Moje wypłaty">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Moje wypłaty</p>
          <p>Lista wymaga aktywnego konta powiązanego ze zbieraczem.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="picker-payment-list" aria-label="Moje wypłaty">
      <header className="picker-payment-list__header">
        <h2>Moje wypłaty</h2>
        <label className="field">
          <span>Sezon</span>
          <select
            onChange={(event) => {
              setFilters({ ...filters, seasonId: event.target.value });
            }}
            value={filters.seasonId}
          >
            <option value="">Wszystkie sezony</option>
            {(state.result?.seasons ?? []).map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <CollapsibleFilters>
        <PickerPaymentFilters filters={filters} onChange={setFilters} />
      </CollapsibleFilters>

      <div className="directory-summary" aria-label="Podsumowanie moich wypłat">
        <PaymentStat label="Naliczono" value={formatMoney(summary.accruedAmountGrosz)} />
        <PaymentStat
          label={`Wypłacono (${String(summary.activePaymentCount)})`}
          value={formatMoney(summary.paidAmountGrosz)}
        />
        <PaymentStat
          label="Pozostało do wypłaty"
          value={formatMoney(summary.remainingAmountGrosz)}
        />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać historii własnych wypłat.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidPaymentCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.invalidSessionCount > 0 ||
        state.result.missingSourceSessionCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagające kontroli: wypłaty {state.result.invalidPaymentCount}, sesje{" "}
          {state.result.invalidSessionCount}, brak sesji źródłowej{" "}
          {state.result.missingSourceSessionCount}, sezony{" "}
          {state.result.invalidSeasonCount}.
        </p>
      ) : null}
      {summary.remainingAmountGrosz < 0 ? (
        <p className="form-message form-message--warning">
          Wypłacona kwota przekracza naliczenie dla wybranego okresu.
        </p>
      ) : null}
      {selectedSessionId ? (
        <RecordDialog
          fullScreen
          label="Szczegóły wypłaty"
          onClose={() => {
            setSelectedSessionId(null);
            setReportSessionId(null);
          }}
        >
          <PickerSessionDetailsPanel
            authState={authState}
            detailsApi={pickerSessionDetailsApi}
            env={env}
            isOnline={isOnline}
            onClose={() => {
              setSelectedSessionId(null);
              setReportSessionId(null);
            }}
            onReportIssue={(sessionId) => {
              if (onReportIssue) {
                onReportIssue(sessionId);
              } else {
                setReportSessionId(sessionId);
              }
            }}
            sessionId={selectedSessionId}
          />
        </RecordDialog>
      ) : null}
      {reportSessionId ? (
        <p className="form-message form-message--ok">
          Sesja została wybrana do zgłoszenia niezgodności.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii wypłat.</p>
      ) : null}
      {state.result && visiblePayments.length === 0 ? (
        <p className="empty-state">Brak wypłat spełniających wybrane filtry.</p>
      ) : null}
      {visiblePayments.length > 0 ? (
        <PaymentCarousel
          onOpenSession={(sessionId) => {
            setReportSessionId(null);
            setSelectedSessionId(sessionId);
          }}
          payments={visiblePayments}
        />
      ) : null}
    </section>
  );
}

function PickerPaymentFilters({
  filters,
  onChange
}: {
  filters: PickerPaymentFilters;
  onChange: (filters: PickerPaymentFilters) => void;
}) {
  return (
    <div className="picker-payment-filters" aria-label="Filtry moich wypłat">
      <label className="field">
        <span>Sesja od</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, fromDate: event.target.value });
          }}
          type="date"
          value={filters.fromDate}
        />
      </label>
      <label className="field">
        <span>Sesja do</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, toDate: event.target.value });
          }}
          type="date"
          value={filters.toDate}
        />
      </label>
      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              status: event.target.value as PickerPaymentFilters["status"]
            });
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie statusy</option>
          <option value="ACTIVE">Aktywna</option>
          <option value="CANCELLED">Anulowana</option>
        </select>
      </label>
    </div>
  );
}

function PaymentCarousel({
  onOpenSession,
  payments
}: {
  onOpenSession: (sessionId: string) => void;
  payments: readonly PickerPaymentListItem[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [payments]);

  const updateActivePayment = () => {
    const list = listRef.current;

    if (!list || payments.length < 2) {
      return;
    }

    const viewportCenter = list.getBoundingClientRect().left + list.clientWidth / 2;
    const closestIndex = Array.from(list.children).reduce((currentIndex, item, index) => {
      const currentDistance = Math.abs(
        item.getBoundingClientRect().left + item.clientWidth / 2 - viewportCenter
      );
      const closestItem = list.children[currentIndex];
      const closestDistance = Math.abs(
        closestItem.getBoundingClientRect().left +
          closestItem.clientWidth / 2 -
          viewportCenter
      );

      return currentDistance < closestDistance ? index : currentIndex;
    }, 0);

    setActiveIndex(closestIndex);
  };

  return (
    <div className="picker-payment-carousel">
      <ol
        aria-label="Lista moich wypłat"
        className="picker-payment-carousel__list"
        onScroll={updateActivePayment}
        ref={listRef}
      >
        {payments.map((payment, index) => (
          <li
            className="picker-payment-carousel__item"
            data-payment-index={index}
            key={payment.id}
          >
            <article className="picker-payment-card">
              <header className="picker-payment-card__header">
                <div>
                  <p className="eyebrow">Wypłata</p>
                  <h3>{formatBusinessDate(payment.paidBusinessDate)}</h3>
                </div>
                <span
                  className={`picker-payment-status picker-payment-status--${payment.status}`}
                >
                  {payment.status === "ACTIVE" ? "Aktywna" : "Anulowana"}
                </span>
              </header>
              <dl className="picker-payment-card__facts">
                <CardFact label="Kwota" value={formatMoney(payment.amountGrosz)} />
                <CardFact
                  label="Data sesji"
                  value={
                    payment.sessionBusinessDate
                      ? formatBusinessDate(payment.sessionBusinessDate)
                      : "Brak danych"
                  }
                />
                <CardFact
                  label="Metoda"
                  value={paymentMethodLabel(payment.paymentMethod)}
                />
              </dl>
              <button
                aria-label={`Otwórz sesję wypłaty z ${formatBusinessDate(payment.paidBusinessDate)}`}
                className="secondary-button"
                disabled={payment.sessionBusinessDate === null}
                onClick={() => {
                  onOpenSession(payment.sessionId);
                }}
                title="Otwórz sesję źródłową"
                type="button"
              >
                <Eye aria-hidden="true" size={18} />
                Szczegóły sesji
              </button>
            </article>
          </li>
        ))}
      </ol>
      {payments.length > 1 ? (
        <nav
          aria-label="Pozycja na liście moich wypłat"
          className="picker-payment-carousel__dots"
        >
          {payments.map((payment, index) => (
            <button
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={`Pokaż wypłatę z ${formatBusinessDate(payment.paidBusinessDate)}`}
              className={
                activeIndex === index
                  ? "picker-payment-carousel__dot is-active"
                  : "picker-payment-carousel__dot"
              }
              key={payment.id}
              onClick={() => {
                const target = listRef.current?.querySelector<HTMLElement>(
                  `[data-payment-index="${String(index)}"]`
                );

                target?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                  inline: "center"
                });
                setActiveIndex(index);
              }}
              type="button"
            />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function CardFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PaymentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function paymentMethodLabel(method: PickerPaymentListItem["paymentMethod"]): string {
  switch (method) {
    case "BANK_TRANSFER":
      return "Przelew bankowy";
    case "CASH":
      return "Gotówka";
    case "OTHER":
      return "Inna";
  }
}
