import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { RecordDialog } from "./RecordDialog";

describe("RecordDialog", () => {
  it("keeps focus in a controlled input when the parent rerenders", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState("");

      return (
        <RecordDialog label="Szczegóły" onClose={() => undefined}>
          <label>
            Notatka
            <input
              onChange={(event) => {
                setValue(event.target.value);
              }}
              value={value}
            />
          </label>
        </RecordDialog>
      );
    }

    render(<Harness />);

    const input = screen.getByRole("textbox", { name: "Notatka" });
    await user.type(input, "Pełna treść");

    expect(input).toHaveValue("Pełna treść");
    expect(input).toHaveFocus();
  });
});
