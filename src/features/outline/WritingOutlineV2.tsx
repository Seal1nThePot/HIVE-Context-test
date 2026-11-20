import {useRef, useState, type FormEvent} from 'react';
import {Check, ChevronRight, GripVertical, ListTree, LocateFixed, Plus, RotateCcw, Trash2} from "../../shared/icons";
import type {Heading} from '../../shared/core';
import ChildWindow from '../workspace/ChildWindow';
import {headingKey, moveWritingNode, targetForNode, type WritingNode} from './writingNodes';
import './writing-outline.css';

type Props = {
  items: Heading[];
  nodes: WritingNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLocate: (from: number) => void;
  onWrite: (id: string) => void;
  onSave: (nodes: WritingNode[]) => Promise<void>;
  busy: boolean;
  ready: boolean;
  onRetry: () => void;
};

export default function WritingOutlineV2({items, nodes, selectedId, onSelect, onLocate, onWrite, onSave, busy, ready, onRetry}: Props) {
  const [editor, setEditor] = useState<{draft: WritingNode; original: WritingNode | null} | null>(null);
  const [undo, setUndo] = useState<{node: WritingNode; index: number}[]>([]);
  const dragged = useRef<string | null>(null);
  const [drop, setDrop] = useState<{id: string; side: 'before' | 'after'} | null>(null);
  const saving = useRef(false);
  const [editError, setEditError] = useState('');

  async function save(next: WritingNode[]) {
    if (saving.current || busy || !ready) return false;
    saving.current = true;
    try {
      await onSave(next);
      return true;
    } catch (error) {
      if (editor) setEditError((error as Error).message || '大纲未保存，请重试。');
      return false;
    } finally {
      saving.current = false;
    }
  }

  function openEditor(node?: WritingNode) {
    setEditError('');
    if (node) onSelect(node.id);
    setEditor({
      draft: node ? {...node} : {id: crypto.randomUUID(), title: '', description: '', level: 2, targetHeading: null},
      original: node ?? null,
    });
  }

  function closeEditor() {
    if (!saving.current && !busy) setEditor(null);
  }

  function updateDraft(values: Partial<WritingNode>) {
    setEditError('');
    setEditor(current => current && {...current, draft: {...current.draft, ...values}});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !editor.draft.title.trim()) return;
    const {draft, original} = editor;
    if (original && !nodes.some(node => node.id === draft.id)) {
      setEditError('此节点已删除，请关闭窗口并重新打开大纲。');
      return;
    }
    setEditError('');
    const next = original ? nodes.map(node => node.id === draft.id ? draft : node) : [...nodes, draft];
    if (await save(next)) {
      onSelect(draft.id);
      setEditor(null);
    }
  }

  async function remove(node: WritingNode) {
    const index = nodes.findIndex(value => value.id === node.id);
    if (await save(nodes.filter(value => value.id !== node.id))) setUndo(stack => [...stack, {node, index}]);
  }

  async function undoRemove() {
    const entry = undo.at(-1);
    if (!entry) return;
    const next = [...nodes];
    if (!next.some(node => node.id === entry.node.id)) next.splice(Math.min(entry.index, next.length), 0, entry.node);
    if (await save(next)) setUndo(stack => stack.slice(0, -1));
  }

  function clearDrag() {
    dragged.current = null;
    setDrop(null);
  }

  const draft = editor?.draft;
  const original = editor?.original;
  const target = original ? targetForNode(original, items) : undefined;
  const edited = !!draft && !!original && (
    draft.title !== original.title || draft.description !== original.description ||
    draft.level !== original.level || draft.targetHeading !== original.targetHeading
  );

  return <div className="writing-outline">
    <div className="outline-view-switch">
      <button type="button" className="new-outline-node" aria-label="新建大纲节点" title="新建大纲节点" disabled={busy || !ready} onClick={() => openEditor()}><Plus size={14}/></button>
    </div>
    <div className="writing-nodes" aria-label="写作大纲节点">
      <div className="outline-manage-hint">
        <span>{ready ? '独立写作节点 · 不删除正文' : '正在载入大纲…'}</span>
        {!ready && <button type="button" onClick={onRetry}>重新载入大纲</button>}
        {undo.length > 0 && <button type="button" aria-label="撤回删除大纲节点" disabled={busy || !ready} onClick={() => void undoRemove()}><RotateCcw size={11}/>撤回删除</button>}
      </div>
      {nodes.map((node, index) => <article key={node.id}
        className={`writing-outline-row${selectedId === node.id ? ' selected' : ''}`}
        data-drop={drop?.id === node.id ? drop.side : undefined}
        onDragOver={event => {
          if (!dragged.current || busy) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const sourceIndex = nodes.findIndex(candidate => candidate.id === dragged.current);
          const side = sourceIndex < index ? 'after' : 'before';
          setDrop(previous => sourceIndex === index || sourceIndex < 0 ? null : previous?.id === node.id ? previous : {id: node.id, side});
        }}
        onDrop={event => {
          const sourceId = dragged.current;
          if (!sourceId) return;
          event.preventDefault();
          clearDrag();
          const sourceIndex = nodes.findIndex(candidate => candidate.id === sourceId);
          if (sourceIndex >= 0 && sourceIndex !== index) void save(moveWritingNode(nodes, sourceId, index - sourceIndex));
        }}>
        <button type="button" className="icon-button outline-sort-handle" aria-label={`调整大纲节点顺序：${node.title}`} title="拖动排序，或使用上下方向键"
          draggable={!busy && ready} disabled={busy || !ready}
          onDragStart={event => {
            if (busy || !ready) { event.preventDefault(); return; }
            dragged.current = node.id;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/x-hive-outline-node', node.id);
            const row = event.currentTarget.parentElement;
            if (row) event.dataTransfer.setDragImage(row, 14, row.offsetHeight / 2);
          }}
          onDragEnd={clearDrag}
          onKeyDown={event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            event.stopPropagation();
            const delta = event.key === 'ArrowUp' ? -1 : 1;
            if (index + delta >= 0 && index + delta < nodes.length) void save(moveWritingNode(nodes, node.id, delta));
          }}>
          <GripVertical size={15}/>
        </button>
        <span className="outline-row-number">{String(index + 1).padStart(2, '0')}</span>
        <button type="button" className="outline-row-title" aria-haspopup="dialog" aria-label={`编辑大纲节点：${node.title}`} disabled={busy || !ready} onClick={() => openEditor(node)}><span>{node.title}</span></button>
        <button type="button" className="icon-button outline-row-delete" aria-label={`删除大纲节点：${node.title}`} title="删除节点，可撤回" disabled={busy || !ready} onClick={() => void remove(node)}><Trash2 size={13}/></button>
      </article>)}
      {ready && !nodes.length && <div className="empty-outline">
        <ListTree size={22}/>
        <p>从一个新的写作节点开始。</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => openEditor()}><Plus size={13}/>新建节点</button>
      </div>}
    </div>
    {draft && <ChildWindow id="outline-node-editor" title={original ? '编辑大纲节点' : '新建大纲节点'} onClose={closeEditor} closeDisabled={busy}>
      <form className="outline-node-editor" onSubmit={submit}>
        <div className="outline-node-fields" inert={busy}>
          <label>节点标题<input aria-label="大纲节点标题" data-child-window-focus value={draft.title} maxLength={500} required onChange={event => updateDraft({title: event.target.value})}/></label>
          <label>写作要求<textarea aria-label="大纲节点写作要求" value={draft.description} maxLength={10000} placeholder="这个节点要表达什么？需要哪些材料、论点或限制？" onChange={event => updateDraft({description: event.target.value})}/></label>
          <div className="outline-node-options">
            <label>层级<select aria-label="大纲节点层级" value={draft.level} onChange={event => updateDraft({level: Number(event.target.value)})}>
              {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level} 级标题</option>)}
            </select></label>
            <label>正文位置<select aria-label="大纲节点正文位置" value={draft.targetHeading || ''} onChange={event => updateDraft({targetHeading: event.target.value || null})}>
              <option value="">文末创建本节点</option>
              {draft.targetHeading && !items.some(item => headingKey(items, item) === draft.targetHeading) && <option value={draft.targetHeading}>保留原关联章节</option>}
              {items.map(item => <option key={item.from} value={headingKey(items, item)}>{item.title}</option>)}
            </select></label>
          </div>
          {editError && <p className="outline-node-error" role="alert">{editError}</p>}
        </div>
        <footer className="outline-node-actions">
          {original && <div>
            {target && <button type="button" className="secondary-button" disabled={busy || edited} onClick={() => {closeEditor(); onLocate(target.from);}}><LocateFixed size={14}/>定位正文</button>}
            <button type="button" className="secondary-button" disabled={busy || edited} title={edited ? '先保存节点修改' : undefined}
              onClick={() => {closeEditor(); onWrite(original.id);}}>按此节点完成<ChevronRight size={14}/></button>
          </div>}
          <div className="outline-node-save">
            <button type="button" className="secondary-button" disabled={busy} onClick={closeEditor}>取消</button>
            <button type="submit" className="gold-button" disabled={busy || !ready || !draft.title.trim()}><Check size={14}/>{busy ? '保存中…' : '保存节点'}</button>
          </div>
        </footer>
      </form>
    </ChildWindow>}
  </div>;
}
