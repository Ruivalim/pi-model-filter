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

  it("type-to-filter narrows the list and backspace restores", () => {
    const sub = new SubmenuController(theme);
    sub.openSingleSelect(
      [
        { value: "gpt-5.6", label: "gpt-5.6" },
        { value: "claude-fable-5", label: "claude-fable-5" },
      ],
      vi.fn(),
    );

    for (const ch of "gpt") sub.handleInput(ch);
    let rendered = sub.render(60)!.join("\n");
    expect(rendered).toContain("gpt-5.6");
    expect(rendered).not.toContain("claude-fable-5");
    expect(rendered).toContain("filter: gpt");

    sub.handleInput("\x7f"); // backspace -> "gp"
    sub.handleInput("\x7f");
    sub.handleInput("\x7f"); // empty again
    rendered = sub.render(60)!.join("\n");
    expect(rendered).toContain("claude-fable-5");
  });

  const MODELS = [
    { value: "anthropic/claude-sonnet-4.5", label: "claude-sonnet-4.5" },
    { value: "anthropic/claude-opus-4.6", label: "claude-opus-4.6" },
    { value: "openai-codex/gpt-5.6", label: "gpt-5.6", description: "openai-codex" },
  ];

  function renderAfter(query: string): string {
    const sub = new SubmenuController(theme);
    sub.openSingleSelect(MODELS, vi.fn());
    for (const ch of query) sub.handleInput(ch);
    return sub.render(80)!;
  }

  it("matches a substring, not just a prefix", () => {
    const rendered = renderAfter("sonnet").join("\n");
    expect(rendered).toContain("claude-sonnet-4.5");
    expect(rendered).not.toContain("claude-opus-4.6");
    expect(rendered).not.toContain("gpt-5.6");
  });

  it("ranks the real match above a loose fuzzy one", () => {
    const lines = renderAfter("anthropic/opus");
    const opus = lines.findIndex((l) => l.includes("claude-opus-4.6"));
    const sonnet = lines.findIndex((l) => l.includes("claude-sonnet-4.5"));
    expect(opus).toBeGreaterThanOrEqual(0);
    // fuzzy subsequence means sonnet can also match; it must rank below.
    expect(sonnet === -1 || opus < sonnet).toBe(true);
  });

  it("matches the description too", () => {
    const rendered = renderAfter("codex").join("\n");
    expect(rendered).toContain("gpt-5.6");
    expect(rendered).not.toContain("claude-sonnet-4.5");
  });

  it("requires every whitespace-separated token", () => {
    const rendered = renderAfter("claude 4.6").join("\n");
    expect(rendered).toContain("claude-opus-4.6");
    expect(rendered).not.toContain("claude-sonnet-4.5");
  });

  it("keeps the highlighted item selected while filtering narrows around it", () => {
    const sub = new SubmenuController(theme);
    sub.openSingleSelect(MODELS, vi.fn(), undefined, 10, 1); // opus highlighted
    for (const ch of "opus") sub.handleInput(ch);
    const rendered = sub.render(80)!.join("\n");
    expect(rendered).toContain("→ claude-opus-4.6");
  });
});
