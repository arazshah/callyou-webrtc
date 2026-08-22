import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { BoardElement, BoardPage } from '@callyou/shared';
import type { CallYouSocket } from '../socket';
const remoteOrigin = { remote: true };
export const DEFAULT_PAGE_ID = '00000000-0000-4000-8000-000000000001';
const defaultPage: BoardPage = {
  id: DEFAULT_PAGE_ID,
  title: 'صفحه ۱',
  createdAt: 1,
  updatedAt: 1,
};
export function useBoard(socket: CallYouSocket | null) {
  const doc = useMemo(() => new Y.Doc(), []);
  const elements = useMemo(() => doc.getMap<BoardElement>('elements'), [doc]);
  const pages = useMemo(() => doc.getMap<BoardPage>('pages'), [doc]);
  const localOrigin = useRef({ local: true });
  const undoManager = useMemo(
    () =>
      new Y.UndoManager(elements, {
        trackedOrigins: new Set([localOrigin.current]),
        captureTimeout: 400,
      }),
    [elements],
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!socket) return;
    const update = (data: Uint8Array) => Y.applyUpdate(doc, new Uint8Array(data), remoteOrigin);
    const cleared = () => socket.emit('board:sync-request');
    socket.on('board:sync', update);
    socket.on('board:yjs-update', update);
    socket.on('board:cleared', cleared);
    const onUpdate = (data: Uint8Array, origin: unknown) => {
      setVersion((v) => v + 1);
      if (origin !== remoteOrigin) socket.emit('board:yjs-update', data);
    };
    doc.on('update', onUpdate);
    socket.emit('board:sync-request');
    if (!pages.has(DEFAULT_PAGE_ID))
      doc.transact(() => pages.set(DEFAULT_PAGE_ID, defaultPage), localOrigin.current);
    return () => {
      socket.off('board:sync', update);
      socket.off('board:yjs-update', update);
      socket.off('board:cleared', cleared);
      doc.off('update', onUpdate);
    };
  }, [doc, pages, socket]);
  const transact = (fn: () => void) => doc.transact(fn, localOrigin.current);
  return {
    elements: [...elements.values()],
    pages: [...pages.values()].sort((a, b) => a.createdAt - b.createdAt),
    version,
    put: (value: BoardElement) => transact(() => elements.set(value.id, value)),
    remove: (id: string) => transact(() => elements.delete(id)),
    addPage: (page: BoardPage) => transact(() => pages.set(page.id, page)),
    renamePage: (id: string, title: string) =>
      transact(() => {
        const page = pages.get(id);
        if (page) pages.set(id, { ...page, title, updatedAt: Date.now() });
      }),
    removePage: (id: string) =>
      transact(() => {
        if (id === DEFAULT_PAGE_ID || pages.size <= 1) return;
        pages.delete(id);
        for (const [elementId, element] of elements)
          if (element.pageId === id) elements.delete(elementId);
      }),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
  };
}
