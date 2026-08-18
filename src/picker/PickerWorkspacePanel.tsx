import { Banknote, FileSpreadsheet, Flag, LayoutDashboard } from "lucide-react";
import { useCallback, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { DEFAULT_DASHBOARD_PERIOD } from "../dashboard/dashboardPeriod";
import {
  PickerIssueReportsPanel,
  type PickerIssueReportsApi
} from "../issues/PickerIssueReportsPanel";
import type { FirestoreCacheMode } from "../offline/firestorePersistencePreference";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { PickerDataExportPanel, type PickerDataExportApi } from "./PickerDataExportPanel";
import {
  PickerDashboardPanel,
  type PickerDashboardApi,
  type PickerDashboardSelection
} from "./PickerDashboardPanel";
import {
  PickerHarvestListPanel,
  type PickerHarvestListApi
} from "./PickerHarvestListPanel";
import {
  PickerPaymentListPanel,
  type PickerPaymentListApi
} from "./PickerPaymentListPanel";
import type { PickerSessionDetailsApi } from "./PickerSessionDetailsPanel";
import type { PickerOfflineDataApi } from "./PickerOfflineDataPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type PickerView = "SUMMARY" | "PAYMENTS" | "ISSUES" | "EXPORT";

export function PickerWorkspacePanel({
  authState,
  deviceId,
  env,
  isOnline,
  pickerDataExportApi,
  pickerDashboardApi,
  pickerHarvestListApi,
  pickerPaymentListApi,
  pickerIssueReportsApi,
  pickerSessionDetailsApi,
  onLocalDocumentsChanged,
  syncDocuments
}: {
  authState: AuthSessionState;
  cacheMode: FirestoreCacheMode;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerDataExportApi?: PickerDataExportApi;
  pickerDashboardApi?: PickerDashboardApi;
  pickerHarvestListApi?: PickerHarvestListApi;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerIssueReportsApi?: PickerIssueReportsApi;
  pickerOfflineDataApi?: PickerOfflineDataApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
  onLocalDocumentsChanged?: () => Promise<void> | void;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [activeView, setActiveView] = useState<PickerView>("SUMMARY");
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const [dashboardSelection, setDashboardSelection] = useState<PickerDashboardSelection>({
    periodSelection: DEFAULT_DASHBOARD_PERIOD,
    selectedSeasonId: null
  });
  const handleReportIssue = useCallback((sessionId: string) => {
    setReportSessionId(sessionId);
    setActiveView("ISSUES");
  }, []);
  const handleInitialSessionHandled = useCallback(() => {
    setReportSessionId(null);
  }, []);

  return (
    <section className="picker-workspace" aria-label="Strefa zbieracza">
      <div
        className="picker-workspace__tabs"
        role="tablist"
        aria-label="Widoki zbieracza"
      >
        <WorkspaceTab
          active={activeView === "SUMMARY"}
          icon={LayoutDashboard}
          label="Podsumowanie"
          onClick={() => {
            setActiveView("SUMMARY");
          }}
        />
        <WorkspaceTab
          active={activeView === "ISSUES"}
          icon={Flag}
          label="Moje zgłoszenia"
          onClick={() => {
            setActiveView("ISSUES");
          }}
        />
        <WorkspaceTab
          active={activeView === "PAYMENTS"}
          icon={Banknote}
          label="Moje wypłaty"
          onClick={() => {
            setActiveView("PAYMENTS");
          }}
        />
        <WorkspaceTab
          active={activeView === "EXPORT"}
          icon={FileSpreadsheet}
          label="Eksport CSV"
          onClick={() => {
            setActiveView("EXPORT");
          }}
        />
      </div>
      {activeView === "SUMMARY" ? (
        <>
          <PickerDashboardPanel
            authState={authState}
            dashboardSelection={dashboardSelection}
            env={env}
            isOnline={isOnline}
            onDashboardSelectionChange={setDashboardSelection}
            pickerDashboardApi={pickerDashboardApi}
          />
          <PickerHarvestListPanel
            authState={authState}
            dashboardSelection={dashboardSelection}
            env={env}
            isOnline={isOnline}
            onReportIssue={handleReportIssue}
            pickerHarvestListApi={pickerHarvestListApi}
            pickerSessionDetailsApi={pickerSessionDetailsApi}
            syncDocuments={syncDocuments}
          />
        </>
      ) : activeView === "PAYMENTS" ? (
        <PickerPaymentListPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          onReportIssue={handleReportIssue}
          pickerPaymentListApi={pickerPaymentListApi}
          pickerSessionDetailsApi={pickerSessionDetailsApi}
        />
      ) : activeView === "ISSUES" ? (
        <PickerIssueReportsPanel
          authState={authState}
          deviceId={deviceId}
          env={env}
          initialSessionId={reportSessionId}
          isOnline={isOnline}
          issueReportsApi={pickerIssueReportsApi}
          onLocalDocumentsChanged={onLocalDocumentsChanged}
          onInitialSessionHandled={handleInitialSessionHandled}
          sessionDetailsApi={pickerSessionDetailsApi}
        />
      ) : (
        <PickerDataExportPanel
          authState={authState}
          env={env}
          exportApi={pickerDataExportApi}
          isOnline={isOnline}
        />
      )}
    </section>
  );
}

function WorkspaceTab({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof LayoutDashboard;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={active ? "picker-workspace__tab is-active" : "picker-workspace__tab"}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <Icon aria-hidden="true" size={18} />
      {label}
    </button>
  );
}
