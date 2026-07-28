import { LayoutDashboard, List } from "lucide-react";
import { useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { PickerDashboardPanel, type PickerDashboardApi } from "./PickerDashboardPanel";
import {
  PickerHarvestListPanel,
  type PickerHarvestListApi
} from "./PickerHarvestListPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type PickerView = "SUMMARY" | "HARVESTS";

export function PickerWorkspacePanel({
  authState,
  env,
  isOnline,
  pickerDashboardApi,
  pickerHarvestListApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerDashboardApi?: PickerDashboardApi;
  pickerHarvestListApi?: PickerHarvestListApi;
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
      </div>
      {activeView === "SUMMARY" ? (
        <PickerDashboardPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          pickerDashboardApi={pickerDashboardApi}
        />
      ) : (
        <PickerHarvestListPanel
          authState={authState}
          env={env}
          isOnline={isOnline}
          pickerHarvestListApi={pickerHarvestListApi}
          syncDocuments={syncDocuments}
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
