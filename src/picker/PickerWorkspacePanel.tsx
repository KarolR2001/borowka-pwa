import { Banknote, FileSpreadsheet, Flag, LayoutDashboard, List } from "lucide-react";
import { useCallback, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerIssueReportsPanel,
  type PickerIssueReportsApi
} from "../issues/PickerIssueReportsPanel";
import type { FirestoreCacheMode } from "../offline/firestorePersistencePreference";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { PickerDataExportPanel, type PickerDataExportApi } from "./PickerDataExportPanel";
import { PickerDashboardPanel, type PickerDashboardApi } from "./PickerDashboardPanel";
import {
  PickerHarvestListPanel,
  type PickerHarvestListApi
} from "./PickerHarvestListPanel";
import {
  PickerPaymentListPanel,
  type PickerPaymentListApi
} from "./PickerPaymentListPanel";
import type { PickerSessionDetailsApi } from "./PickerSessionDetailsPanel";
import {
  PickerOfflineDataPanel,
  type PickerOfflineDataApi
} from "./PickerOfflineDataPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type PickerView = "SUMMARY" | "HARVESTS" | "PAYMENTS" | "ISSUES" | "EXPORT";

export function PickerWorkspacePanel({
  authState,
  cacheMode,
  deviceId,
  env,
  isOnline,
  pickerDataExportApi,
  pickerDashboardApi,
  pickerHarvestListApi,
  pickerPaymentListApi,
  pickerIssueReportsApi,
  pickerOfflineDataApi,
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
  const handleReportIssue = useCallback((sessionId: string) => {
    setReportSessionId(sessionId);
    setActiveView("ISSUES");
  }, []);
  const handleInitialSessionHandled = useCallback(() => {
    setReportSessionId(null);
  }, []);

  return (
    <section className="picker-workspace" aria-label="Strefa zbieracza">
      <PickerOfflineDataPanel
        authState={authState}
        cacheMode={cacheMode}
        deviceId={deviceId}
        env={env}
        isOnline={isOnline}
        offlineDataApi={pickerOfflineDataApi}
      />
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
          label="Moje zgloszenia"
          onClick={() => {
            setActiveView("ISSUES");
          }}
        />
        <WorkspaceTab
          active={activeView === "HARVESTS"}
          icon={List}
          label="Moje zbiory"
          onClick={() => {
            setActiveView("HARVESTS");
          }}
        />
        <WorkspaceTab
          active={activeView === "PAYMENTS"}
          icon={Banknote}
          label="Moje wyplaty"
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
        <PickerDashboardPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          pickerDashboardApi={pickerDashboardApi}
        />
      ) : activeView === "HARVESTS" ? (
        <PickerHarvestListPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          onReportIssue={handleReportIssue}
          pickerHarvestListApi={pickerHarvestListApi}
          pickerSessionDetailsApi={pickerSessionDetailsApi}
          syncDocuments={syncDocuments}
        />
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
