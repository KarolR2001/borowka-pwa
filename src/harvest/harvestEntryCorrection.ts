import type { UserProfile } from "../domain/identity";
import {
  normalizeHarvestEntryId,
  normalizeSequenceNumber
} from "./harvestEntryIdempotency";
import { isQuantityAllowedByPrecision } from "./harvestEntryValidation";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type CorrectableHarvestEntryStatus = "ACTIVE" | "CANCELLED";

export type CorrectableHarvestEntry = {
  id: string;
  sequenceNumber: number;
  sessionId: string;
  seasonId: string;
  workerId: string;
  businessDate: string;
  status: CorrectableHarvestEntryStatus;
  pendingSync: boolean;
  createdBy: string;
  createdDeviceId: string;
  quantityMilli: number;
  weightG: number | null;
};

export type HarvestEntryCorrectionValues = {
  quantityMilli: number;
  weightG: number | null;
};

export type HarvestEntryReplacementIdentity = {
  id: string;
  sequenceNumber: number;
};

export type PrepareHarvestEntryCorrectionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entry: CorrectableHarvestEntry;
  currentDeviceId: string;
  correctedValues: HarvestEntryCorrectionValues;
  replacementIdentity?: HarvestEntryReplacementIdentity | null;
  cancellationReason?: string | null;
};

export type LocalHarvestEntryUpdate = {
  type: "UPDATE_LOCAL_ENTRY";
  entryId: string;
  updatedEntry: CorrectableHarvestEntry & {
    correctionLabel: string;
  };
};

export type ConfirmedHarvestEntryReplacement = {
  type: "CANCEL_AND_REPLACE_CONFIRMED_ENTRY";
  cancelledEntry: CorrectableHarvestEntry & {
    status: "CANCELLED";
    cancellationReason: string;
    cancelledBy: string;
  };
  replacementEntry: CorrectableHarvestEntry & {
    status: "ACTIVE";
    pendingSync: true;
    replacesEntryId: string;
    correctionLabel: string;
  };
};

export type PreparedHarvestEntryCorrection =
  LocalHarvestEntryUpdate | ConfirmedHarvestEntryReplacement;

export function prepareHarvestEntryCorrection(
  input: PrepareHarvestEntryCorrectionInput
): PreparedHarvestEntryCorrection {
  assertEntryCanBeCorrected(input);

  const correctedValues = normalizeCorrectionValues(input.correctedValues, input.session);

  if (input.entry.pendingSync) {
    return {
      type: "UPDATE_LOCAL_ENTRY",
      entryId: input.entry.id,
      updatedEntry: {
        ...input.entry,
        quantityMilli: correctedValues.quantityMilli,
        weightG: correctedValues.weightG,
        pendingSync: true,
        correctionLabel: "Poprawiono lokalnie"
      }
    };
  }

  const replacementIdentity = normalizeReplacementIdentity(
    input.replacementIdentity,
    input.entry.id
  );
  const cancellationReason = normalizeCancellationReason(input.cancellationReason);

  return {
    type: "CANCEL_AND_REPLACE_CONFIRMED_ENTRY",
    cancelledEntry: {
      ...input.entry,
      status: "CANCELLED",
      cancellationReason,
      cancelledBy: input.actorProfile.uid
    },
    replacementEntry: {
      ...input.entry,
      id: replacementIdentity.id,
      sequenceNumber: replacementIdentity.sequenceNumber,
      status: "ACTIVE",
      pendingSync: true,
      createdBy: input.actorProfile.uid,
      createdDeviceId: normalizeRequiredText(
        input.currentDeviceId,
        "Korekta wymaga identyfikatora urzadzenia."
      ),
      quantityMilli: correctedValues.quantityMilli,
      weightG: correctedValues.weightG,
      replacesEntryId: input.entry.id,
      correctionLabel: `Korekta wpisu #${String(input.entry.sequenceNumber)}`
    }
  };
}

export function canActorEditLocalHarvestEntry({
  actorProfile,
  session,
  entry,
  currentDeviceId
}: Pick<
  PrepareHarvestEntryCorrectionInput,
  "actorProfile" | "session" | "entry" | "currentDeviceId"
>): boolean {
  try {
    assertOpenSession(session);
    assertEntryMatchesSession(entry, session);
    assertActiveEntry(entry);
    assertCorrectionDevice(entry, session, currentDeviceId);

    if (!entry.pendingSync) {
      return false;
    }

    return actorProfile.role === "ADMIN" || entry.createdBy === actorProfile.uid;
  } catch {
    return false;
  }
}

function assertEntryCanBeCorrected(input: PrepareHarvestEntryCorrectionInput): void {
  assertOpenSession(input.session);
  assertEntryMatchesSession(input.entry, input.session);
  assertActiveEntry(input.entry);
  assertCorrectionDevice(input.entry, input.session, input.currentDeviceId);

  if (input.entry.pendingSync) {
    assertLocalEntryEditRole(input.actorProfile, input.entry);
    return;
  }

  if (input.actorProfile.role !== "ADMIN") {
    throw new Error(
      "Zsynchronizowany wpis moze skorygowac tylko administrator przez anulowanie i nowy wpis."
    );
  }
}

function assertOpenSession(session: HarvestSessionDocument): void {
  if (session.status !== "OPEN") {
    throw new Error("Wpis mozna poprawic tylko w otwartej sesji.");
  }
}

function assertEntryMatchesSession(
  entry: CorrectableHarvestEntry,
  session: HarvestSessionDocument
): void {
  if (normalizeHarvestEntryId(entry.id) !== entry.id) {
    throw new Error("Wpis ma nieprawidlowy identyfikator UUID.");
  }

  normalizeSequenceNumber(entry.sequenceNumber);

  if (entry.sessionId !== session.id) {
    throw new Error("Wpis nalezy do innej sesji.");
  }

  if (entry.seasonId !== session.seasonId) {
    throw new Error("Wpis nalezy do innego sezonu niz sesja.");
  }

  if (entry.workerId !== session.workerId) {
    throw new Error("Wpis nalezy do innego zbieracza niz sesja.");
  }

  if (entry.businessDate !== session.businessDate) {
    throw new Error("Data wpisu musi byc zgodna z data sesji.");
  }
}

function assertActiveEntry(entry: CorrectableHarvestEntry): void {
  if (entry.status !== "ACTIVE") {
    throw new Error("Anulowanego wpisu nie mozna poprawic.");
  }
}

function assertCorrectionDevice(
  entry: CorrectableHarvestEntry,
  session: HarvestSessionDocument,
  currentDeviceId: string
): void {
  const normalizedDeviceId = normalizeRequiredText(
    currentDeviceId,
    "Korekta wymaga identyfikatora urzadzenia."
  );

  if (
    normalizedDeviceId !== session.createdDeviceId ||
    normalizedDeviceId !== entry.createdDeviceId
  ) {
    throw new Error("Wpis mozna poprawic tylko na urzadzeniu prowadzacym sesje.");
  }
}

function assertLocalEntryEditRole(
  actorProfile: UserProfile,
  entry: CorrectableHarvestEntry
): void {
  if (actorProfile.role === "ADMIN") {
    return;
  }

  if (actorProfile.role === "OPERATOR" && entry.createdBy === actorProfile.uid) {
    return;
  }

  throw new Error("Operator moze poprawiac tylko wlasny niezsynchronizowany wpis.");
}

function normalizeCorrectionValues(
  values: HarvestEntryCorrectionValues,
  session: HarvestSessionDocument
): HarvestEntryCorrectionValues {
  if (!Number.isSafeInteger(values.quantityMilli) || values.quantityMilli <= 0) {
    throw new Error("Poprawiona ilosc musi byc wieksza od zera.");
  }

  if (
    !isQuantityAllowedByPrecision(values.quantityMilli, session.quantityPrecisionSnapshot)
  ) {
    throw new Error("Poprawiona ilosc nie miesci sie w precyzji planu.");
  }

  const weightRequired =
    session.weightRequiredSnapshot || session.calculationBasisSnapshot === "WEIGHT";

  if (values.weightG === null) {
    if (weightRequired) {
      throw new Error("Poprawiona waga musi byc wieksza od zera.");
    }

    return values;
  }

  if (!Number.isSafeInteger(values.weightG) || values.weightG <= 0) {
    throw new Error("Poprawiona waga musi byc wieksza od zera.");
  }

  if (
    session.calculationBasisSnapshot === "WEIGHT" &&
    values.quantityMilli !== values.weightG
  ) {
    throw new Error("Plan wagowy wymaga zgodnosci poprawionej ilosci i wagi.");
  }

  return values;
}

function normalizeReplacementIdentity(
  replacementIdentity: HarvestEntryReplacementIdentity | null | undefined,
  originalEntryId: string
): HarvestEntryReplacementIdentity {
  if (!replacementIdentity) {
    throw new Error("Korekta zsynchronizowanego wpisu wymaga nowego UUID.");
  }

  const id = normalizeHarvestEntryId(replacementIdentity.id);

  if (id === originalEntryId) {
    throw new Error("Korekta zsynchronizowanego wpisu wymaga innego UUID.");
  }

  return {
    id,
    sequenceNumber: normalizeSequenceNumber(replacementIdentity.sequenceNumber)
  };
}

function normalizeCancellationReason(reason: string | null | undefined): string {
  return normalizeRequiredText(
    reason ?? "",
    "Anulowanie zsynchronizowanego wpisu wymaga powodu."
  );
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}
