import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronRight,
  FileText,
  ListTree,
  PencilLine,
} from "lucide-react";
import type { Heading } from "../../../shared/core";

export type OutlinePlans = Record<string, string>;
export function headingKey(items: Heading[], item: Heading) {
  const ancestors: Heading[] = [];
  for (const node of items) {
    while (ancestors.length && ancestors.at(-1)!.level >= node.level)
      ancestors.pop();
    ancestors.push(node);
    if (node.from === item.from)
      return (
        ancestors.map((n) => n.title).join(" / ") +
        " @" +
        items.filter((n) => n.from <= item.from && n.title === item.title)
          .length
      );
  }
  return item.title;
}
export default function WritingOutline({
  items,
  currentFrom,
  plans,
  onSave,
  onLocate,
  onWrite,
}: {
  items: Heading[];
  currentFrom: number | undefined;
  plans: OutlinePlans;
  onSave: (key: string, description: string) => Promise<void>;
  onLocate: (from: number) => void;
  onWrite: (from: number) => void;
}) {
  const [view, setView] = useState<"nodes" | "toc">("nodes"),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false);
  const [hover, setHover] = useState<{
    title: string;
    description: string;
    x: number;
    y: number;
  } | null>(null);
  const nodes = items.filter((item) => item.level > 1);
  const displayNodes = nodes.length ? nodes : items;
  return (
    <div className="writing-outline">
      <div className="outline-view-switch">
        <button
          className={view === "nodes" ? "active" : ""}
          onClick={() => {
            setView("nodes");
            setHover(null);
          }}
        >
          <ListTree size={12} />
          写作大纲
        </button>
        <button
          className={view === "toc" ? "active" : ""}
          onClick={() => {
            setView("toc");
            setHover(null);
          }}
        >
          <FileText size={12} />
          目录
        </button>
      </div>
      {view === "toc" ? (
        <nav className="outline-list" aria-label="文档目录">
          {items.map((item) => (
            <button
              key={item.from}
              className={currentFrom === item.from ? "active" : ""}
              onClick={() => onLocate(item.from)}
              style={{ paddingLeft: 14 + Math.max(0, item.level - 1) * 12 }}
              title={item.title}
            >
              {item.level === 1 ? (
                <FileText size={12} />
              ) : (
                <span className="outline-dot" />
              )}
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
      ) : (
        <div className="writing-nodes" aria-label="写作大纲节点">
          <p className="outline-explainer">为每个节点留下一份写作要求</p>
          {displayNodes.map((item, index) => {
            const key = headingKey(items, item),
              description = plans[key] || "";
            return (
              <article
                key={key}
                className={
                  "writing-node " +
                  (currentFrom === item.from ? "selected" : "")
                }
                onMouseEnter={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setHover({
                    title: item.title,
                    description:
                      description ||
                      "还没有写作描述。点击编辑，补充本节点要表达的观点、材料和范围。",
                    x: Math.min(box.right + 10, window.innerWidth - 302),
                    y: Math.max(
                      12,
                      Math.min(box.top, window.innerHeight - 210),
                    ),
                  });
                }}
                onMouseLeave={() => setHover(null)}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) {
                    const box = event.currentTarget.getBoundingClientRect();
                    setHover({
                      title: item.title,
                      description: description || "尚未填写写作描述。",
                      x: Math.min(box.right + 10, window.innerWidth - 302),
                      y: Math.max(
                        12,
                        Math.min(box.top, window.innerHeight - 210),
                      ),
                    });
                  }
                }}
                onBlur={(event) => {
                  if (
                    !event.currentTarget.matches(":hover") &&
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setHover(null);
                }}
                tabIndex={0}
                aria-label={
                  item.title +
                  "，" +
                  (description ? "已设置写作描述" : "未设置写作描述")
                }
              >
                <div className="node-title">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <button onClick={() => onLocate(item.from)}>
                    {item.title.replace(/^\d+\s*/, "")}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"编辑大纲描述：" + item.title}
                    title="编辑写作描述"
                    onClick={() => {
                      setEditing(key);
                      setDraft(description);
                      setHover(null);
                    }}
                  >
                    <PencilLine size={12} />
                  </button>
                </div>
                {editing === key ? (
                  <form
                    className="node-description-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setSaving(true);
                      try {
                        await onSave(key, draft);
                        setEditing(null);
                      } catch {
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <textarea
                      aria-label={"大纲描述：" + item.title}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="这一节点要表达什么？采用什么材料？有什么范围限制？"
                      autoFocus
                    />
                    <div>
                      <button type="button" onClick={() => setEditing(null)}>
                        取消
                      </button>
                      <button type="submit" disabled={saving}>
                        <Check size={12} />
                        {saving ? "保存中" : "保存描述"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>{description || "添加观点、材料与写作范围…"}</p>
                    <div className="node-footer">
                      <span>{description ? "已设写作描述" : "待补充描述"}</span>
                      <button
                        onClick={() => {
                          setHover(null);
                          onWrite(item.from);
                        }}
                        aria-label={"按此节点完成：" + item.title}
                      >
                        按此节点完成
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          {!items.length && (
            <p className="empty-note">
              先在正文中建立标题，再为节点填写写作要求。
            </p>
          )}
        </div>
      )}
      {hover &&
        editing === null &&
        createPortal(
          <div
            className="outline-description-tooltip"
            role="tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <small>节点写作描述</small>
            <strong>{hover.title}</strong>
            <p>{hover.description}</p>
          </div>,
          document.body,
        )}
    </div>
  );
}
