import { useEffect, useRef, useState } from "react";
import { Sparkles } from "../../shared/icons";
export default function FloatingOrb({
  busy,
  onOpen,
  initialPosition,
  onPosition,
}: {
  busy: boolean;
  onOpen: (position: { x: number; y: number }) => void;
  initialPosition?: { x: number; y: number };
  onPosition?: (position: { x: number; y: number }) => void;
}) {
  const [position, setPosition] = useState(() => {
      const point = initialPosition || {
        x: window.innerWidth - 72,
        y: Math.max(70, window.innerHeight - 170),
      };
      return {
        x: Math.max(6, Math.min(window.innerWidth - 52, point.x)),
        y: Math.max(6, Math.min(window.innerHeight - 52, point.y)),
      };
    }),
    dragged = useRef(false),
    cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    const clamp = () =>
      setPosition((old) => ({
        x: Math.max(6, Math.min(window.innerWidth - 52, old.x)),
        y: Math.max(6, Math.min(window.innerHeight - 52, old.y)),
      }));
    window.addEventListener("resize", clamp);
    return () => {
      window.removeEventListener("resize", clamp);
      cleanup.current?.();
    };
  }, []);
  return (
    <button
      className={"writing-orb " + (busy ? "orb-busy" : "")}
      style={{ left: position.x, top: position.y }}
      aria-label="展开写作伙伴"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") dragged.current = false;
      }}
      title={
        busy ? "写作伙伴正在生成 · 点击展开" : "写作伙伴 · 拖动移动，点击展开"
      }
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragged.current = false;
        const start = position,
          x = event.clientX,
          y = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
          const dx = e.clientX - x,
            dy = e.clientY - y;
          if (Math.hypot(dx, dy) > 4) dragged.current = true;
          if (dragged.current) {
            const next = {
              x: Math.max(6, Math.min(window.innerWidth - 52, start.x + dx)),
              y: Math.max(6, Math.min(window.innerHeight - 52, start.y + dy)),
            };
            setPosition(next);
            onPosition?.(next);
          }
        };
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          cleanup.current = null;
        };
        cleanup.current?.();
        cleanup.current = end;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      }}
      onClick={() => {
        if (!dragged.current) onOpen(position);
      }}
    >
      <Sparkles size={21} />
      {busy && <i />}
    </button>
  );
}
