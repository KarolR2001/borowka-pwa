import { Banknote, LayoutDashboard, List } from "lucide-react";
import { useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
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
type PickerView = "SUMMARY" | "HARVESTS" | "PAYMENTS";

export function PickerWorkspacePanel({
  authState,
  env,
  isOnline,
  pickerDashboardApi,
  pickerHarvestListApi,
  pickerPaymentListApi,
  pickerSessionDetailsApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerDashboardApi?: PickerDashboardApi;
  pickerHarvestListApi?: PickerHarvestListApi;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [activeView, setActiveView] = useState<PickerView>("SUMMARY");

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
          pickerHarvestListApi={pickerHarvestListApi}
          pickerSessionDetailsApi={pickerSessionDetailsApi}
          syncDocuments={syncDocuments}
        />
      ) : (
        <PickerPaymentListPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          pickerPaymentListApi={pickerPaymentListApi}
          pickerSessionDetailsApi={pickerSessionDetailsApi}
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
