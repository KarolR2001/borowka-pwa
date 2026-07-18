import {
  CheckCircle2,
  CirclePlus,
  ClipboardList,
  CloudOff,
  Lock,
  Pencil,
  Slash,
  Wifi
} from "lucide-react";

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
  if (!view) {
    return (
      <section className="active-session" aria-label="Aktywna sesja zbioru">
        <div className="active-session__empty">
          <span className="access-notice__icon">
            <ClipboardList aria-hidden="true" size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h3>Brak aktywnej sesji</h3>
            <p>Otwarte sesje zostana pokazane po wdrozeniu zapisu zbiorow.</p>
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
  const canCloseSession =
    sessionIsOpen &&
    view.canCloseSession &&
    view.isOnline &&
    view.session.totalEntryCount > 0;
  const amountLabel =
    view.session.amountDueGrosz === null ? "Kwota szacunkowa" : "Kwota oficjalna";
  const amountGrosz = view.session.amountDueGrosz ?? view.estimatedAmountGrosz;

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
            type="button"
          >
            <Lock aria-hidden="true" size={18} strokeWidth={2.2} />
            Zamknij sesje
          </button>
        </div>
      </div>

      <div className="active-session__status" aria-label="Status sesji i synchronizacji">
        <SessionBadge label={harvestSessionStatusLabel(view.session.status)} />
        <SessionBadge
          icon={view.isOnline ? Wifi : CloudOff}
          label={view.isOnline ? "Online" : "Offline"}
          tone={view.isOnline ? "ok" : "warn"}
        />
        <SessionBadge label={`Oczekujace zapisy: ${String(view.pendingWriteCount)}`} />
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
          label="Aktywne wpisy"
          value={String(view.session.totalEntryCount)}
        />
        <SessionMetric
          label="Suma jednostek"
          value={formatSessionQuantity(
            view.session.totalQuantityMilli,
            view.session.quantityPrecisionSnapshot,
            view.session.unitLabelSnapshot
          )}
        />
        <SessionMetric
          label="Suma kg"
          value={formatKilograms(view.session.totalWeightG)}
        />
        <SessionMetric label={amountLabel} value={formatMoney(amountGrosz)} />
      </dl>

      <div className="active-session__facts" aria-label="Informacje o sesji">
        <div>
          <span>Autor</span>
          <strong>{view.createdByName}</strong>
        </div>
        <div>
          <span>Urzadzenie</span>
          <strong>{view.deviceName}</strong>
        </div>
        <div>
          <span>Rewizja</span>
          <strong>{view.session.revision}</strong>
        </div>
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
          <ol className="active-session__entry-list" aria-label="Lista wpisow sesji">
            {sortedEntries.map((entry) => (
              <li key={entry.id} className="active-session__entry">
                <div className="active-session__entry-heading">
                  <strong>{entryTitle(entry)}</strong>
                  <span>{entry.id}</span>
                </div>
                <dl>
                  <div>
                    <dt>Ilosc</dt>
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
                  {entry.createdByName ? (
                    <div>
                      <dt>Autor</dt>
                      <dd>{entry.createdByName}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Synchronizacja</dt>
                    <dd>
                      {entry.pendingSync ? "Oczekuje synchronizacji" : "Potwierdzony"}
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
        ) : (
          <p className="empty-state">Sesja nie ma jeszcze wpisow.</p>
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
    throw new Error("Ilosc sesji musi byc bezpieczna liczba calkowita.");
  }

  if (!Number.isInteger(precision) || precision < 0 || precision > 3) {
    throw new Error("Precyzja ilosci musi byc od 0 do 3.");
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
