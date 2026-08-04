import type { UserRole } from "../domain/identity";

export const REPORT_IDS = [
  "SEASON_SUMMARY",
  "SESSIONS_BY_WORKER",
  "SESSION_ENTRIES",
  "ACCRUALS_BY_WORKER",
  "PAYMENTS_BY_WORKER_AND_DATE",
  "SALES",
  "STOCK",
  "RESULT_AFTER_HARVEST_COST",
  "PAYABLE_SESSIONS",
  "CONFLICTS_AND_REVIEW",
  "IMPORTED_DATA",
  "PICKER_OWN_SUMMARY"
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export type ReportFilterId =
  | "AUTHOR"
  | "BUSINESS_DATE_RANGE"
  | "CONFLICT_STATUS"
  | "DOCUMENT_TYPE"
  | "ENTRY_STATUS"
  | "IMPORT_SOURCE"
  | "ISSUE_STATUS"
  | "PAYMENT_DATE_RANGE"
  | "PAYMENT_STATUS"
  | "SALE_STATUS"
  | "SALE_TYPE"
  | "SEASON"
  | "SESSION"
  | "SESSION_STATUS"
  | "WORKER";

export type ReportSourceId =
  | "appSettings"
  | "harvestEntries"
  | "harvestSessions"
  | "issueReports"
  | "localSyncJournal"
  | "payments"
  | "sales"
  | "seasons"
  | "users"
  | "workers";

export type ReportColumnFormat =
  | "BOOLEAN"
  | "BUSINESS_DATE"
  | "COUNT"
  | "DATETIME"
  | "GRAMS"
  | "GROSZ"
  | "IDENTIFIER"
  | "MILLI_UNITS"
  | "STATUS"
  | "TEXT";

export type ReportColumnDefinition = {
  format: ReportColumnFormat;
  id: string;
  label: string;
};

export type ReportDefinition = {
  audiences: readonly UserRole[];
  columns: readonly ReportColumnDefinition[];
  filters: readonly ReportFilterId[];
  id: ReportId;
  label: string;
  requiredFeatureFlag: "pickerOwnReportExportEnabled" | null;
  sources: readonly ReportSourceId[];
  summationRules: readonly string[];
};

const ADMIN_ONLY = ["ADMIN"] as const satisfies readonly UserRole[];
const PICKER_ONLY = ["PICKER"] as const satisfies readonly UserRole[];

export const REPORT_CATALOG = [
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("season_name", "Sezon", "TEXT"),
      column("season_status", "Status sezonu", "STATUS"),
      column("from_date", "Okres od", "BUSINESS_DATE"),
      column("to_date", "Okres do", "BUSINESS_DATE"),
      column("confirmed_harvest_weight_g", "Zebrano potwierdzone g", "GRAMS"),
      column("sold_weight_g", "Sprzedano g", "GRAMS"),
      column("available_weight_g", "Dostepne g", "GRAMS"),
      column("accrued_grosz", "Naliczono grosze", "GROSZ"),
      column("paid_grosz", "Wyplacono grosze", "GROSZ"),
      column("due_grosz", "Do wyplaty grosze", "GROSZ"),
      column("revenue_grosz", "Przychod grosze", "GROSZ"),
      column("result_after_harvest_cost_grosz", "Wynik po koszcie zbioru grosze", "GROSZ")
    ],
    filters: ["SEASON", "BUSINESS_DATE_RANGE"],
    id: "SEASON_SUMMARY",
    label: "Podsumowanie sezonu",
    requiredFeatureFlag: null,
    sources: ["seasons", "harvestSessions", "payments", "sales", "workers"],
    summationRules: [
      "Potwierdzona masa obejmuje tylko sesje CLOSED i PAID.",
      "Anulowane sesje, sprzedaze i wyplaty nie wchodza do aktywnych sum.",
      "Stan to potwierdzona masa minus podpisany wplyw sprzedazy i korekt.",
      "Wynik po koszcie zbioru to przychod minus naliczenia zbieraczy."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("worker_id", "Id zbieracza", "IDENTIFIER"),
      column("worker_name", "Zbieracz", "TEXT"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("business_date", "Data zbioru", "BUSINESS_DATE"),
      column("status", "Status sesji", "STATUS"),
      column("plan_name", "Plan rozliczenia", "TEXT"),
      column("total_quantity_milli", "Ilosc milli", "MILLI_UNITS"),
      column("total_weight_g", "Masa g", "GRAMS"),
      column("amount_due_grosz", "Naliczenie grosze", "GROSZ"),
      column("payment_id", "Id wyplaty", "IDENTIFIER"),
      column("legacy_import", "Dane importowane", "BOOLEAN")
    ],
    filters: ["SEASON", "WORKER", "BUSINESS_DATE_RANGE", "SESSION_STATUS"],
    id: "SESSIONS_BY_WORKER",
    label: "Sesje wedlug osoby",
    requiredFeatureFlag: null,
    sources: ["seasons", "workers", "harvestSessions"],
    summationRules: [
      "Masa jest sumowana osobno dla aktywnych statusow sesji.",
      "Naliczenia obejmuja tylko CLOSED i PAID z niepusta oficjalna kwota.",
      "Ilosci roznych planow i jednostek nie sa laczone w jedna sume.",
      "CANCELLED jest raportowany liczbowo, ale nie zwieksza masy ani naliczen."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("entry_id", "Id wpisu", "IDENTIFIER"),
      column("sequence_number", "Numer wpisu", "COUNT"),
      column("business_date", "Data zbioru", "BUSINESS_DATE"),
      column("status", "Status wpisu", "STATUS"),
      column("quantity_milli", "Ilosc milli", "MILLI_UNITS"),
      column("weight_g", "Masa g", "GRAMS"),
      column("amount_preview_grosz", "Podglad kwoty grosze", "GROSZ"),
      column("replaces_entry_id", "Zastepuje wpis", "IDENTIFIER"),
      column("cancellation_reason", "Powod anulowania", "TEXT"),
      column("created_device_id", "Id urzadzenia", "IDENTIFIER"),
      column("created_at_device", "Czas urzadzenia", "DATETIME")
    ],
    filters: ["SEASON", "SESSION", "ENTRY_STATUS"],
    id: "SESSION_ENTRIES",
    label: "Wpisy konkretnej sesji",
    requiredFeatureFlag: null,
    sources: ["harvestSessions", "harvestEntries"],
    summationRules: [
      "Sumy wpisow obejmuja tylko status ACTIVE.",
      "Korekty zachowuja lancuch replacesEntryId, a anulowane wpisy pozostaja widoczne.",
      "Kwota wpisu jest podgladem; oficjalna kwota finansowa pochodzi z zamknietej sesji.",
      "Suma kontrolna wpisow jest porownywana z oficjalnymi sumami sesji."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("worker_id", "Id zbieracza", "IDENTIFIER"),
      column("worker_name", "Zbieracz", "TEXT"),
      column("confirmed_session_count", "Liczba naliczonych sesji", "COUNT"),
      column("confirmed_weight_g", "Potwierdzona masa g", "GRAMS"),
      column("accrued_grosz", "Naliczono grosze", "GROSZ"),
      column("paid_grosz", "Wyplacono grosze", "GROSZ"),
      column("remaining_grosz", "Pozostalo grosze", "GROSZ")
    ],
    filters: ["SEASON", "WORKER", "BUSINESS_DATE_RANGE"],
    id: "ACCRUALS_BY_WORKER",
    label: "Naliczenia wedlug osoby",
    requiredFeatureFlag: null,
    sources: ["seasons", "workers", "harvestSessions", "payments"],
    summationRules: [
      "Naliczenia obejmuja sesje CLOSED i PAID wedlug businessDate.",
      "Wyplacono obejmuje tylko aktywne wyplaty powiazanych sesji.",
      "Pozostalo to naliczono minus aktywne wyplaty.",
      "Historyczna kwota sesji jest uzywana bez przeliczenia aktualna stawka."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("payment_id", "Id wyplaty", "IDENTIFIER"),
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("worker_id", "Id zbieracza", "IDENTIFIER"),
      column("worker_name", "Zbieracz", "TEXT"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("session_business_date", "Data sesji", "BUSINESS_DATE"),
      column("paid_business_date", "Data wyplaty", "BUSINESS_DATE"),
      column("payment_method", "Metoda", "TEXT"),
      column("status", "Status wyplaty", "STATUS"),
      column("amount_grosz", "Kwota grosze", "GROSZ"),
      column("cancellation_reason", "Powod anulowania", "TEXT"),
      column("legacy_import", "Dane importowane", "BOOLEAN")
    ],
    filters: ["SEASON", "WORKER", "PAYMENT_DATE_RANGE", "PAYMENT_STATUS"],
    id: "PAYMENTS_BY_WORKER_AND_DATE",
    label: "Wyplaty wedlug osoby i daty",
    requiredFeatureFlag: null,
    sources: ["seasons", "workers", "harvestSessions", "payments"],
    summationRules: [
      "Aktywna suma wyplat obejmuje tylko status ACTIVE wedlug paidBusinessDate.",
      "CANCELLED jest pokazany i sumowany oddzielnie, bez zmniejszania salda drugi raz.",
      "Kwota pochodzi z dokumentu wyplaty i nie jest ponownie liczona z aktualnej stawki."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("sale_id", "Id dokumentu", "IDENTIFIER"),
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("business_date", "Data sprzedazy", "BUSINESS_DATE"),
      column("entry_type", "Typ dokumentu", "STATUS"),
      column("correction_direction", "Kierunek korekty", "STATUS"),
      column("status", "Status", "STATUS"),
      column("weight_g", "Masa g", "GRAMS"),
      column("price_grosz_per_kg", "Cena grosze za kg", "GROSZ"),
      column("total_grosz", "Przychod grosze", "GROSZ"),
      column("created_by", "Id autora", "IDENTIFIER"),
      column("note", "Notatka", "TEXT"),
      column("cancellation_reason", "Powod anulowania", "TEXT"),
      column("legacy_import", "Dane importowane", "BOOLEAN")
    ],
    filters: ["SEASON", "BUSINESS_DATE_RANGE", "SALE_TYPE", "SALE_STATUS", "AUTHOR"],
    id: "SALES",
    label: "Sprzedaz",
    requiredFeatureFlag: null,
    sources: ["seasons", "sales", "users"],
    summationRules: [
      "Aktywne zwykle sprzedaze zwiekszaja sprzedana mase i przychod.",
      "Korekty sa sumowane ze znakiem wynikajacym z correctionDirection.",
      "CANCELLED pozostaje w raporcie, ale ma zerowy aktywny wplyw.",
      "Masa, cena i kwota z dokumentu sa zachowane bez ponownego przeliczenia."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("from_date", "Okres od", "BUSINESS_DATE"),
      column("to_date", "Okres do", "BUSINESS_DATE"),
      column("confirmed_harvest_weight_g", "Potwierdzony zbior g", "GRAMS"),
      column("ordinary_sale_weight_g", "Zwykla sprzedaz g", "GRAMS"),
      column("correction_increase_weight_g", "Korekty zwiekszajace g", "GRAMS"),
      column("correction_decrease_weight_g", "Korekty zmniejszajace g", "GRAMS"),
      column("available_weight_g", "Dostepny stan g", "GRAMS"),
      column("source_document_count", "Liczba dokumentow zrodlowych", "COUNT")
    ],
    filters: ["SEASON", "BUSINESS_DATE_RANGE"],
    id: "STOCK",
    label: "Stan kilogramow",
    requiredFeatureFlag: null,
    sources: ["harvestSessions", "sales"],
    summationRules: [
      "Zrodlem stanu sa tylko sesje CLOSED lub PAID oraz aktywna sprzedaz i korekty.",
      "Wyplaty i otwarte, anulowane lub bezwagowe sesje nie zmieniaja stanu.",
      "Dostepny stan to zbior plus korekty zwiekszajace minus sprzedaz i korekty zmniejszajace."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("from_date", "Okres od", "BUSINESS_DATE"),
      column("to_date", "Okres do", "BUSINESS_DATE"),
      column("revenue_grosz", "Przychod grosze", "GROSZ"),
      column("accrued_grosz", "Koszt zbioru grosze", "GROSZ"),
      column("result_after_harvest_cost_grosz", "Wynik po koszcie zbioru grosze", "GROSZ")
    ],
    filters: ["SEASON", "BUSINESS_DATE_RANGE"],
    id: "RESULT_AFTER_HARVEST_COST",
    label: "Wynik po koszcie zbioru",
    requiredFeatureFlag: null,
    sources: ["harvestSessions", "sales"],
    summationRules: [
      "Przychod obejmuje aktywna sprzedaz i podpisany wplyw korekt.",
      "Koszt zbioru obejmuje amountDueGrosz sesji CLOSED i PAID.",
      "Wynik to przychod minus koszt zbioru; nie jest nazywany zyskiem i nie zawiera innych kosztow."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("worker_id", "Id zbieracza", "IDENTIFIER"),
      column("worker_name", "Zbieracz", "TEXT"),
      column("business_date", "Data sesji", "BUSINESS_DATE"),
      column("closed_at", "Czas zamkniecia", "DATETIME"),
      column("total_weight_g", "Masa g", "GRAMS"),
      column("amount_due_grosz", "Do wyplaty grosze", "GROSZ"),
      column("calculation_version", "Wersja obliczen", "TEXT")
    ],
    filters: ["SEASON", "WORKER", "BUSINESS_DATE_RANGE"],
    id: "PAYABLE_SESSIONS",
    label: "Lista sesji do wyplaty",
    requiredFeatureFlag: null,
    sources: ["seasons", "workers", "harvestSessions", "payments"],
    summationRules: [
      "Lista obejmuje tylko CLOSED z niepusta dodatnia amountDueGrosz i bez aktywnej wyplaty.",
      "PAID, CANCELLED, OPEN i REVIEW_REQUIRED nie sa gotowe do nowej wyplaty.",
      "Suma do wyplaty jest suma historycznych amountDueGrosz widocznych sesji."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("source_type", "Typ zrodla", "STATUS"),
      column("source_id", "Id zrodla", "IDENTIFIER"),
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("worker_id", "Id zbieracza", "IDENTIFIER"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("status", "Status", "STATUS"),
      column("reason", "Powod", "TEXT"),
      column("created_at", "Czas wykrycia", "DATETIME"),
      column("device_id", "Id urzadzenia", "IDENTIFIER")
    ],
    filters: ["SEASON", "WORKER", "SESSION_STATUS", "ISSUE_STATUS", "CONFLICT_STATUS"],
    id: "CONFLICTS_AND_REVIEW",
    label: "Konflikty i sesje wymagajace przegladu",
    requiredFeatureFlag: null,
    sources: ["harvestSessions", "issueReports", "localSyncJournal"],
    summationRules: [
      "Kazdy problem jest liczony raz wedlug stabilnego id zrodla i typu.",
      "REVIEW_REQUIRED pozostaje otwarte do jawnego rozstrzygniecia.",
      "Konflikty lokalne sa widoczne tylko na urzadzeniu posiadajacym wpis dziennika synchronizacji."
    ]
  },
  {
    audiences: ADMIN_ONLY,
    columns: [
      column("source_collection", "Kolekcja", "TEXT"),
      column("document_id", "Id dokumentu", "IDENTIFIER"),
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("business_date", "Data biznesowa", "BUSINESS_DATE"),
      column("legacy_source", "Zrodlo importu", "TEXT"),
      column("legacy_source_rows", "Wiersze zrodlowe", "TEXT"),
      column("status", "Status dokumentu", "STATUS"),
      column("weight_g", "Masa g", "GRAMS"),
      column("amount_grosz", "Kwota grosze", "GROSZ"),
      column("validation_state", "Stan walidacji", "STATUS")
    ],
    filters: ["SEASON", "IMPORT_SOURCE", "DOCUMENT_TYPE", "BUSINESS_DATE_RANGE"],
    id: "IMPORTED_DATA",
    label: "Dane importowane",
    requiredFeatureFlag: null,
    sources: ["harvestSessions", "harvestEntries", "payments", "sales"],
    summationRules: [
      "Raport obejmuje wylacznie dokumenty jawnie oznaczone jako legacyImport lub ze zrodlem legacy.",
      "Sumy sa rozdzielone wedlug kolekcji i statusu, a nastepnie uzgadniane z raportami domenowymi.",
      "Bledne i pominiete wiersze sa liczone oddzielnie i nie sa doliczane do sum zaakceptowanych."
    ]
  },
  {
    audiences: PICKER_ONLY,
    columns: [
      column("record_type", "Typ rekordu", "STATUS"),
      column("season_id", "Id sezonu", "IDENTIFIER"),
      column("session_id", "Id sesji", "IDENTIFIER"),
      column("business_date", "Data sesji", "BUSINESS_DATE"),
      column("session_status", "Status sesji", "STATUS"),
      column("plan_name", "Plan", "TEXT"),
      column("quantity_milli", "Ilosc milli", "MILLI_UNITS"),
      column("weight_g", "Masa g", "GRAMS"),
      column("accrued_grosz", "Naliczenie grosze", "GROSZ"),
      column("payment_id", "Id wyplaty", "IDENTIFIER"),
      column("paid_business_date", "Data wyplaty", "BUSINESS_DATE"),
      column("payment_status", "Status wyplaty", "STATUS"),
      column("paid_grosz", "Wyplata grosze", "GROSZ")
    ],
    filters: ["SEASON", "BUSINESS_DATE_RANGE"],
    id: "PICKER_OWN_SUMMARY",
    label: "Wlasne zestawienie zbieracza",
    requiredFeatureFlag: "pickerOwnReportExportEnabled",
    sources: ["appSettings", "seasons", "harvestSessions", "payments"],
    summationRules: [
      "Zakres jest zawsze ograniczony do workerId z profilu zalogowanego pickera.",
      "Naliczono obejmuje CLOSED i PAID, a wyplacono tylko aktywne wyplaty.",
      "Pozostalo to naliczono minus aktywne wyplaty; anulowane wyplaty sa pokazane osobno.",
      "Eksport z cache jest jawnie oznaczony jako niepelny."
    ]
  }
] as const satisfies readonly ReportDefinition[];

export function reportDefinition(reportId: ReportId): ReportDefinition {
  const definition = REPORT_CATALOG.find((report) => report.id === reportId);

  if (!definition) {
    throw new Error(`Brak definicji raportu ${reportId}.`);
  }

  return definition;
}

export function reportsForRole(role: UserRole): ReportDefinition[] {
  return REPORT_CATALOG.filter((report) =>
    (report.audiences as readonly UserRole[]).includes(role)
  );
}

function column(
  id: string,
  label: string,
  format: ReportColumnFormat
): ReportColumnDefinition {
  return { format, id, label };
}
