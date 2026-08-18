import { Flag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { harvestSessionStatusLabel } from "../harvest/harvestSessionState";
import {
  loadPickerSessionDetails,
  type PickerSessionDetailsInput,
  type PickerSessionDetailsResult
} from "./pickerSessionDetails";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerSessionDetailsApi = {
  load: (
    env: FirebaseEnv,
    input: PickerSessionDetailsInput
  ) => Promise<PickerSessionDetailsResult>;
};

export const defaultPickerSessionDetailsApi: PickerSessionDetailsApi = {
  load: loadPickerSessionDetails
};

type DetailsState =
  | { result: null; status: "LOADING" }
  | { result: PickerSessionDetailsResult; status: "READY" }
  | { result: null; status: "ERROR" };

export function PickerSessionDetailsPanel({
  authState,
  detailsApi = defaultPickerSessionDetailsApi,
  env,
  isOnline,
  onClose,
  onReportIssue,
  sessionId
}: {
  authState: AuthSessionState;
  detailsApi?: PickerSessionDetailsApi;
  env: FirebaseEnv;
  isOnline: boolean;
  onClose: () => void;
  onReportIssue: (sessionId: string) => void;
  sessionId: string;
}) {
  const [state, setState] = useState<DetailsState>({
    result: null,
    status: "LOADING"
  });
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setState({ result: null, status: "ERROR" });
      return undefined;
    }

    setState({ result: null, status: "LOADING" });
    void detailsApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline,
        sessionId
      })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({ result: null, status: "ERROR" });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, detailsApi, env, isOnline, isPicker, sessionId]);

  const result = state.result;

  return (
    <section
      className="picker-session-details"
      aria-labelledby="picker-session-details-title"
    >
      <header>
        <div>
          <p className="eyebrow">Szczegóły sesji</p>
          <h3 id="picker-session-details-title">
            {result
              ? `Sesja z ${formatBusinessDate(result.businessDate)}`
              : "Wybrana sesja"}
          </h3>
        </div>
        <button
          aria-label="Zamknij szczegóły sesji"
          className="secondary-button icon-button"
          onClick={onClose}
          title="Zamknij szczegóły sesji"
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      {state.status === "LOADING" ? (
        <p className="empty-state">Pobieranie szczegółów sesji.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać szczegółów tej sesji.
        </p>
      ) : null}
      {result ? (
        <>
          <dl className="picker-session-details__facts">
            <Fact label="Status" value={harvestSessionStatusLabel(result.status)} />
            <Fact label="Masa" value={formatKilograms(result.totalWeightG)} />
          </dl>

          {result.payment ? (
            <section className="picker-session-details__payment">
              <h4>Wypłata</h4>
              <dl>
                <Fact
                  label="Data"
                  value={formatBusinessDate(result.payment.paidBusinessDate)}
                />
                <Fact
                  label="Metoda"
                  value={paymentMethodLabel(result.payment.paymentMethod)}
                />
                <Fact label="Kwota" value={formatMoney(result.payment.amountGrosz)} />
              </dl>
            </section>
          ) : null}

          <section className="picker-session-details__entries">
            <h4>Wpisy</h4>
            {result.entries.length === 0 ? (
              <p className="empty-state">Brak wpisów w tej sesji.</p>
            ) : (
              <PickerSessionEntryCarousel entries={result.entries} />
            )}
          </section>

          {result.invalidEntryCount > 0 || result.invalidPayment ? (
            <p className="form-message form-message--warning">
              Dane wymagające kontroli: wpisy {result.invalidEntryCount}, wypłata{" "}
              {result.invalidPayment ? "1" : "0"}.
            </p>
          ) : null}

          <button
            className="secondary-button"
            onClick={() => {
              onReportIssue(result.sessionId);
            }}
            type="button"
          >
            <Flag aria-hidden="true" size={18} />
            Zgłoś niezgodność
          </button>
        </>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PickerSessionEntryCarousel({
  entries
}: {
  entries: readonly PickerSessionDetailsResult["entries"][number][];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const entryListRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [entries]);

  const updateActiveEntry = () => {
    const entryList = entryListRef.current;

    if (!entryList) {
      return;
    }

    const viewportCenter =
      entryList.getBoundingClientRect().left + entryList.clientWidth / 2;
    const closestIndex = Array.from(entryList.children).reduce(
      (currentIndex, entry, index) => {
        const currentDistance = Math.abs(
          entry.getBoundingClientRect().left + entry.clientWidth / 2 - viewportCenter
        );
        const closestEntry = entryList.children[currentIndex];
        const closestDistance = Math.abs(
          closestEntry.getBoundingClientRect().left +
            closestEntry.clientWidth / 2 -
            viewportCenter
        );

        return currentDistance < closestDistance ? index : currentIndex;
      },
      0
    );

    setActiveIndex(closestIndex);
  };

  return (
    <div className="picker-session-entry-carousel">
      <ol
        className="picker-session-details__entry-list"
        onScroll={updateActiveEntry}
        ref={entryListRef}
      >
        {entries.map((entry, index) => (
          <li
            className={
              entry.status === "CANCELLED"
                ? "picker-session-entry is-cancelled"
                : "picker-session-entry"
            }
            data-entry-index={index}
            key={entry.id}
          >
            <div>
              <strong>Wpis {String(entry.sequenceNumber)}</strong>
              {entry.kind === "CORRECTION" ? (
                <span>Korekta wcześniejszego wpisu</span>
              ) : null}
              <span>{entry.status === "CANCELLED" ? "Anulowany" : "Aktywny"}</span>
            </div>
            <dl>
              <Fact
                label="Masa"
                value={entry.weightG === null ? "-" : formatKilograms(entry.weightG)}
              />
            </dl>
            {entry.status === "CANCELLED" && entry.cancellationReason ? (
              <p>Powód: {entry.cancellationReason}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {entries.length > 1 ? (
        <nav aria-label="Pozycja na liście wpisów" className="picker-session-entry-dots">
          {entries.map((entry, index) => (
            <button
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={`Pokaż wpis ${String(entry.sequenceNumber)}`}
              className={
                activeIndex === index
                  ? "picker-session-entry-dots__button is-active"
                  : "picker-session-entry-dots__button"
              }
              key={entry.id}
              onClick={() => {
                const target = entryListRef.current?.querySelector<HTMLElement>(
                  `[data-entry-index="${String(index)}"]`
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

function paymentMethodLabel(
  method: NonNullable<PickerSessionDetailsResult["payment"]>["paymentMethod"]
): string {
  switch (method) {
    case "CASH":
      return "Gotówka";
    case "BANK_TRANSFER":
      return "Przelew bankowy";
    case "OTHER":
      return "Inna";
  }
}
