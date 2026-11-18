const limit = 10;
const storageKey = (workspaceId: string) => 'hive.recentDocuments.v1:' + workspaceId;
const unsavedHistory = new Map<string, string[]>();

export function readRecentDocuments(workspaceId: string): string[] {
  if (!workspaceId) return [];
  const unsaved = unsavedHistory.get(workspaceId);
  if (unsaved) return [...unsaved];

  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(workspaceId)) ?? '[]');
    if (!Array.isArray(stored)) return [];

    const paths = new Set<string>();
    for (const path of stored) {
      if (typeof path === 'string' && path.trim()) paths.add(path);
      if (paths.size === limit) break;
    }
    return [...paths];
  } catch {
    return [];
  }
}

export function rememberRecentDocument(workspaceId: string, path: string): string[] {
  const current = readRecentDocuments(workspaceId);
  if (!workspaceId || !path.trim()) return current;
  if (current[0] === path && !unsavedHistory.has(workspaceId)) return current;

  const next = [path, ...current.filter(item => item !== path)].slice(0, limit);
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
    unsavedHistory.delete(workspaceId);
  } catch {
    unsavedHistory.set(workspaceId, [...next]);
  }
  return next;
}
