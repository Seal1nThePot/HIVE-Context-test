import {usePanelDocument} from '../../shared/panelDocument';
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FileText,
  ListTree,
  PencilLine,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { Heading } from "../../shared/core";
import {
  headingKey,
  moveWritingNode,
  targetForNode,
  type WritingNode,
} from "./writingNodes";
export default function WritingOutlineV2({
  items,
  nodes,
  selectedId,
  onSelect,
  onLocate,
  onWrite,
  onSave,
  busy,
  ready,
  onRetry,
}: {
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
}) {
  const document=usePanelDocument(),window=document.defaultView!;
  const [view, setView] = useState<"nodes" | "toc">("nodes"),
    [editing, setEditing] = useState<WritingNode | null>(null),
    [undo, setUndo] = useState<{ node: WritingNode; index: number }[]>([]),
    [hover, setHover] = useState<{
      node: WritingNode;
      x: number;
      y: number;
    } | null>(null);
  async function save(next: WritingNode[]) {
    try {
      await onSave(next);
      return true;
    } catch {
      return false;
    }
  }
  async function remove(node: WritingNode) {
    const index = nodes.findIndex((value) => value.id === node.id);
    if (await save(nodes.filter((value) => value.id !== node.id)))
      setUndo((stack) => [...stack, { node, index }]);
    setHover(null);
  }
  return (
    <div className="writing-outline">
      <div className="outline-view-switch">
        <button
          className={view === "nodes" ? "active" : ""}
          onClick={() => setView("nodes")}
        >
          <ListTree size={12} />
          写作大纲
        </button>
        <button
          className={view === "toc" ? "active" : ""}
          onClick={() => setView("toc")}
        >
          <FileText size={12} />
          目录
        </button>
        {view === "nodes" && (
          <button
            className="new-outline-node"
            aria-label="新建大纲节点"
            title="新建大纲节点"
            disabled={busy || !ready}
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                title: "",
                description: "",
                level: 2,
                targetHeading: null,
              })
            }
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {view === "toc" ? (
        <nav className="outline-list" aria-label="文档目录">
          {items.map((item) => (
            <button
              key={item.from}
              onClick={() => onLocate(item.from)}
              style={{ paddingLeft: 14 + Math.max(0, item.level - 1) * 12 }}
            >
              <span className="outline-dot" />
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
      ) : (
        <div className="writing-nodes" aria-label="写作大纲节点">
          <div className="outline-manage-hint">
            <span>{ready ? "独立写作节点 · 不删除正文" : "正在载入大纲…"}</span>
            {!ready && <button onClick={onRetry}>重新载入大纲</button>}
            {undo.length > 0 && (
              <button
                aria-label="撤回删除大纲节点"
                disabled={busy}
                onClick={async () => {
                  const entry = undo.at(-1)!;
                  const next = [...nodes];
                  if (!next.some((node) => node.id === entry.node.id))
                    next.splice(
                      Math.min(entry.index, next.length),
                      0,
                      entry.node,
                    );
                  if (await save(next)) setUndo((stack) => stack.slice(0, -1));
                }}
              >
                <RotateCcw size={11} />
                撤回删除
              </button>
            )}
          </div>
          {nodes.map((node, index) => {
            const target = targetForNode(node, items);
            return (
              <article
                key={node.id}
                className={
                  "writing-node " + (selectedId === node.id ? "selected" : "")
                }
                onMouseEnter={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setHover({
                    node,
                    x: Math.max(
                      8,
                      Math.min(box.right + 10, window.innerWidth - 302),
                    ),
                    y: Math.max(
                      12,
                      Math.min(box.top, window.innerHeight - 230),
                    ),
                  });
                }}
                onMouseLeave={() => setHover(null)}
              >
                <div className="node-title">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <button
                    onClick={() => {
                      onSelect(node.id);
                      if (target) onLocate(target.from);
                    }}
                  >
                    {node.title}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"修改大纲节点：" + node.title}
                    title="修改标题与要求"
                    disabled={busy}
                    onClick={() => {
                      setHover(null);
                      setEditing({ ...node });
                    }}
                  >
                    <PencilLine size={12} />
                  </button>
                </div>
                <p>{node.description || "还没有写作要求，点击编辑补充。"}</p>
                <div className="node-management">
                  <small>{target ? "关联正文章节" : "文末创建本节点"}</small>
                  <button
                    className="icon-button"
                    aria-label={"上移大纲节点：" + node.title}
                    disabled={busy || index === 0}
                    onClick={() =>
                      void save(moveWritingNode(nodes, node.id, -1))
                    }
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"下移大纲节点：" + node.title}
                    disabled={busy || index === nodes.length - 1}
                    onClick={() =>
                      void save(moveWritingNode(nodes, node.id, 1))
                    }
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"删除大纲节点：" + node.title}
                    title="删除节点，保留正文；可撤回"
                    disabled={busy}
                    onClick={() => void remove(node)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="node-footer">
                  <span>
                    {node.description ? "已设写作要求" : "待补充要求"}
                  </span>
                  <button
                    onClick={() => {
                      setHover(null);
                      onWrite(node.id);
                    }}
                    aria-label={"按此节点完成：" + node.title}
                  >
                    按此节点完成
                    <ChevronRight size={11} />
                  </button>
                </div>
              </article>
            );
          })}
          {ready && !nodes.length && (
            <div className="empty-outline">
              <ListTree size={22} />
              <p>从一个新的写作节点开始。</p>
              <button
                className="secondary-button"
                onClick={() =>
                  setEditing({
                    id: crypto.randomUUID(),
                    title: "",
                    description: "",
                    level: 2,
                    targetHeading: null,
                  })
                }
              >
                <Plus size={13} />
                新建节点
              </button>
            </div>
          )}
        </div>
      )}
      {hover &&
        !editing &&
        createPortal(
          <div
            className="outline-description-tooltip"
            role="tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <small>节点写作要求</small>
            <strong>{hover.node.title}</strong>
            <p>
              {hover.node.description ||
                "尚未填写。可修改标题、写作要求、层级和对应章节。"}
            </p>
          </div>,
          document.body,
        )}
      {editing &&
        createPortal(
          <div className="modal-backdrop">
            <form
              className="modal outline-node-modal"
              onSubmit={async (event) => {
                event.preventDefault();
                const exists = nodes.some((node) => node.id === editing.id);
                const next = exists
                  ? nodes.map((node) =>
                      node.id === editing.id ? editing : node,
                    )
                  : [...nodes, editing];
                if (await save(next)) {
                  onSelect(editing.id);
                  setEditing(null);
                }
              }}
            >
              <div className="simple-modal-heading">
                <h2>
                  {nodes.some((node) => node.id === editing.id)
                    ? "修改大纲节点"
                    : "新建大纲节点"}
                </h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭大纲编辑"
                  onClick={() => setEditing(null)}
                >
                  <X size={17} />
                </button>
              </div>
              <label>
                节点标题
                <input
                  aria-label="大纲节点标题"
                  value={editing.title}
                  maxLength={500}
                  required
                  autoFocus
                  onChange={(event) =>
                    setEditing({ ...editing, title: event.target.value })
                  }
                />
              </label>
              <label>
                写作要求
                <textarea
                  aria-label="大纲节点写作要求"
                  value={editing.description}
                  maxLength={10000}
                  placeholder="这个节点要表达什么？需要哪些材料、论点或限制？"
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </label>
              <div className="outline-node-options">
                <label>
                  层级
                  <select
                    aria-label="大纲节点层级"
                    value={editing.level}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        level: Number(event.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((level) => (
                      <option key={level} value={level}>
                        {level} 级标题
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  正文位置
                  <select
                    aria-label="大纲节点正文位置"
                    value={editing.targetHeading || ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        targetHeading: event.target.value || null,
                      })
                    }
                  >
                    <option value="">文末创建本节点</option>
                    {items.map((item) => (
                      <option key={item.from} value={headingKey(items, item)}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="settings-note">
                大纲和正文分别维护。删除节点不删除已有正文；新节点可以由 AI
                在文末创建对应内容。
              </p>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  取消
                </button>
                <button
                  className="gold-button"
                  disabled={busy || !editing.title.trim()}
                >
                  <Check size={13} />
                  {busy ? "保存中…" : "保存节点"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
