import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { minimalReplacement } from '../../shared/core';
import type { ApiClient } from '../../shared/api';
import type { DiskFile } from '../../shared/fileTypes';
import type { EditorSession } from '../editor/editorSessionTypes';
import type { Entry } from './explorerState';
import type { WorkspaceInfo } from './WorkspaceContext';
import { diskSyncDecision } from './fileSync';
type PersistenceOptions = {
    api: ApiClient;
    sessions: RefObject<Map<string, EditorSession>>;
    activeSession: RefObject<string>;
    disk: RefObject<DiskFile | null>;
    switching: RefObject<boolean>;
    structuring: RefObject<boolean>;
    fileBusy: boolean;
    tick: number;
    autoSave: boolean;
    setDirty: (dirty: boolean) => void;
    setFileBusy: (busy: boolean) => void;
    setEntries: Dispatch<SetStateAction<Entry[]>>;
    setError: (message: string) => void;
    inform: (message: string) => void;
    redraw: () => void;
};
export function useDocumentPersistence({ api, sessions, activeSession, disk, switching, structuring, fileBusy, tick, autoSave, setDirty, setFileBusy, setEntries, setError, inform, redraw }: PersistenceOptions) {
    const savingPaths = useRef(new Set<string>()), syncRunning = useRef(false);
    const [fileConflicts, setFileConflicts] = useState<Record<string, string>>({});
    const conflicts = useRef<Record<string, string>>({});
    function setConflict(path: string, message: string) { if (conflicts.current[path] === message)
        return; conflicts.current = { ...conflicts.current, [path]: message }; setFileConflicts(conflicts.current); }
    async function saveSession(id: string, quiet = false): Promise<boolean> {
        const session = sessions.current.get(id), source = session?.disk, state = session?.view?.state || session?.state;
        if (!session || !state)
            return true;
        if (!source)
            return !session.dirty;
        if (savingPaths.current.has(source.path))
            return false;
        const snapshot = state.doc.toString();
        savingPaths.current.add(source.path);
        if (!quiet)
            setFileBusy(true);
        try {
            const result = await api<{
                hash: string;
            }>("/file", { path: source.path, text: snapshot, baseline: source.hash, eol: source.eol, bom: source.bom });
            for (const other of sessions.current.values()) {
                if (other.disk?.path !== source.path)
                    continue;
                other.disk = { ...source, text: snapshot, hash: result.hash };
                other.dirty = (other.view?.state || other.state)?.doc.toString() !== snapshot;
            }
            const current = sessions.current.get(activeSession.current)!;
            disk.current = current.disk;
            setDirty(current.dirty);
            setConflict(source.path, '');
            redraw();
            if (!quiet)
                inform('已保存到本机。');
            return true;
        }
        catch (error) {
            setConflict(source.path, (error as Error).message);
            if (!quiet)
                setError((error as Error).message);
            return false;
        }
        finally {
            savingPaths.current.delete(source.path);
            if (!quiet)
                setFileBusy(false);
        }
    }
    function applyDiskFile(data: DiskFile) {
        for (const session of sessions.current.values()) {
            if (session.disk?.path !== data.path)
                continue;
            const state = session.view?.state || session.state;
            if (!state)
                continue;
            const before = state.doc.toString();
            session.disk = { ...data };
            session.dirty = false;
            if (session.id === activeSession.current)
                disk.current = session.disk;
            if (before !== data.text) {
                const change = minimalReplacement({ from: 0, to: before.length, original: before, file: data.path, stale: false }, data.text);
                const changes = { from: change.from, to: change.to, insert: change.text };
                if (session.view)
                    session.view.dispatch({ changes, userEvent: 'input.disk-sync' });
                else {
                    session.state = state.update({ changes }).state;
                    if (session.context) {
                        session.context.proposal = null;
                        session.context.undo = [];
                    }
                }
            }
        }
        const active = sessions.current.get(activeSession.current)!;
        disk.current = active.disk;
        setDirty(active.dirty);
        setConflict(data.path, '');
        redraw();
    }
    const syncLatest = useRef(async () => { });
    syncLatest.current = async () => {
        if (syncRunning.current || switching.current || fileBusy || structuring.current)
            return;
        syncRunning.current = true;
        try {
            const paths = [...new Set([...sessions.current.values()].flatMap(session => session.disk ? [session.disk.path] : []))];
            const baselines = new Map([...sessions.current.values()].filter(session => session.disk).map(session => [session.disk!.path, session.disk!.hash]));
            const data = await api<{
                entries: Entry[];
                workspace: WorkspaceInfo;
                files: (DiskFile | {
                    path: string;
                    error: string;
                })[];
            }>('/workspace/sync', { paths });
            setEntries(previous => JSON.stringify(previous) === JSON.stringify(data.entries) ? previous : data.entries);
            for (const remote of data.files) {
                if (savingPaths.current.has(remote.path))
                    continue;
                const matching = [...sessions.current.values()].filter(session => session.disk?.path === remote.path);
                if (matching.some(session => session.disk?.hash !== baselines.get(remote.path)))
                    continue;
                if ('error' in remote) {
                    if (matching.length)
                        setConflict(remote.path, remote.error + ' 本地内容仍保留，可另存副本。');
                    continue;
                }
                const decision = diskSyncDecision(matching.map(session => ({ baseline: session.disk!, text: (session.view?.state || session.state)?.doc.toString() || '' })), remote);
                if (decision === 'unchanged')
                    continue;
                if (decision === 'conflict') {
                    setConflict(remote.path, '磁盘和本地都有修改，已暂停自动保存。请核对后重新读取，或另存本地副本。');
                    continue;
                }
                applyDiskFile(remote);
            }
        }
        catch (error) {
            setError((error as Error).message);
        }
        finally {
            syncRunning.current = false;
        }
    };
    useEffect(() => { const timer = setInterval(() => void syncLatest.current(), 2000); return () => clearInterval(timer); }, []);
    useEffect(() => {
        if (!autoSave || switching.current || structuring.current)
            return;
        const timer = setTimeout(() => {
            for (const session of sessions.current.values())
                if (session.dirty && session.disk && !conflicts.current[session.disk.path])
                    void saveSession(session.id, true);
        }, 900);
        return () => clearTimeout(timer);
    }, [tick, autoSave]);
    return { savingPaths, fileConflicts, saveSession, applyDiskFile };
}
