import { useEffect, useState } from "react";

export type ServiceWorkerStatus =
  "unsupported" | "controlled" | "registered" | "not-registered" | "error";

export const serviceWorkerStatusLabel: Record<ServiceWorkerStatus, string> = {
  unsupported: "niewspierany",
  controlled: "aktywny",
  registered: "zarejestrowany",
  "not-registered": "brak",
  error: "blad odczytu"
};

export function isServiceWorkerReady(status: ServiceWorkerStatus): boolean {
  return status === "controlled" || status === "registered";
}

export function useServiceWorkerStatus(): ServiceWorkerStatus {
  const [status, setStatus] = useState<ServiceWorkerStatus>("unsupported");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }

    if (navigator.serviceWorker.controller) {
      setStatus("controlled");
      return;
    }

    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        setStatus(registration ? "registered" : "not-registered");
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  return status;
}
