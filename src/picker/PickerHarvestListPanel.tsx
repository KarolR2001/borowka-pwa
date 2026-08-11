import { Eye, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { formatSessionQuantity } from "../harvest/ActiveHarvestSessionPanel";
import {
  HARVEST_SESSION_STATUSES,
  harvestSessionStatusLabel
} from "../harvest/harvestSessionState";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { RecordDialog } from "../ui/RecordDialog";
import {
  defaultPickerHarvestFilters,
  filterPickerHarvestItems,
  loadPickerHarvestList,
  type PickerHarvestFilters,
  type PickerHarvestListInput,
  type PickerHarvestListItem,
  type PickerHarvestListResult
} from "./pickerHarvestList";
import {
  PickerSessionDetailsPanel,
  type PickerSessionDetailsApi
} from "./PickerSessionDetailsPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerHarvestListApi = {
  load: (
    env: FirebaseEnv,
    input: PickerHarvestListInput
  ) => Promise<PickerHarvestListResult>;
};

export const defaultPickerHarvestListApi: PickerHarvestListApi = {
  load: loadPickerHarvestList
};

type ListState =
  | { result: PickerHarvestListResult | null; status: "IDLE" | "LOADING" }
  | { result: PickerHarvestListResult; status: "READY" }
  | { result: PickerHarvestListResult | null; status: "ERROR" };

const initialState: ListState = {
  result: null,
  status: "IDLE"
};

export function PickerHarvestListPanel({
  authState,
  env,
  isOnline,
  onReportIssue,
  pickerHarvestListApi = defaultPickerHarvestListApi,
  pickerSessionDetailsApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  onReportIssue?: (sessionId: string) => void;
  pickerHarvestListApi?: PickerHarvestListApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<ListState>(initialState);
  const [filters, setFilters] = useState<PickerHarvestFilters>(
    defaultPickerHarvestFilters
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
    void pickerHarvestListApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline,
        syncDocuments
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
  }, [authState, env, isOnline, isPicker, pickerHarvestListApi, syncDocuments]);

  const filteredItems = useMemo(
    () => filterPickerHarvestItems(state.result?.items ?? [], filters),
    [filters, state.result]
  );
  const selectedItem =
    state.result?.items.find((item) => item.sessionId === selectedSessionId) ?? null;

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Moje zbiory">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Moje zbiory</p>
          <p>Lista wymaga aktywnego konta powiązanego ze zbieraczem.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="picker-harvest-list" aria-label="Moje zbiory">
      <CollapsibleFilters>
        <HarvestFilters
          filters={filters}
          onChange={setFilters}
          seasons={state.result?.seasons ?? []}
        />
      </CollapsibleFilters>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać listy własnych zbiorów.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidSessionCount > 0 || state.result.invalidSeasonCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagające kontroli: sesje {state.result.invalidSessionCount}, sezony{" "}
          {state.result.invalidSeasonCount}.
        </p>
      ) : null}
      {selectedItem ? (
        <RecordDialog
          label="Szczegóły zbioru"
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
            sessionId={selectedItem.sessionId}
          />
        </RecordDialog>
      ) : null}
      {reportSessionId ? (
        <p className="form-message form-message--ok">
          Sesja została wybrana do zgłoszenia niezgodności.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie własnych sesji zbioru.</p>
      ) : null}
      {state.result && filteredItems.length === 0 ? (
        <p className="empty-state">Brak sesji spełniających wybrane filtry.</p>
      ) : null}
      {filteredItems.length > 0 ? (
        <HarvestTable
          items={filteredItems}
          onOpen={(sessionId) => {
            setReportSessionId(null);
            setSelectedSessionId(sessionId);
          }}
        />
      ) : null}
    </section>
  );
}

function HarvestFilters({
  filters,
  onChange,
  seasons
}: {
  filters: PickerHarvestFilters;
  onChange: (filters: PickerHarvestFilters) => void;
  seasons: readonly { id: string; name: string }[];
}) {
  return (
    <div className="picker-harvest-filters" aria-label="Filtry moich zbiorów">
      <label className="field">
        <span>Sezon</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, seasonId: event.target.value });
          }}
          value={filters.seasonId}
        >
          <option value="">Wszystkie sezony</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Od daty</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, fromDate: event.target.value });
          }}
          type="date"
          value={filters.fromDate}
        />
      </label>
      <label className="field">
        <span>Do daty</span>
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
              status: event.target.value as PickerHarvestFilters["status"]
            });
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie statusy</option>
          {HARVEST_SESSION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {harvestSessionStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function HarvestTable({
  items,
  onOpen
}: {
  items: readonly PickerHarvestListItem[];
  onOpen: (sessionId: string) => void;
}) {
  return (
    <div className="directory-table-wrap">
      <table className="directory-table picker-harvest-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Sezon</th>
            <th>Plan</th>
            <th>Jednostki</th>
            <th>Kg</th>
            <th>Naliczenie</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Szczegóły</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sessionId}>
              <td>{formatBusinessDate(item.businessDate)}</td>
              <td>{item.seasonName}</td>
              <td>{item.planName}</td>
              <td>
                {item.calculationBasis === "QUANTITY"
                  ? formatSessionQuantity(
                      item.totalQuantityMilli,
                      item.quantityPrecision,
                      item.unitLabelPlural
                    )
                  : "-"}
              </td>
              <td>{formatKilograms(item.totalWeightG)}</td>
              <td>
                {item.amountDueGrosz === null
                  ? "Brak oficjalnej kwoty"
                  : formatMoney(item.amountDueGrosz)}
              </td>
              <td>
                <span
                  className={`picker-session-status picker-session-status--${item.status}`}
                >
                  {harvestSessionStatusLabel(item.status)}
                </span>
              </td>
              <td>
                <button
                  aria-label={`Otwórz sesję ${formatBusinessDate(item.businessDate)}`}
                  className="secondary-button icon-button"
                  onClick={() => {
                    onOpen(item.sessionId);
                  }}
                  title="Otwórz szczegóły sesji"
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
