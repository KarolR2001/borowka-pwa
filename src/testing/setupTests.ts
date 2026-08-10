import "@testing-library/jest-dom/vitest";

const elementConstructor = (globalThis as { Element?: typeof Element }).Element;

if (elementConstructor) {
  Object.defineProperty(elementConstructor.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
    writable: true
  });
}
