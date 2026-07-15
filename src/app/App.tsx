import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { useMemo, useState } from "react";

import { APP_META } from "../config/appMeta";
import { getFirebaseClientConfigStatus } from "../config/firebaseClientConfig";
import { getFirebaseRuntimeStatus } from "../config/firebaseRuntime";
import { getOrCreateDeviceId } from "../domain/device";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import { navigationItems, type NavigationKey } from "./navigation";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  serviceWorkerStatusLabel,
  useServiceWorkerStatus
} from "./useServiceWorkerStatus";

type PanelState = {
  title: string;
  status: string;
  detail: string;
};

const panelByNavigation: Record<NavigationKey, PanelState> = {
  start: {
    title: "Start",
    status: "Szkielet aplikacji",
    detail: "Gotowy ekran bazowy bez danych biznesowych."
  },
  login: {
    title: "Logowanie",
    status: "Firebase niepodłączony",
    detail: "Formularz zostanie aktywowany po konfiguracji Authentication."
  },
  admin: {
    title: "Pulpit administratora",
    status: "Brak danych",
    detail: "Widok czeka na etap kont, sezonów i sesji."
  },
  operator: {
    title: "Pulpit operatora",
    status: "Brak aktywnej sesji",
    detail: "Proces zbioru powstanie po konfiguracji domeny."
  },
  picker: {
    title: "Pulpit zbieracza",
    status: "Brak przypisanego profilu",
    detail: "Prywatny widok zostanie połączony z workerId."
  },
  settings: {
    title: "Ustawienia",
    status: "Tryb lokalny",
    detail: "Konfiguracja środowiska jest rozdzielona przez zmienne Vite."
  },
  diagnostics: {
    title: "Diagnostyka",
    status: "Wersje systemowe",
    detail: "Informacje diagnostyczne są dostępne od pierwszego etapu."
  }
};

export function App() {
  const [activeView, setActiveView] = useState<NavigationKey>("start");
  const isOnline = useOnlineStatus();
  const serviceWorkerStatus = useServiceWorkerStatus();
  const firebaseStatus = getFirebaseClientConfigStatus(import.meta.env);
  const firebaseRuntimeStatus = getFirebaseRuntimeStatus(import.meta.env);
  const panel = panelByNavigation[activeView];

  const today = useMemo(() => formatBusinessDate(APP_META.buildDate), []);
  const diagnostics = useMemo(
    () => ({
      deviceId: getOrCreateDeviceId(),
      launchedAt: new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Europe/Warsaw"
      }).format(new Date())
    }),
    []
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">System ewidencji</p>
          <h1>Borowka PWA</h1>
        </div>
        <div className="topbar__meta" aria-label="Metadane aplikacji">
          <span>{APP_META.environment}</span>
          <span>v{APP_META.version}</span>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Nawigacja glowna">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeView;

          return (
            <button
              className="nav-tabs__button"
              aria-current={isActive ? "page" : undefined}
              key={item.key}
              onClick={() => {
                setActiveView(item.key);
              }}
              type="button"
              title={item.label}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="workspace">
        <section className="status-band" aria-label="Status aplikacji">
          <StatusItem
            icon={isOnline ? Wifi : CloudOff}
            label={isOnline ? "Online" : "Offline"}
            tone={isOnline ? "ok" : "warn"}
          />
          <StatusItem
            icon={firebaseStatus.ready ? CheckCircle2 : AlertTriangle}
            label={
              firebaseStatus.ready ? "Firebase gotowy" : "Firebase brak konfiguracji"
            }
            tone={firebaseStatus.ready ? "ok" : "warn"}
          />
          <StatusItem label={`Schemat ${APP_META.schemaVersion}`} tone="neutral" />
          <StatusItem
            label={`Kalkulacje ${APP_META.calculationVersion}`}
            tone="neutral"
          />
        </section>

        <section className="primary-panel" aria-labelledby="active-panel-title">
          <div>
            <p className="eyebrow">{panel.status}</p>
            <h2 id="active-panel-title">{panel.title}</h2>
            <p className="panel-detail">{panel.detail}</p>
          </div>

          <dl className="metrics-grid" aria-label="Przyklady formatowania domenowego">
            <Metric label="Data biznesowa" value={today} />
            <Metric label="Masa" value={formatKilograms(631510)} />
            <Metric label="Kwota" value={formatMoney(501615)} />
          </dl>
        </section>

        {activeView === "diagnostics" ? (
          <section className="diagnostics" aria-label="Diagnostyka">
            <DiagnosticRow label="Srodowisko" value={APP_META.environment} />
            <DiagnosticRow label="Wersja aplikacji" value={APP_META.version} />
            <DiagnosticRow label="Wersja schematu" value={APP_META.schemaVersion} />
            <DiagnosticRow label="Regula obliczen" value={APP_META.calculationVersion} />
            <DiagnosticRow label="Ostatnie uruchomienie" value={diagnostics.launchedAt} />
            <DiagnosticRow
              label="Identyfikator urzadzenia"
              value={diagnostics.deviceId}
            />
            <DiagnosticRow
              label="Service worker"
              value={serviceWorkerStatusLabel[serviceWorkerStatus]}
            />
            <DiagnosticRow label="Tryb Firebase" value={firebaseRuntimeStatus.label} />
            <DiagnosticRow
              label="Ostrzezenia konfiguracji"
              value={
                firebaseRuntimeStatus.warnings.length > 0
                  ? firebaseRuntimeStatus.warnings.join("; ")
                  : "brak"
              }
            />
            <DiagnosticRow
              label="Firebase"
              value={firebaseStatus.ready ? "skonfigurowany" : firebaseStatus.message}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

function StatusItem({
  icon: Icon,
  label,
  tone
}: {
  icon?: LucideIcon;
  label: string;
  tone: "ok" | "warn" | "neutral";
}) {
  return (
    <div className={`status-item status-item--${tone}`}>
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.2} /> : null}
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostics__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
