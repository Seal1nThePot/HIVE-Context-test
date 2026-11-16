import type { Heading } from "../../shared/core";
export type WritingNode = {
  id: string;
  title: string;
  description: string;
  level: number;
  targetHeading: string | null;
};
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
export function targetForNode(node: WritingNode, items: Heading[]) {
  if(!node.targetHeading)return undefined;
  return (
    items.find((item) => headingKey(items, item) === node.targetHeading) ||
    (items.filter((item) => item.title === node.title).length === 1
      ? items.find((item) => item.title === node.title)
      : undefined)
  );
}
export function initialWritingNodes(
  items: Heading[],
  legacy: Record<string, string>,
) {
  const sections = items.some((item) => item.level > 1)
    ? items.filter((item) => item.level > 1)
    : items;
  return sections.map((item) => ({
    id: crypto.randomUUID(),
    title: item.title,
    description: legacy[headingKey(items, item)] || "",
    level: item.level,
    targetHeading: headingKey(items, item),
  }));
}
export function moveWritingNode(
  nodes: WritingNode[],
  id: string,
  delta: number,
) {
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) return nodes;
  const next = [...nodes],
    target = Math.max(0, Math.min(nodes.length - 1, index + delta));
  const [node] = next.splice(index, 1);
  next.splice(target, 0, node);
  return next;
}
