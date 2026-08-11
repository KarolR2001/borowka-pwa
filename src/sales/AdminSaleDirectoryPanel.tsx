import { Ban, Eye, History, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { RecordDialog } from "../ui/RecordDialog";
import {
  activeSaleRevenueImpact,
  defaultSaleDirectoryFilters,
  filterAdminSales,
  listAdminSales,
  summarizeAdminSales,
  type AdminSaleDirectoryItem,
  type AdminSaleDirectoryResult,
  type SaleDirectoryFilters
} from "./saleDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminSaleDirectoryApi = {
  list: typeof listAdminSales;
};

export const defaultAdminSaleDirectoryApi: AdminSaleDirectoryApi = {
  list: listAdminSales
};

type DirectoryState =
  | { result: AdminSaleDirectoryResult | null; status: "IDLE" | "LOADING" }
  | { result: AdminSaleDirectoryResult; status: "READY" }
  | { result: AdminSaleDirectoryResult | null; status: "ERROR" };

const initialState: DirectoryState = {
  result: null,
  status: "IDLE"
};

export function AdminSaleDirectoryPanel({
  api = defaultAdminSaleDirectoryApi,
  authState,
  env,
  isOnline,
  onRequestCancellation
}: {
  api?: AdminSaleDirectoryApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  onRequestCancellation: (saleId: string) => void;
}) {
  const [state, setState] = useState<DirectoryState>(initialState);
  const [filters, setFilters] = useState<SaleDirectoryFilters>(
    defaultSaleDirectoryFilters
  );
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    if (!isOnline) {
      setState((current) => ({ result: current.result, status: "ERROR" }));
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void api
      .list(env, authState.profile)
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
  }, [api, authState, env, isAdmin, isOnline]);

  const sales = useMemo(() => state.result?.sales ?? [], [state.result]);
  const filteredSales = useMemo(() => filterAdminSales(sales, filters), [filters, sales]);
  const summary = useMemo(() => summarizeAdminSales(filteredSales), [filteredSales]);
  const selectedSale = sales.find((sale) => sale.id === selectedSaleId) ?? null;

  if (!isAdmin) {
    return (
      <section className="access-notice" aria-label="Historia sprzedaży">
        <History aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Historia sprzedaży</p>
          <p>Lista finansowa jest dostępna tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sale-directory" aria-label="Lista sprzedaży">
      <CollapsibleFilters>
        <SaleDirectoryFilterControls
          filters={filters}
          onChange={setFilters}
          sales={sales}
        />
      </CollapsibleFilters>

      <div className="directory-summary" aria-label="Podsumowanie listy sprzedaży">
        <DirectoryStat label="Widoczne" value={String(summary.totalCount)} />
        <DirectoryStat label="Aktywne" value={String(summary.activeCount)} />
        <DirectoryStat
          label="Przychód aktywny"
          value={formatMoney(summary.activeRevenueGrosz)}
        />
        <DirectoryStat label="Korekty" value={String(summary.correctionCount)} />
        <DirectoryStat label="Anulowane" value={String(summary.cancelledCount)} />
        <DirectoryStat label="Importowane" value={String(summary.importedCount)} />
      </div>

      {state.status === "ERROR" && isOnline ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać aktualnej historii sprzedaży.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidSaleCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.invalidUserCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagające kontroli: sprzedaż {state.result.invalidSaleCount}, sezony{" "}
          {state.result.invalidSeasonCount}, autorzy {state.result.invalidUserCount}.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii sprzedaży.</p>
      ) : null}
      {state.status !== "LOADING" && filteredSales.length === 0 ? (
        <p className="empty-state">Brak operacji spełniających filtry.</p>
      ) : null}
      {filteredSales.length > 0 ? (
        <SaleDirectoryTable onOpen={setSelectedSaleId} sales={filteredSales} />
      ) : null}
      {selectedSale ? (
        <RecordDialog
          label="Szczegóły sprzedaży"
          onClose={() => {
            setSelectedSaleId(null);
          }}
        >
          <SaleDirectoryDetails
            onClose={() => {
              setSelectedSaleId(null);
            }}
            onRequestCancellation={(saleId) => {
              setSelectedSaleId(null);
              onRequestCancellation(saleId);
            }}
            sale={selectedSale}
          />
        </RecordDialog>
      ) : null}
    </section>
  );
}

function SaleDirectoryFilterControls({
  filters,
  onChange,
  sales
}: {
  filters: SaleDirectoryFilters;
  onChange: (filters: SaleDirectoryFilters) => void;
  sales: readonly AdminSaleDirectoryItem[];
}) {
  const seasons = uniqueOptions(sales, "seasonId", "seasonName");
  const authors = uniqueOptions(sales, "createdBy", "authorName");

  return (
    <div className="sale-directory-filters" aria-label="Filtry listy sprzedaży">
      <label className="field">
        <span>Sezon</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, seasonId: event.target.value });
          }}
          value={filters.seasonId}
        >
          <option value="">Wszystkie sezony</option>
          {seasons.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Typ</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              entryType: event.target.value as SaleDirectoryFilters["entryType"]
            });
          }}
          value={filters.entryType}
        >
          <option value="ALL">Wszystkie typy</option>
          <option value="SALE">Zwykla sprzedaż</option>
          <option value="CORRECTION">Korekta</option>
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              status: event.target.value as SaleDirectoryFilters["status"]
            });
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie statusy</option>
          <option value="ACTIVE">Aktywne</option>
          <option value="CANCELLED">Anulowane</option>
        </select>
      </label>
      <label className="field">
        <span>Autor</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, authorUid: event.target.value });
          }}
          value={filters.authorUid}
        >
          <option value="">Wszyscy autorzy</option>
          {authors.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Data od</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, fromDate: event.target.value });
          }}
          type="date"
          value={filters.fromDate}
        />
      </label>
      <label className="field">
        <span>Data do</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, toDate: event.target.value });
          }}
          type="date"
          value={filters.toDate}
        />
      </label>
    </div>
  );
}

function SaleDirectoryTable({
  onOpen,
  sales
}: {
  onOpen: (saleId: string) => void;
  sales: readonly AdminSaleDirectoryItem[];
}) {
  return (
    <div className="directory-table-wrap">
      <table className="directory-table sale-directory-table">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Masa</th>
            <th scope="col">Cena / kg</th>
            <th scope="col">Przychód</th>
            <th scope="col">Typ</th>
            <th scope="col">Status</th>
            <th scope="col">Autor</th>
            <th scope="col">Notatka</th>
            <th scope="col">Szczegóły</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>
                {formatBusinessDate(sale.businessDate)}
                <span className="directory-cell-note">{sale.seasonName}</span>
              </td>
              <td>{formatKilograms(sale.weightG)}</td>
              <td>{formatMoney(sale.priceGroszPerKg)}</td>
              <td>{formatSignedMoney(documentRevenueImpact(sale))}</td>
              <td>{saleEntryTypeLabel(sale)}</td>
              <td>
                <SaleStatusLabels sale={sale} />
              </td>
              <td>{sale.authorName}</td>
              <td title={sale.note ?? undefined}>{shortenNote(sale.note)}</td>
              <td>
                <button
                  aria-label={`Otwórz szczegóły: ${saleEntryTypeLabel(sale)} z ${formatBusinessDate(sale.businessDate)}`}
                  className="secondary-button icon-button"
                  onClick={() => {
                    onOpen(sale.id);
                  }}
                  title="Otwórz szczegóły operacji"
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

function SaleDirectoryDetails({
  onClose,
  onRequestCancellation,
  sale
}: {
  onClose: () => void;
  onRequestCancellation: (saleId: string) => void;
  sale: AdminSaleDirectoryItem;
}) {
  return (
    <section
      className="sale-directory-details"
      aria-labelledby="sale-directory-details-title"
    >
      <header className="sale-directory-details__header">
        <div>
          <p className="eyebrow">Szczegóły operacji</p>
          <h3 id="sale-directory-details-title">
            {formatBusinessDate(sale.businessDate)}
          </h3>
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
      <dl className="sale-directory-details__grid">
        <Detail label="Sezon" value={sale.seasonName} />
        <Detail label="Data" value={formatBusinessDate(sale.businessDate)} />
        <Detail label="Typ" value={saleEntryTypeLabel(sale)} />
        <Detail label="Status" value={saleStatusLabel(sale.status)} />
        <Detail label="Masa" value={formatKilograms(sale.weightG)} />
        <Detail label="Cena za kg" value={formatMoney(sale.priceGroszPerKg)} />
        <Detail label="Kwota dokumentu" value={formatMoney(sale.totalGrosz)} />
        <Detail
          label="Wpływ na przychód"
          value={formatSignedMoney(documentRevenueImpact(sale))}
        />
        <Detail label="Autor" value={sale.authorName} />
        <Detail label="Godzina zapisu" value={formatTimestamp(sale.createdAtIso)} />
        <Detail label="Notatka" value={sale.note ?? "brak"} />
        {sale.status === "CANCELLED" ? (
          <>
            <Detail label="Anulował" value={sale.cancelledByName ?? "brak"} />
            <Detail
              label="Czas anulowania"
              value={formatTimestamp(sale.cancelledAtIso)}
            />
            <Detail label="Powód anulowania" value={sale.cancellationReason ?? "brak"} />
          </>
        ) : null}
      </dl>
      {sale.status === "ACTIVE" ? (
        <button
          className="secondary-button"
          onClick={() => {
            onRequestCancellation(sale.id);
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

function SaleStatusLabels({ sale }: { sale: AdminSaleDirectoryItem }) {
  return (
    <span className="payment-directory-statuses">
      <span
        className={`status-badge ${
          sale.status === "ACTIVE" ? "status-badge--active" : ""
        }`}
      >
        {saleStatusLabel(sale.status)}
      </span>
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
  sales: readonly AdminSaleDirectoryItem[],
  valueKey: "createdBy" | "seasonId",
  labelKey: "authorName" | "seasonName"
): { label: string; value: string }[] {
  return Array.from(
    new Map(
      sales.map((sale) => [
        sale[valueKey],
        { label: sale[labelKey], value: sale[valueKey] }
      ])
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label, "pl"));
}

function documentRevenueImpact(sale: AdminSaleDirectoryItem): number {
  return activeSaleRevenueImpact({ ...sale, status: "ACTIVE" });
}

function saleEntryTypeLabel(sale: AdminSaleDirectoryItem): string {
  if (sale.entryType === "SALE") {
    return "Zwykla sprzedaż";
  }

  return sale.correctionDirection === "INCREASE_STOCK"
    ? "Korekta: zwrot do stanu"
    : "Korekta: dodatkowy rozchod";
}

function saleStatusLabel(status: AdminSaleDirectoryItem["status"]): string {
  return status === "ACTIVE" ? "Aktywna" : "Anulowana";
}

function shortenNote(note: string | null): string {
  if (!note) {
    return "brak";
  }

  return note.length > 48 ? `${note.slice(0, 45)}...` : note;
}

function formatSignedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "brak";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pl-PL");
}
