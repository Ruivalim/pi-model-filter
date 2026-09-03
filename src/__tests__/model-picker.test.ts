import { describe, it, expect, vi } from "vitest";
import { buildFilteredModelPicker } from "../model-picker";

const KEYS = { down: "\x1b[B", enter: "\r", escape: "\x1b" };

const MODELS = [
  { provider: "openai-codex", id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { provider: "claude-bridge", id: "claude-fable-5" },
  { provider: "deepseek", id: "deepseek-v4-flash" },
];

function mount(opts: Partial<Parameters<typeof buildFilteredModelPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  const factory = buildFilteredModelPicker({
    models: MODELS,
    current: { provider: "claude-bridge", id: "claude-fable-5" },
    onPick,
    onCancel,
    ...opts,
  });
  const tui = { requestRender: vi.fn() };
  const theme = { bold: (s: string) => s, fg: (_c: string, s: string) => s };
  let result: any = null;
  const c = factory(tui, theme, {}, (r: any) => (result = r));
  return { c, onPick, onCancel, result: () => result, render: () => c.render(80) };
}

describe("filtered model picker", () => {
  it("lists models with provider and marks current", () => {
    const m = mount();
    const lines = m.render();
    expect(lines.some((l) => l.includes("gpt-5.6-terra"))).toBe(true);
    expect(lines.some((l) => l.includes("claude-bridge") && l.includes("current"))).toBe(true);
  });

  it("pre-selects the current model", () => {
    const m = mount();
    m.c.handleInput(KEYS.enter); // enter without moving = current
    expect(m.onPick).toHaveBeenCalledWith(MODELS[1]);
  });

  it("picks the model under the cursor on Enter", () => {
    const m = mount();
    m.c.handleInput(KEYS.down); // from current (idx 1) to idx 2
    m.c.handleInput(KEYS.enter);
    expect(m.onPick).toHaveBeenCalledWith(MODELS[2]);
    expect(m.result().picked).toEqual(MODELS[2]);
  });

  it("cancels on Escape without picking", () => {
    const m = mount();
    m.c.handleInput(KEYS.escape);
    expect(m.onPick).not.toHaveBeenCalled();
    expect(m.onCancel).toHaveBeenCalled();
    expect(m.result().picked).toBeNull();
  });

  it("shows empty state and closes on Escape", () => {
    const m = mount({ models: [] });
    expect(m.render().some((l) => l.includes("No models available"))).toBe(true);
    m.c.handleInput(KEYS.escape);
    expect(m.result().picked).toBeNull();
  });
});
