import {StateEffect, StateField, Transaction, type EditorState, type Text} from '@codemirror/state';
import {Decoration, WidgetType, type EditorView} from '@codemirror/view';
import {createUiIcon} from '../../shared/icons';
import {markdownTree} from './markdownParse';

type DetailsBlock = {
  from: number;
  headerTo: number;
  closingFrom: number;
  to: number;
  label: string;
  initiallyOpen: boolean;
};
type Span = {from: number; to: number};

const cachedBlocks = new WeakMap<Text, DetailsBlock[]>();
export function detailsBlocks(state: EditorState): DetailsBlock[] {
  const cached = cachedBlocks.get(state.doc);
  if (cached) return cached;
  const blocks: DetailsBlock[] = [];
  if (/<details(?:[ \t]+open)?[ \t]*>/i.test(state.doc.toString())) {
    const protectedSpans: Span[] = [];
    markdownTree(state).iterate({enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' ||
          node.name === 'HTMLBlock' && state.sliceDoc(node.from, node.from + 4) === '<!--') {
        protectedSpans.push({from: node.from, to: node.to});
        return false;
      }
    }});
    const stack: (Omit<DetailsBlock, 'closingFrom' | 'to'> | null)[] = [];
    const lines = state.doc.iterLines();
    let offset = 0, protectedIndex = 0, opening: {from: number; initiallyOpen: boolean} | null = null;
    for (let line = lines.next(); !line.done; line = lines.next()) {
      const from = offset, to = from + line.value.length;
      offset = to + 1;
      while (protectedIndex < protectedSpans.length && protectedSpans[protectedIndex].to <= from) protectedIndex++;
      if (protectedSpans[protectedIndex]?.from < to) continue;
      const pending = opening;
      opening = null;
      if (pending) {
        const summary = /^ {0,3}<summary>(.*?)<\/summary>[ \t]*$/i.exec(line.value);
        stack.push(summary ? {...pending, headerTo: to, label: summary[1].trim() || '折叠块'} : null);
        if (summary) continue;
      }
      const start = /^ {0,3}<details([ \t]+open)?[ \t]*>[ \t]*$/i.exec(line.value);
      if (start) {
        opening = {from, initiallyOpen: !!start[1]};
      } else if (/^ {0,3}<\/details>[ \t]*$/i.test(line.value)) {
        const header = stack.pop();
        if (header) blocks.push({...header, closingFrom: from, to});
      }
    }
    blocks.sort((a, b) => a.from - b.from);
  }
  cachedBlocks.set(state.doc, blocks);
  return blocks;
}

const setDetailsOpen = StateEffect.define<{from: number; open: boolean}>();
export const detailsOpenState = StateField.define<ReadonlyMap<number, boolean>>({
  create: () => new Map(),
  update(value, transaction) {
    const toggled = transaction.effects.find(effect => effect.is(setDetailsOpen));
    if (!toggled && (!transaction.docChanged || !value.size)) return value;
    let next = new Map(value);
    if (transaction.docChanged) {
      const positions = new Set(detailsBlocks(transaction.state).map(block => block.from));
      next = new Map();
      for (const [position, open] of value) {
        const from = transaction.changes.mapPos(position, 1);
        if (positions.has(from)) next.set(from, open);
      }
    }
    if (toggled?.is(setDetailsOpen)) next.set(toggled.value.from, toggled.value.open);
    return next;
  },
});

class DetailsToggle extends WidgetType {
  constructor(
    readonly block: DetailsBlock,
    readonly expanded: boolean,
    readonly editingHeader: boolean,
    readonly readOnly: boolean,
    readonly closeEditing: StateEffect<unknown>,
  ) { super(); }
  eq(other: DetailsToggle) {
    return this.expanded === other.expanded && this.readOnly === other.readOnly
      && this.editingHeader === other.editingHeader
      && this.block.from === other.block.from && this.block.headerTo === other.block.headerTo && this.block.to === other.block.to && this.block.label === other.block.label;
  }
  toDOM(view: EditorView) {
    const document = view.dom.ownerDocument;
    const heading = document.createElement('div');
    heading.className = 'cm-preview-details-heading';
    heading.dataset.detailsFrom = String(this.block.from);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-preview-details-toggle';
    button.setAttribute('aria-expanded', String(this.expanded));
    button.dataset.detailsAction = this.expanded ? '收起' : '展开';
    button.setAttribute('aria-label', button.dataset.detailsAction + '：' + this.block.label);
    button.append(createUiIcon(document, this.expanded ? 'disclosure.collapse' : 'disclosure.expand', 12), this.block.label);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.stopPropagation();
      const caret = view.state.selection.main;
      const selection = this.expanded && caret.from < this.block.to && caret.to > this.block.from
        ? {anchor: this.block.from}
        : undefined;
      view.dispatch({selection, effects: [setDetailsOpen.of({from: this.block.from, open: !this.expanded}), this.closeEditing],
        annotations: Transaction.addToHistory.of(false)});

      const next = view.dom.querySelector<HTMLButtonElement>('[data-details-from="' + this.block.from + '"] .cm-preview-details-toggle');
      if (event.detail === 0) next?.focus();
    });
    heading.append(button);
    if (this.editingHeader) {
      const hint = document.createElement('small');
      hint.className = 'cm-preview-details-hint';
      hint.textContent = '编辑下方标题';
      heading.append(hint);
    } else if (!this.readOnly) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'cm-preview-details-edit';
      edit.textContent = '编辑';
      edit.setAttribute('aria-label', '编辑折叠块源码');
      edit.addEventListener('mousedown', event => event.preventDefault());
      edit.addEventListener('click', () => {
        const summary = view.state.doc.lineAt(this.block.headerTo);
        view.dispatch({selection: {anchor: summary.from + summary.text.indexOf('>') + 1},
          effects: setDetailsOpen.of({from: this.block.from, open: true}), userEvent:'select.widget'});
        view.focus();
      });
      heading.append(edit);
    }
    return heading;
  }
}

export function detailsReplacements(state: EditorState, active: Span[], closeEditing: StateEffect<unknown>) {
  const ranges = [];
  const hidden: Span[] = [];
  const status = state.field(detailsOpenState, false);
  let collapsedEnd = -1;
  for (const block of detailsBlocks(state)) {
    if (block.from < collapsedEnd) continue;
    const editHeader = active.some(line => line.from <= block.headerTo && line.to >= block.from);
    const editBody = active.some(line => line.from < block.closingFrom && line.to > block.headerTo);
    const expanded = editHeader || editBody || (status?.get(block.from) ?? block.initiallyOpen);
    const widget = new DetailsToggle(block, expanded, editHeader, state.readOnly, closeEditing);
    if (editHeader) {
      ranges.push(Decoration.widget({block: true, side: -1, widget}).range(block.from));
    } else {
      const to = expanded ? block.headerTo : block.to;
      ranges.push(Decoration.replace({block: true, widget, inclusiveEnd: false}).range(block.from, to));
      hidden.push({from: block.from, to});
    }
    if (!expanded) {
      collapsedEnd = block.to;
    } else if (!active.some(line => line.from <= block.to && line.to >= block.closingFrom)) {
      const to = Math.min(state.doc.length, block.to + 1);
      ranges.push(Decoration.replace({block: true, inclusiveEnd: false}).range(block.closingFrom, to));
      hidden.push({from: block.closingFrom, to});
    }
  }
  return {ranges, hidden};
}
