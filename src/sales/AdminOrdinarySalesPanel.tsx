import { CheckCircle2, Pencil, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatKilograms, formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import type { StockReconciliationReport } from "../stock/stockReconciliation";
import { OrdinarySaleForm } from "./OrdinarySaleForm";
import type {
  PreparedOrdinarySale,
  SaleFormStockContext
} from "./ordinarySalePreparation";
import { cancelSale, listSaleCancellationCandidates } from "./saleCancellation";
import {
  AdminSaleDirectoryPanel,
  type AdminSaleDirectoryApi
} from "./AdminSaleDirectoryPanel";
import { listAdminSales } from "./saleDirectory";
import {
  SaleCancellationSection,
  type SaleCancellationSectionApi
} from "./SaleCancellationSection";
import { SaleCorrectionForm } from "./SaleCorrectionForm";
import {
  correctionDirectionLabel,
  type PreparedSaleCorrection
} from "./saleCorrectionPreparation";
import {
  checkSaleCorrection,
  createSaleCorrection,
  type CheckSaleCorrectionInput,
  type CreateSaleCorrectionInput,
  type CreateSaleCorrectionResult,
  type SaleCorrectionCheckResult,
  type SaleCorrectionConfirmedResult
} from "./saleCorrectionWrite";
import {
  checkOrdinarySaleStock,
  createOrdinarySale,
  listOrdinarySaleStockContexts,
  type CheckOrdinarySaleStockInput,
  type CreateOrdinarySaleInput,
  type CreateOrdinarySaleResult,
  type ListOrdinarySaleStockInput,
  type OrdinarySaleConfirmedResult,
  type OrdinarySaleStockCheckResult
} from "./saleStockPreflight";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OrdinarySalesApi = AdminSaleDirectoryApi &
  SaleCancellationSectionApi & {
    checkCorrection: (
      env: FirebaseEnv,
      input: CheckSaleCorrectionInput
    ) => Promise<SaleCorrectionCheckResult>;
    checkStock: (
      env: FirebaseEnv,
      input: CheckOrdinarySaleStockInput
    ) => Promise<OrdinarySaleStockCheckResult>;
    create: (
      env: FirebaseEnv,
      input: CreateOrdinarySaleInput
    ) => Promise<CreateOrdinarySaleResult>;
    createCorrection: (
      env: FirebaseEnv,
      input: CreateSaleCorrectionInput
    ) => Promise<CreateSaleCorrectionResult>;
    listStockContexts: (
      env: FirebaseEnv,
      input: ListOrdinarySaleStockInput
    ) => Promise<SaleFormStockContext[]>;
  };

export const defaultOrdinarySalesApi: OrdinarySalesApi = {
  cancelSale,
  checkCorrection: checkSaleCorrection,
  checkStock: checkOrdinarySaleStock,
  create: createOrdinarySale,
  createCorrection: createSaleCorrection,
  listCancellationCandidates: listSaleCancellationCandidates,
  list: listAdminSales,
  listStockContexts: listOrdinarySaleStockContexts
};

type StockState =
  | { contexts: SaleFormStockContext[]; status: "IDLE" | "LOADING" }
  | { contexts: SaleFormStockContext[]; status: "READY" }
  | { contexts: SaleFormStockContext[]; message: string; status: "ERROR" };

type StockContextSnapshot = Pick<
  SaleFormStockContext,
  | "availableWeightG"
  | "pendingDocumentCount"
  | "refreshedAtIso"
  | "seasonId"
  | "seasonName"
>;

export function AdminOrdinarySalesPanel({
  authState,
  deviceId,
  env,
  isOnline,
  ordinarySalesApi = defaultOrdinarySalesApi
}: {
  authState: AuthSessionState;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  ordinarySalesApi?: OrdinarySalesApi;
}) {
  const [stockState, setStockState] = useState<StockState>({
    contexts: [],
    status: "IDLE"
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [preflight, setPreflight] = useState<OrdinarySaleStockCheckResult | null>(null);
  const [confirmed, setConfirmed] = useState<OrdinarySaleConfirmedResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [operationMode, setOperationMode] = useState<
    "SALE" | "CORRECTION" | "CANCELLATION"
  >("SALE");
  const [requestedCancellationSaleId, setRequestedCancellationSaleId] = useState<
    string | null
  >(null);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setStockState({ contexts: [], status: "IDLE" });
      return undefined;
    }

    if (!isOnline) {
      setStockState((current) => ({
        contexts: current.contexts,
        message: "Sprzedaz wymaga polaczenia z internetem.",
        status: "ERROR"
      }));
      return undefined;
    }

    setStockState((current) => ({
      contexts: current.contexts,
      status: "LOADING"
    }));
    void ordinarySalesApi
      .listStockContexts(env, {
        actorProfile: authState.profile,
        isOnline
      })
      .then((contexts) => {
        if (isMounted) {
          setStockState({ contexts, status: "READY" });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setStockState((current) => ({
            contexts: current.contexts,
            message:
              error instanceof Error
                ? error.message
                : "Nie udalo sie pobrac stanu sprzedazy.",
            status: "ERROR"
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isAdmin, isOnline, ordinarySalesApi, reloadKey]);

  if (authState.status !== "READY") {
    return <AccessNotice message="Zaloguj sie jako administrator." />;
  }

  if (!isAdmin) {
    return <AccessNotice message="Sprzedaz jest dostepna tylko dla administratora." />;
  }

  const actorProfile = authState.profile;
  const blockedStockContexts = stockState.contexts.filter(
    (context) => context.reconciliation?.blocksOrdinarySale
  );

  async function handlePrepare(preparedSale: PreparedOrdinarySale): Promise<void> {
    setConfirmed(null);
    setSaveError(null);
    const result = await ordinarySalesApi.checkStock(env, {
      actorProfile,
      isOnline,
      preparedSale
    });
    setPreflight(result);
    replaceStockContext(result.check.sale);

    if (result.status === "BLOCKED") {
      throw new Error(result.message);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (preflight?.status !== "CONFIRMATION_REQUIRED" || isSaving || !isOnline) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await ordinarySalesApi.create(env, {
        actorProfile,
        check: preflight.check,
        deviceId,
        isOnline
      });

      if (result.status === "CONFIRMED") {
        setConfirmed(result);
        setPreflight(null);
        setFormKey((current) => current + 1);
        setReloadKey((current) => current + 1);
        return;
      }

      setPreflight(
        result.status === "BLOCKED"
          ? {
              check: result.check,
              message: result.message,
              status: "BLOCKED"
            }
          : {
              check: result.check,
              status: "CONFIRMATION_REQUIRED"
            }
      );
      replaceStockContext(result.check.sale);
      setSaveError(result.message);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Nie udalo sie potwierdzic zapisu sprzedazy."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function replaceStockContext(sale: StockContextSnapshot): void {
    setStockState((current) => ({
      ...current,
      contexts: current.contexts.map((context) =>
        context.seasonId === sale.seasonId
          ? {
              ...context,
              availableWeightG: sale.availableWeightG,
              dataSource: "SERVER",
              isFresh: true,
              pendingDocumentCount: sale.pendingDocumentCount,
              refreshedAtIso: sale.refreshedAtIso,
              seasonId: sale.seasonId,
              seasonName: sale.seasonName
            }
          : context
      )
    }));
  }

  return (
    <section
      className="admin-ordinary-sales"
      aria-labelledby="ordinary-sales-panel-title"
    >
      <header className="directory-header">
        <div>
          <p className="eyebrow">Stan i przychod</p>
          <h2 id="ordinary-sales-panel-title">Sprzedaz</h2>
          <p className="panel-detail">
            Stan jest pobierany ponownie z serwera przed kazdym zapisem.
          </p>
        </div>
        <button
          className="secondary-button icon-button"
          disabled={!isOnline || stockState.status === "LOADING"}
          onClick={() => {
            setPreflight(null);
            setSaveError(null);
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez stan sprzedazy"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
          <span className="sr-only">Odswiez stan sprzedazy</span>
        </button>
      </header>

      {stockState.status === "LOADING" && stockState.contexts.length === 0 ? (
        <p className="empty-state">Pobieranie stanu z serwera.</p>
      ) : null}
      {stockState.status === "ERROR" ? (
        <p className="form-message form-message--error">{stockState.message}</p>
      ) : null}
      {stockState.status !== "LOADING" && stockState.contexts.length === 0 ? (
        <p className="empty-state">Brak otwartego sezonu do sprzedazy.</p>
      ) : null}

      {blockedStockContexts.map((context) =>
        context.reconciliation ? (
          <StockReconciliationAlert
            key={context.seasonId}
            report={context.reconciliation}
            seasonName={context.seasonName}
          />
        ) : null
      )}

      <div className="sales-operation-switch" role="group" aria-label="Typ operacji">
        <button
          aria-pressed={operationMode === "SALE"}
          onClick={() => {
            setOperationMode("SALE");
            setRequestedCancellationSaleId(null);
            setPreflight(null);
            setConfirmed(null);
            setSaveError(null);
          }}
          type="button"
        >
          Zwykla sprzedaz
        </button>
        <button
          aria-pressed={operationMode === "CORRECTION"}
          onClick={() => {
            setOperationMode("CORRECTION");
            setRequestedCancellationSaleId(null);
            setPreflight(null);
            setConfirmed(null);
            setSaveError(null);
          }}
          type="button"
        >
          Korekta
        </button>
        <button
          aria-pressed={operationMode === "CANCELLATION"}
          onClick={() => {
            setOperationMode("CANCELLATION");
            setRequestedCancellationSaleId(null);
            setPreflight(null);
            setConfirmed(null);
            setSaveError(null);
          }}
          type="button"
        >
          Anulowanie
        </button>
      </div>

      {operationMode === "SALE" ? (
        <>
          <OrdinarySaleForm
            disabled={
              isSaving ||
              stockState.status === "LOADING" ||
              preflight?.status === "CONFIRMATION_REQUIRED"
            }
            isOnline={isOnline}
            key={formKey}
            onDraftChange={() => {
              setPreflight(null);
              setSaveError(null);
            }}
            onPrepare={handlePrepare}
            stockContexts={stockState.contexts}
          />

          {preflight?.status === "CONFIRMATION_REQUIRED" ? (
            <SaleConfirmation
              isSaving={isSaving}
              onEdit={() => {
                setPreflight(null);
                setSaveError(null);
              }}
              onConfirm={() => {
                void handleConfirm();
              }}
              result={preflight}
            />
          ) : null}
          {preflight?.status === "BLOCKED" ? (
            <p className="form-message form-message--error" role="alert">
              {preflight.message}
            </p>
          ) : null}
          {saveError ? (
            <p className="form-message form-message--warning" role="alert">
              {saveError}
            </p>
          ) : null}
          {confirmed ? <ConfirmedSale result={confirmed} /> : null}
        </>
      ) : operationMode === "CORRECTION" ? (
        <SaleCorrectionSection
          actorProfile={actorProfile}
          deviceId={deviceId}
          env={env}
          isOnline={isOnline}
          onConfirmed={(result) => {
            replaceStockContext({
              availableWeightG: result.postWriteAvailableWeightG,
              pendingDocumentCount: 0,
              refreshedAtIso: new Date().toISOString(),
              seasonId: result.correction.seasonId,
              seasonName:
                stockState.contexts.find(
                  (context) => context.seasonId === result.correction.seasonId
                )?.seasonName ?? result.correction.seasonId
            });
            setReloadKey((current) => current + 1);
          }}
          onStockContextChange={replaceStockContext}
          ordinarySalesApi={ordinarySalesApi}
          stockContexts={stockState.contexts}
          stockLoading={stockState.status === "LOADING"}
        />
      ) : (
        <SaleCancellationSection
          actorProfile={actorProfile}
          api={ordinarySalesApi}
          deviceId={deviceId}
          env={env}
          isOnline={isOnline}
          onConfirmed={(result) => {
            setReloadKey((current) => current + 1);
            replaceStockContext({
              availableWeightG: result.postWriteAvailableWeightG,
              pendingDocumentCount: 0,
              refreshedAtIso: new Date().toISOString(),
              seasonId: result.cancelledSale.seasonId,
              seasonName:
                stockState.contexts.find(
                  (context) => context.seasonId === result.cancelledSale.seasonId
                )?.seasonName ?? result.cancelledSale.seasonId
            });
          }}
          requestedSaleId={requestedCancellationSaleId}
        />
      )}

      <p className="admin-ordinary-sales__concurrency-note">
        Nie zapisuj sprzedazy rownoczesnie z innego urzadzenia. Bez zaufanej funkcji
        serwerowej dwa rownolegle zapisy nie maja absolutnej gwarancji serializacji.
      </p>

      <AdminSaleDirectoryPanel
        api={ordinarySalesApi}
        authState={authState}
        env={env}
        isOnline={isOnline}
        onRequestCancellation={(saleId) => {
          setRequestedCancellationSaleId(saleId);
          setOperationMode("CANCELLATION");
        }}
      />
    </section>
  );
}

function SaleCorrectionSection({
  actorProfile,
  deviceId,
  env,
  isOnline,
  onConfirmed,
  onStockContextChange,
  ordinarySalesApi,
  stockContexts,
  stockLoading
}: {
  actorProfile: UserProfile;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  onConfirmed: (result: SaleCorrectionConfirmedResult) => void;
  onStockContextChange: (snapshot: StockContextSnapshot) => void;
  ordinarySalesApi: OrdinarySalesApi;
  stockContexts: readonly SaleFormStockContext[];
  stockLoading: boolean;
}) {
  const [checkResult, setCheckResult] = useState<SaleCorrectionCheckResult | null>(null);
  const [confirmed, setConfirmed] = useState<SaleCorrectionConfirmedResult | null>(null);
  const [confirmationAccepted, setConfirmationAccepted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function handlePrepare(
    preparedCorrection: PreparedSaleCorrection
  ): Promise<void> {
    setConfirmed(null);
    setConfirmationAccepted(false);
    setError(null);
    const result = await ordinarySalesApi.checkCorrection(env, {
      actorProfile,
      isOnline,
      preparedCorrection
    });
    setCheckResult(result);
    onStockContextChange(result.check.correction);

    if (result.status === "BLOCKED") {
      throw new Error(result.message);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (
      checkResult?.status !== "CONFIRMATION_REQUIRED" ||
      !confirmationAccepted ||
      isSaving ||
      !isOnline
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await ordinarySalesApi.createCorrection(env, {
        actorProfile,
        check: checkResult.check,
        deviceId,
        isOnline
      });

      if (result.status === "CONFIRMED") {
        setConfirmed(result);
        setCheckResult(null);
        setConfirmationAccepted(false);
        setFormKey((current) => current + 1);
        onConfirmed(result);
        return;
      }

      const refreshedCheck: SaleCorrectionCheckResult =
        result.status === "BLOCKED"
          ? {
              check: result.check,
              message: result.message,
              status: "BLOCKED"
            }
          : {
              check: result.check,
              status: "CONFIRMATION_REQUIRED"
            };
      setCheckResult(refreshedCheck);
      setConfirmationAccepted(false);
      setError(result.message);
      onStockContextChange(result.check.correction);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie potwierdzic korekty."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="sale-correction-section">
      <SaleCorrectionForm
        disabled={
          stockLoading || isSaving || checkResult?.status === "CONFIRMATION_REQUIRED"
        }
        isOnline={isOnline}
        key={formKey}
        onDraftChange={() => {
          setCheckResult(null);
          setConfirmed(null);
          setConfirmationAccepted(false);
          setError(null);
        }}
        onPrepare={handlePrepare}
        stockContexts={stockContexts}
      />

      {checkResult?.status === "CONFIRMATION_REQUIRED" ? (
        <section
          className="sale-stock-confirmation"
          aria-labelledby="sale-correction-confirmation-title"
        >
          <div className="sale-stock-confirmation__notice">
            <TriangleAlert aria-hidden="true" size={20} />
            <div>
              <h3 id="sale-correction-confirmation-title">
                {checkResult.check.stockChanged
                  ? "Stan zmienil sie przed korekta"
                  : "Potwierdz skutki korekty"}
              </h3>
              <p>
                Korekta jest osobnym dokumentem i pozostanie w historii wraz z powodem
                oraz audytem.
              </p>
            </div>
          </div>
          <dl className="sale-stock-confirmation__summary">
            <ConfirmationValue
              label="Kierunek"
              value={correctionDirectionLabel(
                checkResult.check.correction.correctionDirection
              )}
            />
            <ConfirmationValue
              label="Stan przed"
              value={formatKilograms(checkResult.check.correction.availableWeightG)}
            />
            <ConfirmationValue
              label="Wplyw na stan"
              value={formatSignedKilograms(checkResult.check.correction.stockImpactG)}
            />
            <ConfirmationValue
              label="Stan po"
              value={formatKilograms(
                checkResult.check.correction.projectedAvailableWeightG
              )}
            />
            <ConfirmationValue
              label="Wplyw na przychod"
              value={formatSignedMoney(checkResult.check.correction.revenueImpactGrosz)}
            />
            <ConfirmationValue label="Powod" value={checkResult.check.correction.note} />
          </dl>
          <label className="sale-correction-confirmation__acceptance">
            <input
              checked={confirmationAccepted}
              disabled={isSaving}
              onChange={(event) => {
                setConfirmationAccepted(event.target.checked);
              }}
              type="checkbox"
            />
            Potwierdzam kierunek, wplyw na stan i przychod oraz podany powod.
          </label>
          <div className="sale-stock-confirmation__actions">
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={() => {
                setCheckResult(null);
                setConfirmationAccepted(false);
                setError(null);
              }}
              type="button"
            >
              <Pencil aria-hidden="true" size={18} />
              Wroc do edycji
            </button>
            <button
              className="primary-button"
              disabled={!confirmationAccepted || isSaving}
              onClick={() => {
                void handleConfirm();
              }}
              type="button"
            >
              <Save aria-hidden="true" size={18} />
              {isSaving ? "Ponowne sprawdzanie..." : "Potwierdz i zapisz korekte"}
            </button>
          </div>
        </section>
      ) : null}
      {checkResult?.status === "BLOCKED" ? (
        <p className="form-message form-message--error" role="alert">
          {checkResult.message}
        </p>
      ) : null}
      {error ? (
        <p className="form-message form-message--warning" role="alert">
          {error}
        </p>
      ) : null}
      {confirmed ? (
        <div className="sale-confirmed sale-confirmed--ok" role="status">
          <CheckCircle2 aria-hidden="true" size={20} />
          <div>
            <strong>{confirmed.message}</strong>
            <span>
              Stan po zapisie: {formatKilograms(confirmed.postWriteAvailableWeightG)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaleConfirmation({
  isSaving,
  onEdit,
  onConfirm,
  result
}: {
  isSaving: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  result: Extract<OrdinarySaleStockCheckResult, { status: "CONFIRMATION_REQUIRED" }>;
}) {
  const { check } = result;
  const sale = check.sale;

  return (
    <section
      className="sale-stock-confirmation"
      aria-labelledby="sale-stock-confirmation-title"
    >
      <div className="sale-stock-confirmation__notice">
        <TriangleAlert aria-hidden="true" size={20} />
        <div>
          <h3 id="sale-stock-confirmation-title">
            {check.stockChanged
              ? "Stan zmienil sie od otwarcia formularza"
              : "Potwierdz sprzedaz na aktualnym stanie"}
          </h3>
          <p>
            {check.stockChanged
              ? "Podsumowanie zostalo zaktualizowane. Zapis wymaga ponownego potwierdzenia."
              : "Przed zapisem stan zostanie sprawdzony na serwerze jeszcze raz."}
          </p>
        </div>
      </div>
      <dl className="sale-stock-confirmation__summary">
        <ConfirmationValue
          label="Stan przed"
          value={formatKilograms(sale.availableWeightG)}
        />
        <ConfirmationValue label="Masa" value={formatKilograms(sale.weightG)} />
        <ConfirmationValue
          label="Stan po"
          value={formatKilograms(sale.projectedAvailableWeightG)}
        />
        <ConfirmationValue
          label="Cena"
          value={`${formatMoney(sale.priceGroszPerKg)} / kg`}
        />
        <ConfirmationValue
          label="Przychod"
          value={formatMoney(sale.revenuePreviewGrosz)}
        />
      </dl>
      <div className="sale-stock-confirmation__actions">
        <button
          className="secondary-button"
          disabled={isSaving}
          onClick={onEdit}
          type="button"
        >
          <Pencil aria-hidden="true" size={18} />
          Wroc do edycji
        </button>
        <button
          className="primary-button"
          disabled={isSaving}
          onClick={onConfirm}
          type="button"
        >
          <Save aria-hidden="true" size={18} />
          {isSaving ? "Ponowne sprawdzanie..." : "Potwierdz i zapisz"}
        </button>
      </div>
    </section>
  );
}

function ConfirmedSale({ result }: { result: OrdinarySaleConfirmedResult }) {
  return (
    <div
      className={`sale-confirmed ${
        result.stockIsConsistent ? "sale-confirmed--ok" : "sale-confirmed--warning"
      }`}
      role="status"
    >
      {result.stockIsConsistent ? (
        <CheckCircle2 aria-hidden="true" size={20} />
      ) : (
        <TriangleAlert aria-hidden="true" size={20} />
      )}
      <div>
        <strong>{result.message}</strong>
        <span>Stan po zapisie: {formatKilograms(result.postWriteAvailableWeightG)}</span>
      </div>
    </div>
  );
}

function ConfirmationValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StockReconciliationAlert({
  report,
  seasonName
}: {
  report: StockReconciliationReport;
  seasonName: string;
}) {
  return (
    <section
      className="stock-reconciliation-alert"
      aria-labelledby={`stock-reconciliation-${report.seasonId}`}
      role="alert"
    >
      <div className="stock-reconciliation-alert__heading">
        <TriangleAlert aria-hidden="true" size={22} />
        <div>
          <h3 id={`stock-reconciliation-${report.seasonId}`}>
            Alarm stanu: {seasonName}
          </h3>
          <p>
            Zwykla sprzedaz jest zablokowana. Wykonaj jawna korekte albo popraw dokument
            zrodlowy, a nastepnie odswiez stan.
          </p>
        </div>
      </div>
      <p className="stock-reconciliation-alert__difference">
        Roznica projekcji: <strong>{formatSignedKilograms(report.differenceG)}</strong>
      </p>
      <ul>
        {report.issues.map((issue) => (
          <li key={issue.code}>
            {issue.message} ({String(issue.count)})
          </li>
        ))}
      </ul>
      <details className="stock-reconciliation-report">
        <summary>Otworz raport skladowych</summary>
        <dl>
          <ConfirmationValue
            label="Zbiory potwierdzone"
            value={formatKilograms(report.source.confirmedHarvestWeightG)}
          />
          <ConfirmationValue
            label="Sprzedaz zwykla"
            value={formatKilograms(report.source.activeSaleWeightG)}
          />
          <ConfirmationValue
            label="Korekty zwiekszajace"
            value={formatKilograms(report.source.correctionIncreaseWeightG)}
          />
          <ConfirmationValue
            label="Korekty zmniejszajace"
            value={formatKilograms(report.source.correctionDecreaseWeightG)}
          />
          <ConfirmationValue
            label="Stan ze zrodel"
            value={formatKilograms(report.source.availableWeightG)}
          />
          <ConfirmationValue
            label="Stan projekcji"
            value={formatKilograms(report.operationalAvailableWeightG)}
          />
          <ConfirmationValue
            label="Oczekiwane ruchy"
            value={String(report.expectedMovementCount)}
          />
          <ConfirmationValue
            label="Zapisane ruchy"
            value={String(report.operationalMovementCount)}
          />
        </dl>
        {report.issues.some((issue) => issue.documentIds.length > 0) ? (
          <div className="stock-reconciliation-report__documents">
            <strong>Dokumenty wymagajace sprawdzenia</strong>
            {report.issues.map((issue) =>
              issue.documentIds.length > 0 ? (
                <p key={issue.code}>
                  {issue.message} {issue.documentIds.slice(0, 20).join(", ")}
                  {issue.documentIds.length > 20
                    ? ` i ${String(issue.documentIds.length - 20)} kolejnych`
                    : ""}
                </p>
              ) : null
            )}
          </div>
        ) : null}
        <small>Kontrola: {formatTimestamp(report.checkedAtIso)}</small>
      </details>
    </section>
  );
}

function AccessNotice({ message }: { message: string }) {
  return (
    <section className="access-notice" aria-label="Dostep do sprzedazy">
      <TriangleAlert aria-hidden="true" size={18} />
      <p>{message}</p>
    </section>
  );
}

function formatSignedKilograms(value: number): string {
  return `${value > 0 ? "+" : ""}${formatKilograms(value)}`;
}

function formatSignedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pl-PL");
}
