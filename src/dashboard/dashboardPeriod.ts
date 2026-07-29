import { formatBusinessDate } from "../domain/format";

export const DASHBOARD_PERIOD_PRESETS = [
  "TODAY",
  "CURRENT_WEEK",
  "CURRENT_MONTH",
  "SEASON",
  "CUSTOM"
] as const;

export type DashboardPeriodPreset = (typeof DASHBOARD_PERIOD_PRESETS)[number];

export type DashboardPeriodSelection = {
  customFromDate: string;
  customToDate: string;
  preset: DashboardPeriodPreset;
};

export type ResolvedDashboardPeriod = {
  dateBasis: "BUSINESS_DATE";
  fromDate: string | null;
  label: string;
  preset: DashboardPeriodPreset;
  toDate: string | null;
};

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodSelection = {
  customFromDate: "",
  customToDate: "",
  preset: "SEASON"
};

export function currentWarsawBusinessDate(now = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Nie mozna wyznaczyc daty biznesowej z nieprawidlowego czasu.");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric"
  }).formatToParts(now);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");

  return `${year}-${month}-${day}`;
}

export function dashboardPeriodSelectionError(
  selection: DashboardPeriodSelection
): string | null {
  if (!DASHBOARD_PERIOD_PRESETS.includes(selection.preset)) {
    return "Wybierz poprawny okres.";
  }

  if (selection.preset !== "CUSTOM") {
    return null;
  }

  if (
    !isBusinessDate(selection.customFromDate) ||
    !isBusinessDate(selection.customToDate)
  ) {
    return "Podaj poczatek i koniec wlasnego zakresu.";
  }

  if (selection.customFromDate > selection.customToDate) {
    return "Data poczatkowa nie moze byc pozniejsza niz koncowa.";
  }

  return null;
}

export function resolveDashboardPeriod(
  selection: DashboardPeriodSelection,
  context: {
    seasonEndDate?: string | null;
    seasonStartDate?: string | null;
    todayBusinessDate: string;
  }
): ResolvedDashboardPeriod {
  const error = dashboardPeriodSelectionError(selection);
  if (error) {
    throw new Error(error);
  }

  assertBusinessDate(context.todayBusinessDate);
  assertOptionalBusinessDate(context.seasonStartDate);
  assertOptionalBusinessDate(context.seasonEndDate);

  let fromDate: string | null;
  let toDate: string | null;

  switch (selection.preset) {
    case "TODAY":
      fromDate = context.todayBusinessDate;
      toDate = context.todayBusinessDate;
      break;
    case "CURRENT_WEEK":
      fromDate = startOfIsoWeek(context.todayBusinessDate);
      toDate = addBusinessDays(fromDate, 6);
      break;
    case "CURRENT_MONTH":
      fromDate = `${context.todayBusinessDate.slice(0, 7)}-01`;
      toDate = endOfMonth(context.todayBusinessDate);
      break;
    case "SEASON":
      fromDate = context.seasonStartDate ?? null;
      toDate = context.seasonEndDate ?? null;
      break;
    case "CUSTOM":
      fromDate = selection.customFromDate;
      toDate = selection.customToDate;
      break;
  }

  return {
    dateBasis: "BUSINESS_DATE",
    fromDate,
    label: periodLabel(selection.preset, fromDate, toDate),
    preset: selection.preset,
    toDate
  };
}

export function businessDateMatchesPeriod(
  businessDate: string,
  period: Pick<ResolvedDashboardPeriod, "fromDate" | "toDate">
): boolean {
  assertBusinessDate(businessDate);

  return (
    (period.fromDate === null || businessDate >= period.fromDate) &&
    (period.toDate === null || businessDate <= period.toDate)
  );
}

export function dashboardPeriodPresetLabel(preset: DashboardPeriodPreset): string {
  switch (preset) {
    case "TODAY":
      return "Dzisiaj";
    case "CURRENT_WEEK":
      return "Biezacy tydzien";
    case "CURRENT_MONTH":
      return "Biezacy miesiac";
    case "SEASON":
      return "Caly sezon";
    case "CUSTOM":
      return "Wlasny zakres";
  }
}

export function selectionForDashboardPeriodPreset(
  current: DashboardPeriodSelection,
  preset: DashboardPeriodPreset,
  todayBusinessDate: string
): DashboardPeriodSelection {
  assertBusinessDate(todayBusinessDate);

  return {
    customFromDate:
      preset === "CUSTOM" && !current.customFromDate
        ? todayBusinessDate
        : current.customFromDate,
    customToDate:
      preset === "CUSTOM" && !current.customToDate
        ? todayBusinessDate
        : current.customToDate,
    preset
  };
}

function periodLabel(
  preset: DashboardPeriodPreset,
  fromDate: string | null,
  toDate: string | null
): string {
  const presetLabel = dashboardPeriodPresetLabel(preset);

  if (fromDate === null && toDate === null) {
    return presetLabel;
  }

  if (fromDate !== null && fromDate === toDate) {
    return `${presetLabel}: ${formatBusinessDate(fromDate)}`;
  }

  if (fromDate !== null && toDate !== null) {
    return `${presetLabel}: ${formatBusinessDate(fromDate)} - ${formatBusinessDate(
      toDate
    )}`;
  }

  if (fromDate !== null) {
    return `${presetLabel}: od ${formatBusinessDate(fromDate)}`;
  }

  return toDate === null
    ? presetLabel
    : `${presetLabel}: do ${formatBusinessDate(toDate)}`;
}

function startOfIsoWeek(businessDate: string): string {
  const date = businessDateAsUtcDate(businessDate);
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDay - 1));
  return date.toISOString().slice(0, 10);
}

function endOfMonth(businessDate: string): string {
  const year = Number(businessDate.slice(0, 4));
  const month = Number(businessDate.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function addBusinessDays(businessDate: string, days: number): string {
  const date = businessDateAsUtcDate(businessDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function businessDateAsUtcDate(value: string): Date {
  assertBusinessDate(value);
  return new Date(`${value}T00:00:00.000Z`);
}

function assertOptionalBusinessDate(value: string | null | undefined): void {
  if (value !== null && value !== undefined) {
    assertBusinessDate(value);
  }
}

function assertBusinessDate(value: string): void {
  if (!isBusinessDate(value)) {
    throw new Error(`Nieprawidlowa data biznesowa: ${value}.`);
  }
}

function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error("Nie mozna wyznaczyc daty biznesowej Europe/Warsaw.");
  }

  return value;
}
