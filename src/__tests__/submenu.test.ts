import { describe, it, expect, vi } from "vitest";
import { SubmenuController } from "../submenu";

const theme = {
  selectedPrefix: (t: string) => t,
  selectedText: (t: string) => t,
  description: (t: string) => t,
  scrollInfo: (t: string) => t,
  noMatch: (t: string) => t,
};

const items = [
  { value: "a", label: "a" },
  { value: "b", label: "b" },
];

describe("SubmenuController", () => {
  it("does not crash when Enter selects and closes (single-select)", () => {
    const sub = new SubmenuController(theme);
    const onSelect = vi.fn();
    sub.openSingleSelect(items, onSelect);

    // Enter triggers onSelect -> close() -> selectList = null mid-handleInput
    expect(() => sub.handleInput("\r")).not.toThrow();
    expect(onSelect).toHaveBeenCalledWith(items[0]);
    expect(sub.isOpen).toBe(false);
  });

  it("does not crash when Escape cancels (single-select)", () => {
    const sub = new SubmenuController(theme);
    sub.openSingleSelect(items, vi.fn());

    expect(() => sub.handleInput("\x1b")).not.toThrow();
    expect(sub.isOpen).toBe(false);
  });

  it("does not crash when Escape applies and closes (multi-select)", () => {
    const sub = new SubmenuController(theme);
    const onApply = vi.fn();
    sub.openMultiSelect(items, new Set(["a"]), onApply);

    expect(() => sub.handleInput("\x1b")).not.toThrow();
    expect(onApply).toHaveBeenCalledWith(["a"]);
    expect(sub.isOpen).toBe(false);
  });
});
