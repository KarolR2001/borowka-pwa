import { useEffect } from "react";

export function useCloseDetailsOnOutsideClick(): void {
  useEffect(() => {
    const closeDetailsOutsideTarget = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      document
        .querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((details) => {
          if (!details.contains(event.target as Node)) {
            details.removeAttribute("open");
          }
        });
    };

    document.addEventListener("pointerdown", closeDetailsOutsideTarget);
    return () => {
      document.removeEventListener("pointerdown", closeDetailsOutsideTarget);
    };
  }, []);
}
