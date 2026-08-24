import {
  CheckCircle2,
  CirclePlus,
  ClipboardList,
  Lock,
  Pencil,
  Slash
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { mergeHarvestEntrySnapshotsById } from "./harvestEntryIdempotency";
import type { HarvestSessionDocument } from "./openHarvestSession";
import { harvestSessionStatusLabel } from "./harvestSessionState";

export type HarvestEntryStatus = "ACTIVE" | "CANCELLED";

export type ActiveHarvestSessionEntryItem = {
  id: string;
  sequenceNumber: number;
  quantityMilli: number;
  weightG: number | null;
  amountPreviewGrosz: number | null;
  status: HarvestEntryStatus;
  createdAtLabel: string;
  pendingSync: boolean;
  createdByName?: string | null;
  correctionLabel?: string | null;
  canEdit?: boolean;
  canCancel?: boolean;
};

export type ActiveHarvestSessionView = {
  session: HarvestSessionDocument;
  seasonName: string;
  createdByName: string;
  deviceName: string;
  entries: readonly ActiveHarvestSessionEntryItem[];
  estimatedAmountGrosz: number;
  pendingWriteCount: number;
  isOnline: boolean;
  canAddEntry: boolean;
  canCloseSession: boolean;
  statusNotice?: string | null;
};

export function ActiveHarvestSessionPanel({
  view,
  onAddEntry,
  onCloseSession,
  onEditEntry,
  onCancelEntry
}: {
  view: ActiveHarvestSessionView | null;
  onAddEntry?: () => void;
  onCloseSession?: () => void;
  onEditEntry?: (entryId: string) => void;
  onCancelEntry?: (entryId: string) => void;
}) {
  const entryListRef = useRef<HTMLOListElement | null>(null);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);

  useEffect(() => {
    setActiveEntryIndex(0);
  }, [view?.session.id, view?.entries.length]);

  if (!view) {
    return (
      <section className="active-session" aria-label="Aktywna sesja zbioru">
        <div className="active-session__empty">
          <span className="access-notice__icon">
            <ClipboardList aria-hidden="true" size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h3>Brak aktywnej sesji</h3>
            <p>Otwarte sesje zostaną pokazane po wdrożeniu zapisu zbiorów.</p>
          </div>
        </div>
      </section>
    );
  }

  const sortedEntries = mergeHarvestEntrySnapshotsById(view.entries).sort(
    (left, right) => right.sequenceNumber - left.sequenceNumber
  );
  const lastEntry: ActiveHarvestSessionEntryItem | null =
    sortedEntries.length > 0 ? sortedEntries[0] : null;
  const sessionIsOpen = view.session.status === "OPEN";
  const canAddEntry = sessionIsOpen && view.canAddEntry && view.isOnline;
  const canCloseSession = sessionIsOpen && view.canCloseSession && view.isOnline;
  const amountLabel =
    view.session.amountDueGrosz === null ? "Kwota szacunkowa" : "Kwota oficjalna";
  const amountGrosz = view.session.amountDueGrosz ?? view.estimatedAmountGrosz;

  const updateActiveEntry = () => {
    const list = entryListRef.current;
    if (!list || sortedEntries.length < 2) {
      return;
    }

    const listCenter = list.scrollLeft + list.clientWidth / 2;
    const closestIndex = sortedEntries.reduce((currentIndex, entry, index) => {
      const element = list.querySelector<HTMLElement>(
        `[data-entry-index="${String(index)}"]`
      );
      if (!element) {
        return currentIndex;
      }

      const currentElement = list.querySelector<HTMLElement>(
        `[data-entry-index="${String(currentIndex)}"]`
      );
      if (!currentElement) {
        return index;
      }

      return Math.abs(element.offsetLeft + element.offsetWidth / 2 - listCenter) <
        Math.abs(currentElement.offsetLeft + currentElement.offsetWidth / 2 - listCenter)
        ? index
        : currentIndex;
    }, 0);

    setActiveEntryIndex(closestIndex);
  };

  return (
    <section className="active-session" aria-label="Aktywna sesja zbioru">
      <div className="active-session__header">
        <div>
          <p className="eyebrow">Aktywna sesja</p>
          <h3>{view.session.workerNameSnapshot}</h3>
          <p>
            {view.seasonName} · {formatBusinessDate(view.session.businessDate)}
          </p>
        </div>
        <div className="active-session__actions">
          <button
            className="primary-action"
            disabled={!canAddEntry}
            onClick={onAddEntry}
            type="button"
          >
            <CirclePlus aria-hidden="true" size={18} strokeWidth={2.2} />
            Dodaj wpis
          </button>
          <button
            className="secondary-action"
            disabled={!canCloseSession}
            onClick={onCloseSession}
            title="Zamknij sesję"
            type="button"
          >
            <Lock aria-hidden="true" size={18} strokeWidth={2.2} />
            Zamknij sesję
          </button>
        </div>
      </div>

      <div className="active-session__status" aria-label="Status sesji">
        <SessionBadge label={harvestSessionStatusLabel(view.session.status)} />
      </div>

      {view.statusNotice ? (
        <p className="form-message form-message--error">{view.statusNotice}</p>
      ) : null}

      <dl className="active-session__summary" aria-label="Podsumowanie aktywnej sesji">
        <SessionMetric label="Plan" value={view.session.planNameSnapshot} />
        <SessionMetric
          label="Stawka"
          value={`${formatMoney(view.session.rateGroszSnapshot)} / ${
            view.session.unitLabelSnapshot
          }`}
        />
        <SessionMetric
          label="Suma kg"
          value={formatKilograms(view.session.totalWeightG)}
        />
        <SessionMetric label={amountLabel} value={formatMoney(amountGrosz)} />
      </dl>

      <div className="active-session__facts" aria-label="Informacje o sesji">
        <div>
          <span>Ostatni wpis</span>
          <strong>{lastEntry ? entryTitle(lastEntry) : "brak"}</strong>
        </div>
      </div>

      <section
        className="active-session__entries"
        aria-labelledby="session-entries-title"
      >
        <div className="active-session__section-header">
          <h4 id="session-entries-title">Wpisy</h4>
          <span>{sortedEntries.length}</span>
        </div>
        {sortedEntries.length > 0 ? (
          <div className="active-session__entry-carousel">
            <ol
              aria-label="Lista wpisów sesji"
              className="active-session__entry-list"
              onScroll={updateActiveEntry}
              ref={entryListRef}
            >
              {sortedEntries.map((entry, index) => (
                <li
                  className="active-session__entry"
                  data-entry-index={index}
                  key={entry.id}
                >
                  <div className="active-session__entry-heading">
                    <strong>{entryTitle(entry)}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Ilość</dt>
                      <dd>
                        {formatSessionQuantity(
                          entry.quantityMilli,
                          view.session.quantityPrecisionSnapshot,
                          view.session.unitLabelSnapshot
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Kg</dt>
                      <dd>
                        {entry.weightG === null ? "brak" : formatKilograms(entry.weightG)}
                      </dd>
                    </div>
                    <div>
                      <dt>Czas</dt>
                      <dd>{entry.createdAtLabel}</dd>
                    </div>
                    <div>
                      <dt>Podglad</dt>
                      <dd>
                        {entry.amountPreviewGrosz === null
                          ? "brak"
                          : formatMoney(entry.amountPreviewGrosz)}
                      </dd>
                    </div>
                  </dl>
                  <div className="active-session__entry-side">
                    <span
                      className={`active-session__entry-status active-session__entry-status--${entry.status.toLowerCase()}`}
                    >
                      {entry.status === "ACTIVE" ? "Aktywny" : "Anulowany"}
                    </span>
                    {entry.correctionLabel ? (
                      <span className="active-session__entry-correction">
                        {entry.correctionLabel}
                      </span>
                    ) : null}
                    <div className="active-session__entry-actions">
                      {entry.canEdit ? (
                        <button
                          className="secondary-action active-session__entry-action"
                          onClick={() => {
                            onEditEntry?.(entry.id);
                          }}
                          title={`Popraw wpis ${entryTitle(entry)}`}
                          type="button"
                        >
                          <Pencil aria-hidden="true" size={16} strokeWidth={2.2} />
                          Popraw
                        </button>
                      ) : null}
                      {entry.canCancel ? (
                        <button
                          className="secondary-action active-session__entry-action"
                          onClick={() => {
                            onCancelEntry?.(entry.id);
                          }}
                          title={`Anuluj wpis ${entryTitle(entry)}`}
                          type="button"
                        >
                          <Slash aria-hidden="true" size={16} strokeWidth={2.2} />
                          Anuluj
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {sortedEntries.length > 1 ? (
              <nav
                aria-label="Pozycja na liście wpisów"
                className="active-session__entry-dots"
              >
                {sortedEntries.map((entry, index) => (
                  <button
                    aria-current={activeEntryIndex === index ? "true" : undefined}
                    aria-label={`Pokaż wpis ${entryTitle(entry)}`}
                    className={
                      activeEntryIndex === index
                        ? "active-session__entry-dot is-active"
                        : "active-session__entry-dot"
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
                      setActiveEntryIndex(index);
                    }}
                    type="button"
                  />
                ))}
              </nav>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">Sesja nie ma jeszcze wpisów.</p>
        )}
      </section>
    </section>
  );
}

export function formatSessionQuantity(
  quantityMilli: number,
  precision: number,
  unitLabel: string
): string {
  if (!Number.isSafeInteger(quantityMilli)) {
    throw new Error("Ilość sesji musi być bezpieczna liczba calkowita.");
  }

  if (!Number.isInteger(precision) || precision < 0 || precision > 3) {
    throw new Error("Precyzja ilości musi być od 0 do 3.");
  }

  const value = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision
  }).format(quantityMilli / 1000);

  return `${value} ${unitLabel}`;
}

function SessionBadge({
  icon: Icon = CheckCircle2,
  label,
  tone = "neutral"
}: {
  icon?: typeof CheckCircle2;
  label: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  return (
    <span className={`active-session__badge active-session__badge--${tone}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={2.2} />
      {label}
    </span>
  );
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="active-session__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function entryTitle(entry: ActiveHarvestSessionEntryItem): string {
  return `#${String(entry.sequenceNumber)}`;
}
