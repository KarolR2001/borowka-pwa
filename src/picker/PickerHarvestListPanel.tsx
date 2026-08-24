import { Eye, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  currentWarsawBusinessDate,
  resolveDashboardPeriod
} from "../dashboard/dashboardPeriod";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
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
import type { PickerDashboardSelection } from "./PickerDashboardPanel";

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
  dashboardSelection,
  env,
  isOnline,
  onReportIssue,
  pickerHarvestListApi = defaultPickerHarvestListApi,
  pickerSessionDetailsApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  dashboardSelection?: PickerDashboardSelection;
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
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
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

  const filteredItems = useMemo(() => {
    const listFilters = dashboardSelection
      ? dashboardHarvestFilters({
          dashboardSelection,
          seasons: state.result?.seasons ?? [],
          todayBusinessDate
        })
      : filters;

    return filterPickerHarvestItems(state.result?.items ?? [], listFilters);
  }, [dashboardSelection, filters, state.result, todayBusinessDate]);
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
      <header className="picker-harvest-list__header">
        <h2>Moje zbiory</h2>
      </header>
      {!dashboardSelection ? (
        <CollapsibleFilters>
          <HarvestFilters
            filters={filters}
            onChange={setFilters}
            seasons={state.result?.seasons ?? []}
          />
        </CollapsibleFilters>
      ) : null}

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
          fullScreen
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
        <HarvestCarousel
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

function HarvestCarousel({
  items,
  onOpen
}: {
  items: readonly PickerHarvestListItem[];
  onOpen: (sessionId: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  const updateActiveItem = () => {
    const list = listRef.current;

    if (!list || items.length < 2) {
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
    <div className="picker-harvest-carousel">
      <ol
        aria-label="Lista moich zbiorów"
        className="picker-harvest-carousel__list"
        onScroll={updateActiveItem}
        ref={listRef}
      >
        {items.map((item, index) => (
          <li
            className="picker-harvest-carousel__item"
            data-harvest-index={index}
            key={item.sessionId}
          >
            <article className="picker-harvest-card">
              <header className="picker-harvest-card__header">
                <div>
                  <p className="eyebrow">Moje zbiory</p>
                  <h3>{formatBusinessDate(item.businessDate)}</h3>
                </div>
                <span
                  className={`picker-session-status picker-session-status--${item.status}`}
                >
                  {harvestSessionStatusLabel(item.status)}
                </span>
              </header>
              <dl className="picker-harvest-card__facts">
                <CardFact label="Zebrano" value={formatKilograms(item.totalWeightG)} />
                <CardFact
                  label="Naliczenie"
                  value={
                    item.amountDueGrosz === null
                      ? "Brak oficjalnej kwoty"
                      : formatMoney(item.amountDueGrosz)
                  }
                />
                <CardFact label="Wpisy" value={String(item.totalEntryCount)} />
              </dl>
              <button
                aria-label={`Otwórz sesję ${formatBusinessDate(item.businessDate)}`}
                className="secondary-button"
                onClick={() => {
                  onOpen(item.sessionId);
                }}
                title="Otwórz szczegóły sesji"
                type="button"
              >
                <Eye aria-hidden="true" size={18} />
                Szczegóły
              </button>
            </article>
          </li>
        ))}
      </ol>
      {items.length > 1 ? (
        <nav
          aria-label="Pozycja na liście moich zbiorów"
          className="picker-harvest-carousel__dots"
        >
          {items.map((item, index) => (
            <button
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={`Pokaż zbiór z ${formatBusinessDate(item.businessDate)}`}
              className={
                activeIndex === index
                  ? "picker-harvest-carousel__dot is-active"
                  : "picker-harvest-carousel__dot"
              }
              key={item.sessionId}
              onClick={() => {
                const target = listRef.current?.querySelector<HTMLElement>(
                  `[data-harvest-index="${String(index)}"]`
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

function dashboardHarvestFilters({
  dashboardSelection,
  seasons,
  todayBusinessDate
}: {
  dashboardSelection: PickerDashboardSelection;
  seasons: readonly {
    endDate: string | null;
    id: string;
    isDefault: boolean;
    startDate: string;
    status: "ARCHIVED" | "CLOSED" | "OPEN" | "PLANNED";
  }[];
  todayBusinessDate: string;
}): PickerHarvestFilters {
  const selectedSeason =
    seasons.length === 0
      ? null
      : (seasons.find((season) => season.id === dashboardSelection.selectedSeasonId) ??
        seasons.find((season) => season.isDefault && season.status === "OPEN") ??
        seasons.find((season) => season.status === "OPEN") ??
        seasons[0]);
  const period = selectedSeason
    ? resolveDashboardPeriod(dashboardSelection.periodSelection, {
        seasonEndDate: selectedSeason.endDate,
        seasonStartDate: selectedSeason.startDate,
        todayBusinessDate
      })
    : null;

  return {
    fromDate: period?.fromDate ?? "",
    seasonId: selectedSeason?.id ?? "",
    status: "ALL",
    toDate: period?.toDate ?? ""
  };
}
