import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import {
  OfflineStorageConsentPrompt,
  OfflineStorageSettings
} from "./OfflineStorageConsent";

describe("OfflineStorageConsent", () => {
  it("requires an explicit trusted-device decision", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDecline = vi.fn();

    render(
      <OfflineStorageConsentPrompt
        error={null}
        isOnline
        isSubmitting={false}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    );

    await user.click(screen.getByRole("button", { name: "Tak, włącz pracę offline" }));
    expect(onAccept).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Nie, tylko ta sesja" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("blocks enabling storage without a connection", () => {
    render(
      <OfflineStorageConsentPrompt
        error={null}
        isOnline={false}
        isSubmitting={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Tak, włącz pracę offline" })
    ).toBeDisabled();
  });

  it("allows a trusted device to revoke future persistent storage", async () => {
    const user = userEvent.setup();
    const onDisable = vi.fn();

    render(
      <OfflineStorageSettings isOnline isSubmitting={false} onDisable={onDisable} />
    );

    await user.click(screen.getByRole("button", { name: "Wyłącz przechowywanie" }));
    expect(onDisable).toHaveBeenCalledTimes(1);
  });
});
