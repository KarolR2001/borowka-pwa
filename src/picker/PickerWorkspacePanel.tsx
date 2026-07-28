import { Banknote, Flag, LayoutDashboard, List } from "lucide-react";
import { useCallback, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerIssueReportsPanel,
  type PickerIssueReportsApi
} from "../issues/PickerIssueReportsPanel";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
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

type FirebaseEnv = Record<string, string | boolean | undefined>;
type PickerView = "SUMMARY" | "HARVESTS" | "PAYMENTS" | "ISSUES";

export function PickerWorkspacePanel({
  authState,
  env,
  isOnline,
  pickerDashboardApi,
  pickerHarvestListApi,
  pickerPaymentListApi,
  pickerIssueReportsApi,
  pickerSessionDetailsApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerDashboardApi?: PickerDashboardApi;
  pickerHarvestListApi?: PickerHarvestListApi;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerIssueReportsApi?: PickerIssueReportsApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
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
      ) : (
        <PickerIssueReportsPanel
          authState={authState}
          env={env}
          initialSessionId={reportSessionId}
          isOnline={isOnline}
          issueReportsApi={pickerIssueReportsApi}
          onInitialSessionHandled={handleInitialSessionHandled}
          sessionDetailsApi={pickerSessionDetailsApi}
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
