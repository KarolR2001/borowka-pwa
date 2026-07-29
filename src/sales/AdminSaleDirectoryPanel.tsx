import { Ban, Eye, History, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
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
  const [reloadKey, setReloadKey] = useState(0);
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
  }, [api, authState, env, isAdmin, isOnline, reloadKey]);

  const sales = useMemo(() => state.result?.sales ?? [], [state.result]);
  const filteredSales = useMemo(() => filterAdminSales(sales, filters), [filters, sales]);
  const summary = useMemo(() => summarizeAdminSales(filteredSales), [filteredSales]);
  const selectedSale = sales.find((sale) => sale.id === selectedSaleId) ?? null;

  if (!isAdmin) {
    return (
      <section className="access-notice" aria-label="Historia sprzedazy">
        <History aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Historia sprzedazy</p>
          <p>Lista finansowa jest dostepna tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sale-directory" aria-labelledby="sale-directory-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Historia i kontrola</p>
          <h3 id="sale-directory-title">Lista sprzedazy</h3>
          <p className="panel-detail">
            {state.status === "LOADING"
              ? "Pobieranie aktualnych danych z serwera."
              : "Zwykle sprzedaze, korekty, anulowania i import historyczny."}
          </p>
        </div>
        <button
          className="secondary-button icon-button"
          disabled={!isOnline || state.status === "LOADING"}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez historie sprzedazy"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
          <span className="sr-only">Odswiez historie sprzedazy</span>
        </button>
      </header>

      <SaleDirectoryFilterControls
        filters={filters}
        onChange={setFilters}
        sales={sales}
      />

      <div className="directory-summary" aria-label="Podsumowanie listy sprzedazy">
        <DirectoryStat label="Widoczne" value={String(summary.totalCount)} />
        <DirectoryStat label="Aktywne" value={String(summary.activeCount)} />
        <DirectoryStat
          label="Przychod aktywny"
          value={formatMoney(summary.activeRevenueGrosz)}
        />
        <DirectoryStat label="Korekty" value={String(summary.correctionCount)} />
        <DirectoryStat label="Anulowane" value={String(summary.cancelledCount)} />
        <DirectoryStat label="Importowane" value={String(summary.importedCount)} />
      </div>

      {!isOnline ? (
        <p className="form-message form-message--warning">
          Historia sprzedazy wymaga polaczenia z internetem.
        </p>
      ) : null}
      {state.status === "ERROR" && isOnline ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac aktualnej historii sprzedazy.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidSaleCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.invalidUserCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagajace kontroli: sprzedaz {state.result.invalidSaleCount}, sezony{" "}
          {state.result.invalidSeasonCount}, autorzy {state.result.invalidUserCount}.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii sprzedazy.</p>
      ) : null}
      {state.status !== "LOADING" && filteredSales.length === 0 ? (
        <p className="empty-state">Brak operacji spelniajacych filtry.</p>
      ) : null}
      {filteredSales.length > 0 ? (
        <SaleDirectoryTable onOpen={setSelectedSaleId} sales={filteredSales} />
      ) : null}
      {selectedSale ? (
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
    <div className="sale-directory-filters" aria-label="Filtry listy sprzedazy">
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
          <option value="SALE">Zwykla sprzedaz</option>
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
            <th scope="col">Przychod</th>
            <th scope="col">Typ</th>
            <th scope="col">Status</th>
            <th scope="col">Autor</th>
            <th scope="col">Notatka</th>
            <th scope="col">Szczegoly</th>
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
                  className="secondary-button icon-button"
                  onClick={() => {
                    onOpen(sale.id);
                  }}
                  title={`Otworz szczegoly operacji ${sale.id}`}
                  type="button"
                >
                  <Eye aria-hidden="true" size={18} />
                  <span className="sr-only">Otworz szczegoly operacji {sale.id}</span>
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
          <p className="eyebrow">Szczegoly operacji</p>
          <h3 id="sale-directory-details-title">
            {formatBusinessDate(sale.businessDate)}
          </h3>
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
      <dl className="sale-directory-details__grid">
        <Detail label="Id operacji" value={sale.id} />
        <Detail label="Sezon" value={sale.seasonName} />
        <Detail label="Data" value={formatBusinessDate(sale.businessDate)} />
        <Detail label="Typ" value={saleEntryTypeLabel(sale)} />
        <Detail label="Status" value={saleStatusLabel(sale.status)} />
        <Detail label="Masa" value={formatKilograms(sale.weightG)} />
        <Detail label="Cena za kg" value={formatMoney(sale.priceGroszPerKg)} />
        <Detail label="Kwota dokumentu" value={formatMoney(sale.totalGrosz)} />
        <Detail
          label="Wplyw na przychod"
          value={formatSignedMoney(documentRevenueImpact(sale))}
        />
        <Detail label="Wersja obliczenia" value={sale.calculationVersion} />
        <Detail label="Autor" value={`${sale.authorName} (${sale.createdBy})`} />
        <Detail label="Czas serwera" value={formatTimestamp(sale.createdAtIso)} />
        <Detail label="Notatka" value={sale.note ?? "brak"} />
        <Detail label="Import historyczny" value={sale.legacyImport ? "Tak" : "Nie"} />
        {sale.legacySourceRow ? (
          <Detail label="Wiersz zrodlowy" value={sale.legacySourceRow} />
        ) : null}
        {sale.status === "CANCELLED" ? (
          <>
            <Detail label="Anulowal" value={sale.cancelledByName ?? "brak"} />
            <Detail
              label="Czas anulowania"
              value={formatTimestamp(sale.cancelledAtIso)}
            />
            <Detail label="Powod anulowania" value={sale.cancellationReason ?? "brak"} />
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
          Przejdz do anulowania
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
      {sale.legacyImport ? <span className="status-badge">Importowana</span> : null}
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
    return "Zwykla sprzedaz";
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
