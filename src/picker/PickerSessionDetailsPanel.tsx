import { CloudOff, Flag, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { formatSessionQuantity } from "../harvest/ActiveHarvestSessionPanel";
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
          <p className="eyebrow">Szczegoly sesji</p>
          <h3 id="picker-session-details-title">
            {result
              ? `Sesja z ${formatBusinessDate(result.businessDate)}`
              : "Wybrana sesja"}
          </h3>
        </div>
        <button
          aria-label="Zamknij szczegoly sesji"
          className="secondary-button icon-button"
          onClick={onClose}
          title="Zamknij szczegoly sesji"
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      {state.status === "LOADING" ? (
        <p className="empty-state">Pobieranie szczegolow sesji.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac szczegolow tej sesji.
        </p>
      ) : null}
      {result?.dataSource === "CACHE" ? (
        <p className="picker-dashboard__source form-message form-message--warning">
          <CloudOff aria-hidden="true" size={18} />
          Szczegoly z pamieci offline
        </p>
      ) : null}
      {result ? (
        <>
          <dl className="picker-session-details__facts">
            <Fact label="Status" value={harvestSessionStatusLabel(result.status)} />
            <Fact label="Plan" value={result.planName} />
            <Fact
              label="Stawka snapshotu"
              value={`${formatMoney(result.rateGrosz)} / ${result.unitLabel}`}
            />
            <Fact label="Aktywne wpisy" value={String(result.activeEntryCount)} />
            <Fact
              label="Jednostki"
              value={
                result.calculationBasis === "QUANTITY"
                  ? formatSessionQuantity(
                      result.totalQuantityMilli,
                      result.quantityPrecision,
                      result.unitLabelPlural
                    )
                  : "-"
              }
            />
            <Fact label="Masa" value={formatKilograms(result.totalWeightG)} />
            <Fact
              label="Oficjalne naliczenie"
              value={
                result.amountDueGrosz === null
                  ? "Brak oficjalnej kwoty"
                  : formatMoney(result.amountDueGrosz)
              }
            />
            <Fact label="Status wyplaty" value={paymentStatusLabel(result)} />
          </dl>

          {result.payment ? (
            <section className="picker-session-details__payment">
              <h4>Wyplata</h4>
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
              <p className="empty-state">Brak wpisow w tej sesji.</p>
            ) : (
              <ol>
                {result.entries.map((entry) => (
                  <li
                    className={
                      entry.status === "CANCELLED"
                        ? "picker-session-entry is-cancelled"
                        : "picker-session-entry"
                    }
                    key={entry.id}
                  >
                    <div>
                      <strong>Wpis {String(entry.sequenceNumber)}</strong>
                      {entry.kind === "CORRECTION" ? (
                        <span>Korekta wpisu {entry.replacesEntryId}</span>
                      ) : null}
                      <span>
                        {entry.status === "CANCELLED" ? "Anulowany" : "Aktywny"}
                      </span>
                    </div>
                    <dl>
                      <Fact
                        label="Ilosc"
                        value={formatSessionQuantity(
                          entry.quantityMilli,
                          result.quantityPrecision,
                          result.unitLabelPlural
                        )}
                      />
                      <Fact
                        label="Masa"
                        value={
                          entry.weightG === null ? "-" : formatKilograms(entry.weightG)
                        }
                      />
                    </dl>
                    {entry.status === "CANCELLED" && entry.cancellationReason ? (
                      <p>Powod: {entry.cancellationReason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {result.invalidEntryCount > 0 || result.invalidPayment ? (
            <p className="form-message form-message--warning">
              Dane wymagajace kontroli: wpisy {result.invalidEntryCount}, wyplata{" "}
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
            Zglos niezgodnosc
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

function paymentMethodLabel(
  method: NonNullable<PickerSessionDetailsResult["payment"]>["paymentMethod"]
): string {
  switch (method) {
    case "CASH":
      return "Gotowka";
    case "BANK_TRANSFER":
      return "Przelew bankowy";
    case "OTHER":
      return "Inna";
  }
}

function paymentStatusLabel(result: PickerSessionDetailsResult): string {
  if (result.payment) {
    return "Wyplacono";
  }

  if (result.invalidPayment || result.status === "PAID") {
    return "Wymaga sprawdzenia";
  }

  switch (result.status) {
    case "CLOSED":
      return "Do wyplaty";
    case "CANCELLED":
      return "Nie dotyczy";
    case "OPEN":
      return "Jeszcze nienaliczona";
    case "REVIEW_REQUIRED":
      return "Wstrzymana do sprawdzenia";
  }
}
