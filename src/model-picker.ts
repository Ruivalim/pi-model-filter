// src/model-picker.ts
// Filtered model switcher for /filtered-models (/fmodels).
//
// pi's built-in /models reads a cached snapshot from ModelRuntime and does
// not see this extension's registry patch, so blocked models still show
// there. This picker lists ctx.modelRegistry.getAvailable() (patched, so
// already filtered) and switches with pi.setModel().

import { SubmenuController } from "./submenu.js";

export interface PickerModel {
  provider: string;
  id: string;
  name?: string;
}

interface ModelPickerOptions {
  /** Already-filtered models (e.g. patched getAvailable()). */
  models: PickerModel[];
  /** Currently active model, marked in the list and pre-selected. */
  current?: { provider: string; id: string } | null;
  /** Called with the raw model object on Enter. */
  onPick: (model: PickerModel) => void;
  /** Escape without picking. */
  onCancel?: () => void;
}

export function buildFilteredModelPicker(opts: ModelPickerOptions) {
  return (tui: any, theme: any, _keybindings: any, done: (result: any) => void) => {
    const submenu = new SubmenuController({
      selectedPrefix: (t: string) => theme.fg("accent", t),
      selectedText: (t: string) => theme.fg("accent", t),
      description: (t: string) => theme.fg("muted", t),
      scrollInfo: (t: string) => theme.fg("dim", t),
      noMatch: (t: string) => theme.fg("warning", t),
    });

    const items = opts.models.map((m) => ({
      value: `${m.provider}/${m.id}`,
      label: `${m.id}`,
      description:
        m.provider + (m.name ? ` · ${m.name}` : "") +
        (opts.current && m.provider === opts.current.provider && m.id === opts.current.id
          ? " · current"
          : ""),
      model: m,
    }));

    const currentIdx = opts.current
      ? items.findIndex(
          (i) => i.model.provider === opts.current!.provider && i.model.id === opts.current!.id,
        )
      : -1;

    let settled = false;
    const finish = (result: any) => {
      if (settled) return;
      settled = true;
      done(result);
    };

    if (items.length > 0) {
      submenu.openSingleSelect(
        items,
        (item: any) => {
          opts.onPick(item.model);
          finish({ picked: item.model });
        },
        () => {
          opts.onCancel?.();
          finish({ picked: null });
        },
        15,
        currentIdx > 0 ? currentIdx : undefined,
      );
    }

    function render(width: number): string[] {
      const lines: string[] = [];
      lines.push(theme.bold(theme.fg("accent", "Switch model (filtered by pi-model-filter)")));
      if (opts.models.length === 0) {
        lines.push(theme.fg("warning", "No models available after filtering."));
        lines.push(theme.fg("muted", "Esc to close."));
      } else {
        lines.push(theme.fg("muted", "↑↓ navigate · Enter switch · type to filter · Esc cancel"));
        lines.push("");
        lines.push(...(submenu.render(width) ?? []));
      }
      return lines;
    }

    function handleInput(data: string) {
      if (opts.models.length === 0) {
        if (data === "\x1b") finish({ picked: null });
        return;
      }
      submenu.handleInput(data);
    }

    return {
      render,
      handleInput,
      invalidate: () => tui.requestRender(),
      // Test introspection
      _itemCount: () => items.length,
    };
  };
}
