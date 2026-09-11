// src/submenu.ts
// Reusable submenu controller wrapping SelectList.
//
// Solves the SelectList API limitations:
//   - No setItems: recreates the list on toggle (multi-select mode)
//   - No getItems: tracks selection in a Set externally
//   - Preserves scroll position across rebuilds via setSelectedIndex
//   - Single source of truth for open/close/render/handleInput lifecycle
//
// Usage:
//   const submenu = new SubmenuController(theme);
//   submenu.openSingleSelect(items, onSelect);
//   submenu.openMultiSelect(items, selectedValues, onApply);
//   // In render: submenu.render(width) → string[] | null
//   // In handleInput: submenu.handleInput(data) → boolean (true = consumed)

import { SelectList, fuzzyMatch, type SelectItem } from "@earendil-works/pi-tui";

/**
 * Field weights: a fuzzy hit inside the label (the model id, what the user is
 * usually typing) must beat one that only hit the provider or description.
 * Without this, "opus" scored better against "anthropic/claude-sonnet" (the
 * letters o,p,u clustering inside "anthropic/claude") than against the actual
 * opus id.
 */
const FIELD_PENALTY = { label: 0, value: 25, description: 50 } as const;

/**
 * pi-tui's fuzzyFilter scores one concatenated string, so provider text can
 * outscore the model id. Rank per token over separate weighted fields instead:
 * a token takes its best field, and every token must match somewhere.
 */
function rankItems(items: SelectItem[], query: string): SelectItem[] {
  const tokens = query.trim().split(/[\s/]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return items;

  const scored: { item: SelectItem; score: number }[] = [];
  for (const item of items) {
    const fields: { text: string; penalty: number }[] = [
      { text: item.label || item.value, penalty: FIELD_PENALTY.label },
      { text: item.value, penalty: FIELD_PENALTY.value },
    ];
    if (item.description) {
      fields.push({ text: item.description, penalty: FIELD_PENALTY.description });
    }

    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      let best = Number.POSITIVE_INFINITY;
      for (const field of fields) {
        const match = fuzzyMatch(token, field.text);
        if (match.matches) best = Math.min(best, match.score + field.penalty);
      }
      if (best === Number.POSITIVE_INFINITY) {
        matchedAll = false;
        break;
      }
      score += best;
    }
    if (matchedAll) scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}

export type SubmenuMode = "provider" | "ids" | "reasoning" | "patterns" | null;

interface SubmenuTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export class SubmenuController {
  private selectList: SelectList | null = null;
  private theme: SubmenuTheme;
  private selectedIndex = 0;

  // Multi-select state
  private multiSelected = new Set<string>();
  private multiItems: SelectItem[] = [];
  private multiMaxVisible = 12;

  // Single-select state (kept so the list can be rebuilt on filter change)
  private singleItems: SelectItem[] = [];
  private singleMaxVisible = 10;
  private isMultiSelect = false;

  // Callbacks
  private onSelectSingle: ((item: SelectItem) => void) | null = null;
  private onApplyMulti: ((selected: string[]) => void) | null = null;
  private onClose: (() => void) | null = null;

  // Current mode
  public mode: SubmenuMode = null;

  // Type-to-filter query (SelectList does not handle typing itself)
  private filterText = "";

  /**
   * SelectList.setFilter only does a case-insensitive prefix match on value, so
   * "sonnet" never finds "anthropic/claude-sonnet-4". We filter ourselves and
   * rebuild the list with the survivors.
   */
  private filterItems(): SelectItem[] {
    const source = this.isMultiSelect ? this.multiItems : this.singleItems;
    return rankItems(source, this.filterText);
  }

  /** Re-apply the filter, keeping the highlighted item when it survives. */
  private applyFilter(next: string): void {
    const prevValue = this.selectList?.getSelectedItem?.()?.value ?? null;
    this.filterText = next;
    if (this.isMultiSelect) this.buildMultiSelectList();
    else this.buildSingleList();
    if (prevValue !== null && this.selectList) {
      const idx = this.filterItems().findIndex((i) => i.value === prevValue);
      this.selectList.setSelectedIndex(idx >= 0 ? idx : 0);
    }
  }

  constructor(theme: SubmenuTheme) {
    this.theme = theme;
  }

  /** Open a single-select submenu. onSelect is called immediately on Enter. */
  openSingleSelect(
    items: SelectItem[],
    onSelect: (item: SelectItem) => void,
    onClose?: () => void,
    maxVisible?: number,
    initialIndex?: number,
  ): void {
    this.close();
    this.mode = "provider"; // caller should set mode after
    this.onSelectSingle = onSelect;
    this.onApplyMulti = null;
    this.onClose = onClose ?? null;
    this.selectedIndex = initialIndex ?? 0;
    this.singleItems = items;
    this.singleMaxVisible = maxVisible ?? 10;
    this.isMultiSelect = false;

    this.buildSingleList();
  }

  private buildSingleList(): void {
    const items = this.filterItems();
    this.selectList = new SelectList(
      items,
      Math.min(items.length, this.singleMaxVisible),
      this.theme,
    );
    this.selectList.setSelectedIndex(this.selectedIndex);
    this.selectList.onSelect = (item) => {
      this.onSelectSingle?.(item);
      this.close();
    };
    this.selectList.onCancel = () => {
      this.close();
    };
  }

  /** Open a multi-select checklist. onApply is called on close with selected values. */
  openMultiSelect(
    items: SelectItem[],
    initiallySelected: Set<string>,
    onApply: (selected: string[]) => void,
    onClose?: () => void,
    maxVisible?: number,
  ): void {
    this.close();
    this.mode = "ids"; // caller should set mode after
    this.onSelectSingle = null;
    this.onApplyMulti = onApply;
    this.onClose = onClose ?? null;
    this.selectedIndex = 0;
    this.multiSelected = new Set(initiallySelected);
    this.multiItems = items;
    this.multiMaxVisible = maxVisible ?? 12;
    this.isMultiSelect = true;

    this.buildMultiSelectList();
  }

  /** Update multi-select items (e.g. after provider change). Preserves selection. */
  updateMultiItems(
    items: SelectItem[],
    maxVisible?: number,
  ): void {
    this.multiItems = items;
    if (maxVisible !== undefined) this.multiMaxVisible = maxVisible;
    this.buildMultiSelectList();
  }

  private buildMultiSelectList(): void {
    const labeled = this.filterItems().map((item) => ({
      value: item.value,
      label: `${this.multiSelected.has(item.value) ? "✓" : " "} ${item.label}`,
      description: item.description,
    }));

    this.selectList = new SelectList(
      labeled,
      Math.min(labeled.length, this.multiMaxVisible),
      this.theme,
    );
    this.selectList.setSelectedIndex(this.selectedIndex);

    this.selectList.onSelect = (item) => {
      // Toggle
      if (this.multiSelected.has(item.value)) {
        this.multiSelected.delete(item.value);
      } else {
        this.multiSelected.add(item.value);
      }
      // Rebuild (SelectList has no setItems)
      this.buildMultiSelectList();
    };

    this.selectList.onCancel = () => {
      this.applyAndClose();
    };
  }

  /** Close the submenu. Applies multi-select if active. */
  close(): void {
    if (this.onApplyMulti && this.multiSelected.size >= 0) {
      this.onApplyMulti([...this.multiSelected]);
    }
    this.selectList = null;
    this.onSelectSingle = null;
    this.onApplyMulti = null;
    this.filterText = "";
    this.singleItems = [];
    this.multiItems = [];
    this.isMultiSelect = false;
    const cb = this.onClose;
    this.onClose = null;
    this.mode = null;
    cb?.();
  }

  /** Force-close without applying multi-select (e.g. on Escape). */
  cancel(): void {
    this.selectList = null;
    this.onSelectSingle = null;
    this.onApplyMulti = null;
    this.filterText = "";
    this.singleItems = [];
    this.multiItems = [];
    this.isMultiSelect = false;
    this.mode = null;
    this.onClose?.();
    this.onClose = null;
  }

  /** Apply multi-select and close. */
  private applyAndClose(): void {
    if (this.onApplyMulti) {
      this.onApplyMulti([...this.multiSelected]);
    }
    this.selectList = null;
    this.onSelectSingle = null;
    this.onApplyMulti = null;
    this.filterText = "";
    this.singleItems = [];
    this.multiItems = [];
    this.isMultiSelect = false;
    this.mode = null;
    this.onClose?.();
    this.onClose = null;
  }

  /** Render the submenu. Returns lines or null if no submenu is open. */
  render(width: number): string[] | null {
    if (!this.selectList) return null;
    const lines = this.selectList.render(width);
    if (this.filterText) lines.unshift(this.theme.scrollInfo(`filter: ${this.filterText}`));
    return lines;
  }

  /**
   * Handle keyboard input. Returns true if consumed.
   * For single-select: Enter selects, Escape cancels.
   * For multi-select: Enter toggles, Escape applies and closes.
   */
  handleInput(data: string): boolean {
    if (!this.selectList) return false;

    // Type-to-filter: printable chars extend the query, backspace shrinks it.
    if (data === "\x7f" || data === "\b") {
      if (this.filterText) {
        this.applyFilter(this.filterText.slice(0, -1));
      }
      return true;
    }
    if (data.length === 1 && data >= " ") {
      this.applyFilter(this.filterText + data);
      return true;
    }

    // Track position before input
    const sel = this.selectList.getSelectedItem?.();
    if (sel) {
      // Find index in the original items (multi) or current items
      this.selectedIndex = Math.max(0,
        this.multiItems.findIndex((i) => i.value === sel.value) >= 0
          ? this.multiItems.findIndex((i) => i.value === sel.value)
          : this.selectedIndex
      );
    }

    this.selectList.handleInput(data);

    // Enter/Esc callbacks may have closed the submenu (selectList = null)
    if (!this.selectList) return true;

    // Update tracked index after input
    const newSel = this.selectList.getSelectedItem?.();
    if (newSel && this.isMultiSelect) {
      const idx = this.multiItems.findIndex((i) => i.value === newSel.value);
      if (idx >= 0) this.selectedIndex = idx;
    }

    return true;
  }

  /** Whether a submenu is currently open. */
  get isOpen(): boolean {
    return this.selectList !== null;
  }
}
