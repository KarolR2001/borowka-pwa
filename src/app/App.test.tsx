import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

describe("App shell", () => {
  it("renders the product shell and diagnostics", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("heading", { name: "Borowka PWA" })).toBeInTheDocument();
    expect(screen.getByText("Firebase brak konfiguracji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /diagnostyka/i }));

    expect(screen.getByRole("heading", { name: "Diagnostyka" })).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).toBeInTheDocument();
  });
});
