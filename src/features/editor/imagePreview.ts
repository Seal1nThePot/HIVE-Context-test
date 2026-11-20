import {StateEffect, StateField, Transaction} from '@codemirror/state';
import {WidgetType, type EditorView} from '@codemirror/view';
import {createUiIcon} from '../../shared/icons';
import {localImageUrl, type ImageContext} from './insertions';
import type {PreviewReplacement} from './markdownPresentation';

type ImageSize = {from: number; to: number; src: string; width: number};
const setImageSize = StateEffect.define<ImageSize>();
export const imageViewSizes = StateField.define<ReadonlyMap<number, ImageSize>>({
  create: () => new Map(),
  update(sizes, transaction) {
    const resized = transaction.effects.find(effect => effect.is(setImageSize));
    if (!resized && (!transaction.docChanged || !sizes.size)) return sizes;
    const next = new Map<number, ImageSize>();
    for (const size of sizes.values()) {
      if (transaction.changes.touchesRange(size.from + 1, size.to - 1)) continue;
      const from = transaction.changes.mapPos(size.from, 1), to = transaction.changes.mapPos(size.to, -1);
      next.set(from, {...size, from, to});
    }
    if (resized?.is(setImageSize)) {
      const size = resized.value;
      if (size.width >= 1) next.delete(size.from);
      else next.set(size.from, size);
    }
    return next;
  },
});

const activeDrag = new WeakMap<HTMLElement, () => void>();
const clampWidth = (width: number) => Math.max(.08, Math.min(1, width));

export class ImagePreviewWidget extends WidgetType {
  constructor(readonly item: PreviewReplacement, readonly context: ImageContext | null, readonly width: number, readonly readOnly: boolean) { super(); }

  eq(other: ImagePreviewWidget) {
    return this.item.from === other.item.from && this.item.to === other.item.to && this.item.src === other.item.src &&
      this.item.text === other.item.text && this.width === other.width && this.readOnly === other.readOnly &&
      this.context?.workspace === other.context?.workspace && this.context?.file === other.context?.file;
  }

  toDOM(view: EditorView) {
    const document = view.dom.ownerDocument;
    const surface = document.createElement('span');
    surface.className = 'cm-preview-image';

    const {from, to, text} = this.item;
    const src = this.item.src || '';
    surface.title = '图片：' + text + (this.readOnly ? '' : ' · 点击编辑 Markdown');
    surface.addEventListener('mousedown', event => {
      if (view.state.readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({selection: {anchor: from + 1}, userEvent: 'select.widget'});
      view.focus();
    });
    const fallback = () => {
      surface.classList.add('cm-preview-image-unavailable');
      surface.replaceChildren(createUiIcon(document, 'Image', 14), text ?? '');
      view.requestMeasure();
    };
    const url = localImageUrl(src, this.context);
    if (!url) {
      fallback();
      return surface;
    }

    const resize = (width: number) => {
      surface.style.setProperty('--hive-image-view-width', (width * 100) + '%');
      view.requestMeasure();
    };
    const apply = (width: number) => {
      if (width === this.width) return;
      view.dispatch({effects: setImageSize.of({from, to, src, width}), annotations: Transaction.addToHistory.of(false)});
    };

    const image = document.createElement('img');
    image.alt = text || '图片';
    image.decoding = 'async';
    image.draggable = false;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'cm-preview-image-resize';
    handle.setAttribute('aria-label', '调整图片显示大小');
    handle.title = '拖动调整图片显示大小';
    handle.disabled = true;
    image.addEventListener('load', () => { handle.disabled = false; view.requestMeasure(); });
    image.addEventListener('error', () => { surface.title = '无法读取本地图片：' + text; fallback(); });
    image.src = url;
    resize(this.width);
    surface.append(image, handle);

    handle.addEventListener('mousedown', event => {event.preventDefault(); event.stopPropagation();});
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const width = event.key === 'Home' ? .08 : event.key === 'End' ? 1 :
        clampWidth(this.width + (event.key === 'ArrowUp' || event.key === 'ArrowRight' ? .05 : -.05));
      apply(width);
      if (width !== this.width) {
        const next = [...view.dom.querySelectorAll<HTMLButtonElement>('.cm-preview-image-resize')]
          .find(button => view.posAtDOM(button) === from);
        next?.focus();
      }
    });
    handle.addEventListener('pointerdown', event => {
      const box = image.getBoundingClientRect();
      if (event.button !== 0 || !event.isPrimary || !box.width || !box.height) return;
      event.preventDefault();
      event.stopPropagation();
      activeDrag.get(surface)?.();
      const win = surface.ownerDocument.defaultView!;
      const listeners = new AbortController();
      const pointer = event.pointerId, x = event.clientX, y = event.clientY;
      const fullWidth = box.width / this.width, heightToWidth = box.height / box.width;
      let width = this.width;
      const finish = (commit: boolean) => {
        listeners.abort();
        activeDrag.delete(surface);
        surface.classList.remove('cm-preview-image-resizing');
        if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
        if (commit) apply(width);
        else if (surface.isConnected) resize(this.width);
      };
      activeDrag.set(surface, () => finish(false));
      surface.classList.add('cm-preview-image-resizing');
      try { handle.setPointerCapture(pointer); } catch { /* Window listeners still receive pointer events. */ }
      const options = {signal: listeners.signal, capture: true};
      win.addEventListener('pointermove', move => {
        if (move.pointerId !== pointer) return;
        move.preventDefault();
        move.stopPropagation();
        const projected = (move.clientX - x + heightToWidth * (move.clientY - y)) / (1 + heightToWidth ** 2);
        width = clampWidth(this.width + projected / fullWidth);
        resize(width);
      }, options);
      win.addEventListener('pointerup', up => {
        if (up.pointerId !== pointer) return;
        up.stopPropagation();
        finish(true);
      }, options);
      win.addEventListener('pointercancel', cancel => { if (cancel.pointerId === pointer) finish(false); }, options);
      win.addEventListener('blur', () => finish(false), options);
      handle.addEventListener('lostpointercapture', () => finish(false), options);
    });
    return surface;
  }

  destroy(dom: HTMLElement) { activeDrag.get(dom)?.(); }
  ignoreEvent(event: Event) { return !!(event.target as Element | null)?.closest?.('.cm-preview-image-resize'); }
}
