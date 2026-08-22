import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowUpRight,
  Brush,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Crosshair,
  Download,
  FileDown,
  Archive,
  Eye,
  EyeOff,
  Highlighter,
  ImagePlus,
  Lock,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Pen,
  Plus,
  Redo2,
  RotateCw,
  WandSparkles,
  Square,
  Trash2,
  Type,
  Unlock,
  Undo2,
} from 'lucide-react';
import { LIMITS, type BoardElement } from '@callyou/shared';
import type { CallYouSocket } from '../socket';
import { DEFAULT_PAGE_ID, useBoard } from '../hooks/useBoard';
import { useI18n, type MessageKey } from '../i18n';
import { TextDialog } from './Modal';
import { prepareBoardAssets } from '../boardAssets';
type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'pan'
  | 'laser';
type Point = { x: number; y: number; pressure?: number | undefined };
const tools: Array<{ id: Tool; icon: typeof Pen; label: MessageKey }> = [
  { id: 'select', icon: MousePointer2, label: 'select' },
  { id: 'pen', icon: Pen, label: 'pen' },
  { id: 'highlighter', icon: Highlighter, label: 'highlighter' },
  { id: 'eraser', icon: Brush, label: 'eraser' },
  { id: 'line', icon: Minus, label: 'line' },
  { id: 'arrow', icon: ArrowUpRight, label: 'arrow' },
  { id: 'rectangle', icon: Square, label: 'rectangle' },
  { id: 'ellipse', icon: Circle, label: 'ellipse' },
  { id: 'text', icon: Type, label: 'text' },
  { id: 'pan', icon: Move, label: 'pan' },
  { id: 'laser', icon: Crosshair, label: 'laserPointer' },
];
function path(points: Point[], ox = 0, oy = 0) {
  if (!points.length) return '';
  return points.reduce((d, p, i) => `${d}${i ? ' L' : 'M'} ${p.x + ox} ${p.y + oy}`, '');
}
function bounds(el: BoardElement) {
  if (el.type === 'pen' || el.type === 'highlighter') {
    const points = el.points ?? [];
    const xs = points.map((p) => p.x + el.x),
      ys = points.map((p) => p.y + el.y);
    return {
      x: Math.min(...xs, el.x),
      y: Math.min(...ys, el.y),
      width: Math.max(1, Math.max(...xs, el.x) - Math.min(...xs, el.x)),
      height: Math.max(1, Math.max(...ys, el.y) - Math.min(...ys, el.y)),
    };
  }
  return {
    x: Math.min(el.x, el.x + (el.width ?? 0)),
    y: Math.min(el.y, el.y + (el.height ?? 0)) - (el.type === 'text' ? 24 : 0),
    width: Math.max(
      20,
      Math.abs(el.width ?? Math.max(50, (el.text?.length ?? 1) * el.strokeWidth * 5)),
    ),
    height: Math.max(20, Math.abs(el.height ?? 32) + (el.type === 'text' ? 24 : 0)),
  };
}
function renderElement(el: BoardElement, selected = false) {
  const common = {
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    opacity: el.opacity,
    fill: el.fillColor ?? 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    'data-element-id': el.id,
  };
  let node: React.ReactNode;
  if (el.type === 'pen' || el.type === 'highlighter')
    node = (
      <path
        d={path(el.points ?? [], el.x, el.y)}
        {...common}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  else if (el.type === 'line' || el.type === 'arrow')
    node = (
      <line
        x1={el.x}
        y1={el.y}
        x2={el.x + (el.width ?? 0)}
        y2={el.y + (el.height ?? 0)}
        {...common}
        markerEnd={el.type === 'arrow' ? 'url(#arrowhead)' : undefined}
      />
    );
  else if (el.type === 'rectangle')
    node = (
      <rect
        x={Math.min(el.x, el.x + (el.width ?? 0))}
        y={Math.min(el.y, el.y + (el.height ?? 0))}
        width={Math.abs(el.width ?? 0)}
        height={Math.abs(el.height ?? 0)}
        {...common}
      />
    );
  else if (el.type === 'ellipse')
    node = (
      <ellipse
        cx={el.x + (el.width ?? 0) / 2}
        cy={el.y + (el.height ?? 0) / 2}
        rx={Math.abs(el.width ?? 0) / 2}
        ry={Math.abs(el.height ?? 0) / 2}
        {...common}
      />
    );
  else if (el.type === 'image')
    node = (
      <image
        href={el.assetData}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        preserveAspectRatio="xMidYMid meet"
        opacity={el.opacity}
        transform={`rotate(${el.rotation ?? 0} ${el.x + (el.width ?? 0) / 2} ${el.y + (el.height ?? 0) / 2})`}
        data-element-id={el.id}
      />
    );
  else
    node = (
      <text
        x={el.x}
        y={el.y}
        fill={el.strokeColor}
        opacity={el.opacity}
        fontSize={Math.max(14, el.strokeWidth * 7)}
        data-element-id={el.id}
        style={{ whiteSpace: 'pre' }}
      >
        {el.text}
      </text>
    );
  const box = bounds(el);
  return (
    <g key={el.id} className="board-element">
      {node}
      {selected && !el.locked && (
        <>
          <rect
            className="selection-box"
            x={box.x - 6}
            y={box.y - 6}
            width={box.width + 12}
            height={box.height + 12}
          />
          <circle
            className="resize-handle"
            data-element-id={el.id}
            data-resize-id={el.id}
            cx={box.x + box.width + 6}
            cy={box.y + box.height + 6}
            r="10"
          />
        </>
      )}
    </g>
  );
}
export function Whiteboard({
  socket,
  participantId,
  isHost,
  onClear,
  onNotice,
}: {
  socket: CallYouSocket;
  participantId: string;
  isHost: boolean;
  onClear: () => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useI18n();
  const board = useBoard(socket);
  const svg = useRef<SVGSVGElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#172554');
  const [width, setWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: -500, y: -350 });
  const [followPresenter, setFollowPresenter] = useState(false);
  const [smartShapes, setSmartShapes] = useState(false);
  const [activePageId, setActivePageId] = useState(DEFAULT_PAGE_ID);
  const [presenter, setPresenter] = useState<{ participantId: string; displayName: string } | null>(
    null,
  );
  const [remoteLaser, setRemoteLaser] = useState<{
    participantId: string;
    displayName: string;
    color: string;
    pageId?: string | undefined;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<BoardElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [textDialog, setTextDialog] = useState<{
    point: Point;
    element?: BoardElement;
  } | null>(null);
  const action = useRef<{
    start: Point;
    original?: BoardElement;
    mode: 'draw' | 'move' | 'resize' | 'pan';
  } | null>(null);
  const remoteStrokes = useRef(
    new Map<
      string,
      {
        points: Point[];
        color: string;
        width: number;
        opacity: number;
        pageId?: string | undefined;
      }
    >(),
  );
  const cursors = useRef(
    new Map<string, { x: number; y: number; name: string; color: string; seen: number }>(),
  );
  const [, render] = useState(0);
  const lastCursorEmit = useRef(0);
  const lastStrokeEmit = useRef(0);
  const viewportTimer = useRef<number | null>(null);
  const followRef = useRef(false);
  const suppressViewportEmit = useRef(false);
  const activePointers = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinchStart = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
    zoom: number;
    pan: Point;
  } | null>(null);
  const remoteViewport = useRef<{ centerX: number; centerY: number; zoom: number } | null>(null);
  const world = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const box = svg.current?.getBoundingClientRect();
      return {
        x: (event.clientX - (box?.left ?? 0)) / zoom + pan.x,
        y: (event.clientY - (box?.top ?? 0)) / zoom + pan.y,
      };
    },
    [pan, zoom],
  );
  const visibleElements = board.elements
    .filter((element) => (element.pageId ?? DEFAULT_PAGE_ID) === activePageId)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  useEffect(() => {
    if (board.pages.some((page) => page.id === activePageId)) return;
    setActivePageId(board.pages[0]?.id ?? DEFAULT_PAGE_ID);
    setSelected(null);
  }, [activePageId, board.pages]);
  useEffect(() => {
    const stroke = (data: {
      participantId: string;
      id: string;
      pageId?: string | undefined;
      points: Point[];
      color: string;
      width: number;
      opacity: number;
    }) => {
      remoteStrokes.current.set(`${data.participantId}:${data.id}`, data);
      render((v) => v + 1);
    };
    const end = (data: { participantId: string; id: string }) => {
      remoteStrokes.current.delete(`${data.participantId}:${data.id}`);
      render((v) => v + 1);
    };
    const cursor = (data: {
      participantId: string;
      displayName: string;
      color: string;
      x: number;
      y: number;
    }) => {
      cursors.current.set(data.participantId, {
        x: data.x,
        y: data.y,
        name: data.displayName,
        color: data.color,
        seen: Date.now(),
      });
      render((v) => v + 1);
    };
    const viewport = (data: {
      participantId: string;
      displayName: string;
      centerX: number;
      centerY: number;
      zoom: number;
    }) => {
      remoteViewport.current = data;
      setPresenter({ participantId: data.participantId, displayName: data.displayName });
      if (!followRef.current) return;
      const width = (svg.current?.clientWidth ?? 1200) / data.zoom;
      const height = (svg.current?.clientHeight ?? 800) / data.zoom;
      suppressViewportEmit.current = true;
      setZoom(data.zoom);
      setPan({ x: data.centerX - width / 2, y: data.centerY - height / 2 });
    };
    socket.on('board:live-stroke', stroke);
    socket.on('board:live-stroke-end', end);
    socket.on('participant:cursor', cursor);
    socket.on('board:viewport', viewport);
    const laser = (data: {
      participantId: string;
      displayName: string;
      color: string;
      pageId?: string | undefined;
      x: number;
      y: number;
      active: boolean;
    }) => setRemoteLaser(data);
    socket.on('board:laser', laser);
    const timer = setInterval(() => {
      for (const [id, c] of cursors.current)
        if (Date.now() - c.seen > 5000) cursors.current.delete(id);
      render((v) => v + 1);
    }, 3000);
    return () => {
      clearInterval(timer);
      socket.off('board:live-stroke', stroke);
      socket.off('board:live-stroke-end', end);
      socket.off('participant:cursor', cursor);
      socket.off('board:viewport', viewport);
      socket.off('board:laser', laser);
    };
  }, [socket]);
  useEffect(() => {
    if (suppressViewportEmit.current) {
      suppressViewportEmit.current = false;
      return;
    }
    if (viewportTimer.current != null) window.clearTimeout(viewportTimer.current);
    viewportTimer.current = window.setTimeout(() => {
      const width = (svg.current?.clientWidth ?? 1200) / zoom;
      const height = (svg.current?.clientHeight ?? 800) / zoom;
      socket.emit('board:viewport', {
        centerX: pan.x + width / 2,
        centerY: pan.y + height / 2,
        zoom,
      });
      viewportTimer.current = null;
    }, 80);
    return () => {
      if (viewportTimer.current != null) window.clearTimeout(viewportTimer.current);
    };
  }, [pan, socket, zoom]);
  function stopFollowing() {
    followRef.current = false;
    setFollowPresenter(false);
  }
  function toggleFollowPresenter() {
    const next = !followPresenter;
    setFollowPresenter(next);
    followRef.current = next;
    const latest = remoteViewport.current;
    if (next && latest) {
      const width = (svg.current?.clientWidth ?? 1200) / latest.zoom;
      const height = (svg.current?.clientHeight ?? 800) / latest.zoom;
      setZoom(latest.zoom);
      setPan({ x: latest.centerX - width / 2, y: latest.centerY - height / 2 });
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) board.redo();
        else board.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        board.redo();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault();
        board.remove(selected);
        setSelected(null);
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
      ) {
        const map: Record<string, Tool> = {
          v: 'select',
          p: 'pen',
          h: 'highlighter',
          e: 'eraser',
          l: 'line',
          a: 'arrow',
          r: 'rectangle',
          o: 'ellipse',
          t: 'text',
        };
        const next = map[event.key.toLowerCase()];
        if (next) setTool(next);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [board, selected]);
  function targetId(event: { target: EventTarget }) {
    return (
      (event.target as Element).closest('[data-element-id]')?.getAttribute('data-element-id') ??
      null
    );
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') {
      activePointers.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (activePointers.current.size === 2) {
        const points = [...activePointers.current.values()];
        const first = points[0]!;
        const second = points[1]!;
        pinchStart.current = {
          distance: Math.max(
            1,
            Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
          ),
          centerX: (first.clientX + second.clientX) / 2,
          centerY: (first.clientY + second.clientY) / 2,
          zoom,
          pan,
        };
        action.current = null;
        if (followPresenter) stopFollowing();
        event.preventDefault();
        return;
      }
    }
    if (followPresenter) stopFollowing();
    svg.current?.setPointerCapture(event.pointerId);
    const p = world(event);
    const id = targetId(event);
    if (tool === 'eraser') {
      if (id) board.remove(id);
      return;
    }
    if (tool === 'text') {
      setTextDialog({ point: p });
      return;
    }
    if (tool === 'laser') {
      socket.emit('board:laser', { pageId: activePageId, x: p.x, y: p.y, active: true });
      return;
    }
    if (tool === 'pan') {
      action.current = { start: p, mode: 'pan' };
      return;
    }
    if (tool === 'select') {
      setSelected(id);
      const original = visibleElements.find((e) => e.id === id);
      if (original && !original.locked)
        action.current = {
          start: p,
          original,
          mode: (event.target as Element).hasAttribute('data-resize-id') ? 'resize' : 'move',
        };
      return;
    }
    const type = tool as BoardElement['type'];
    const element: BoardElement = {
      id: crypto.randomUUID(),
      type,
      pageId: activePageId,
      createdBy: participantId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: type === 'pen' || type === 'highlighter' ? 0 : p.x,
      y: type === 'pen' || type === 'highlighter' ? 0 : p.y,
      points: type === 'pen' || type === 'highlighter' ? [p] : undefined,
      width: type === 'pen' || type === 'highlighter' ? undefined : 0,
      height: type === 'pen' || type === 'highlighter' ? undefined : 0,
      strokeColor: color,
      strokeWidth: type === 'highlighter' ? Math.max(12, width * 3) : width,
      opacity: type === 'highlighter' ? 0.28 : 1,
    };
    setDraft(element);
    action.current = { start: p, mode: 'draw' };
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch' && activePointers.current.has(event.pointerId)) {
      activePointers.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (activePointers.current.size >= 2 && pinchStart.current) {
        const points = [...activePointers.current.values()];
        const first = points[0]!;
        const second = points[1]!;
        const distance = Math.max(
          1,
          Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        );
        const centerX = (first.clientX + second.clientX) / 2;
        const centerY = (first.clientY + second.clientY) / 2;
        const box = svg.current?.getBoundingClientRect();
        const localX = centerX - (box?.left ?? 0);
        const localY = centerY - (box?.top ?? 0);
        const nextZoom = Math.max(
          0.2,
          Math.min(5, pinchStart.current.zoom * (distance / pinchStart.current.distance)),
        );
        const worldCenter = {
          x:
            (localX - (box?.width ?? 0) / 2) / pinchStart.current.zoom +
            pinchStart.current.pan.x +
            (box?.width ?? 0) / (2 * pinchStart.current.zoom),
          y:
            (localY - (box?.height ?? 0) / 2) / pinchStart.current.zoom +
            pinchStart.current.pan.y +
            (box?.height ?? 0) / (2 * pinchStart.current.zoom),
        };
        setZoom(nextZoom);
        setPan({ x: worldCenter.x - localX / nextZoom, y: worldCenter.y - localY / nextZoom });
        event.preventDefault();
        return;
      }
    }
    const p = world(event);
    const now = performance.now();
    if (tool === 'laser') {
      socket.emit('board:laser', { pageId: activePageId, x: p.x, y: p.y, active: true });
      return;
    }
    if (now - lastCursorEmit.current > 40) {
      socket.emit('participant:cursor', p);
      lastCursorEmit.current = now;
    }
    const current = action.current;
    if (!current) return;
    if (current.mode === 'pan') {
      setPan((v) => ({ x: v.x - (p.x - current.start.x), y: v.y - (p.y - current.start.y) }));
      return;
    }
    if (current.mode === 'move' && current.original) {
      const dx = p.x - current.start.x,
        dy = p.y - current.start.y;
      board.put({
        ...current.original,
        x: current.original.x + dx,
        y: current.original.y + dy,
        updatedAt: Date.now(),
      });
      return;
    }
    if (current.mode === 'resize' && current.original) {
      const original = current.original;
      if (original.type === 'pen' || original.type === 'highlighter') {
        const box = bounds(original),
          sx = Math.max(0.05, (p.x - box.x) / box.width),
          sy = Math.max(0.05, (p.y - box.y) / box.height);
        const points = (original.points ?? []).map((point) => ({
          x: box.x + (point.x + original.x - box.x) * sx,
          y: box.y + (point.y + original.y - box.y) * sy,
          pressure: point.pressure,
        }));
        board.put({ ...original, x: 0, y: 0, points, updatedAt: Date.now() });
      } else if (original.type === 'image') {
        const originalWidth = Math.max(1, original.width ?? 1);
        const originalHeight = Math.max(1, original.height ?? 1);
        const ratio = originalWidth / originalHeight;
        const nextWidth = Math.max(80, p.x - original.x);
        const nextHeight = event.shiftKey ? nextWidth / ratio : Math.max(80, p.y - original.y);
        board.put({
          ...original,
          width: nextWidth,
          height: nextHeight,
          updatedAt: Date.now(),
        });
      } else
        board.put({
          ...original,
          width: p.x - original.x,
          height: p.y - original.y,
          updatedAt: Date.now(),
        });
      return;
    }
    if (!draft) return;
    if (draft.type === 'pen' || draft.type === 'highlighter') {
      const points = [...(draft.points ?? [])];
      const last = points.at(-1);
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1.5)
        points.push({ ...p, pressure: event.pressure || 0.5 });
      const next = { ...draft, points };
      setDraft(next);
      if (now - lastStrokeEmit.current > 32) {
        socket.emit('board:live-stroke', {
          id: draft.id,
          pageId: activePageId,
          points: points.slice(-256),
          color: draft.strokeColor,
          width: draft.strokeWidth,
          opacity: draft.opacity,
        });
        lastStrokeEmit.current = now;
      }
    } else setDraft({ ...draft, width: p.x - current.start.x, height: p.y - current.start.y });
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch') {
      activePointers.current.delete(event.pointerId);
      if (activePointers.current.size < 2) pinchStart.current = null;
    }
    if (tool === 'laser') {
      const p = world(event);
      socket.emit('board:laser', { pageId: activePageId, x: p.x, y: p.y, active: false });
    }
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
    if (draft) {
      board.put(smartShapes ? recognizeShape(draft) : { ...draft, updatedAt: Date.now() });
      socket.emit('board:live-stroke-end', { id: draft.id });
      setDraft(null);
    }
    action.current = null;
  }
  function recognizeShape(element: BoardElement): BoardElement {
    if (element.type !== 'pen' || !element.points || element.points.length < 5)
      return { ...element, updatedAt: Date.now() };
    const points = element.points;
    const first = points[0]!;
    const last = points.at(-1)!;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(20, Math.max(...xs) - minX);
    const height = Math.max(20, Math.max(...ys) - minY);
    const diagonal = Math.hypot(width, height);
    const closed = Math.hypot(last.x - first.x, last.y - first.y) < diagonal * 0.28;
    const lineDistance = points.reduce((max, point) => {
      const length = Math.hypot(last.x - first.x, last.y - first.y) || 1;
      return Math.max(
        max,
        Math.abs(
          (point.x - first.x) * (last.y - first.y) - (point.y - first.y) * (last.x - first.x),
        ) / length,
      );
    }, 0);
    if (!closed && lineDistance < Math.max(12, diagonal * 0.12))
      return {
        ...element,
        type: 'line',
        x: first.x,
        y: first.y,
        width: last.x - first.x,
        height: last.y - first.y,
        points: undefined,
        updatedAt: Date.now(),
      };
    if (!closed) return { ...element, updatedAt: Date.now() };
    const corners = points.filter(
      (point) =>
        (Math.abs(point.x - minX) < width * 0.16 ||
          Math.abs(point.x - (minX + width)) < width * 0.16) &&
        (Math.abs(point.y - minY) < height * 0.16 ||
          Math.abs(point.y - (minY + height)) < height * 0.16),
    ).length;
    if (corners >= 4)
      return {
        ...element,
        type: 'rectangle',
        x: minX,
        y: minY,
        width,
        height,
        points: undefined,
        updatedAt: Date.now(),
      };
    return {
      ...element,
      type: 'ellipse',
      x: minX,
      y: minY,
      width,
      height,
      points: undefined,
      updatedAt: Date.now(),
    };
  }
  function createPage() {
    if (board.pages.length >= LIMITS.boardPages) return onNotice(t('tooManyBoards'));
    const now = Date.now();
    const page = {
      id: crypto.randomUUID(),
      title: `${t('newBoard')} ${board.pages.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    board.addPage(page);
    setActivePageId(page.id);
    setSelected(null);
  }
  function removeCurrentPage() {
    if (activePageId === DEFAULT_PAGE_ID || board.pages.length <= 1) return;
    board.removePage(activePageId);
    setActivePageId(DEFAULT_PAGE_ID);
    setSelected(null);
  }
  function wheel(event: React.WheelEvent) {
    event.preventDefault();
    if (followPresenter) stopFollowing();
    const box = svg.current?.getBoundingClientRect();
    const before = world(event);
    const nextZoom = Math.max(0.2, Math.min(5, zoom * Math.exp(-event.deltaY * 0.001)));
    setZoom(nextZoom);
    if (box) {
      const localX = event.clientX - box.left;
      const localY = event.clientY - box.top;
      setPan({ x: before.x - localX / nextZoom, y: before.y - localY / nextZoom });
    }
  }
  function resetView() {
    if (followPresenter) stopFollowing();
    const width = svg.current?.clientWidth ?? 1200;
    const height = svg.current?.clientHeight ?? 800;
    setZoom(1);
    setPan({ x: -width / 2, y: -height / 2 });
  }
  function fitSelectedImage() {
    if (followPresenter) stopFollowing();
    const image = visibleElements.find(
      (element) => element.id === selected && element.type === 'image',
    );
    if (!image) return;
    const viewportWidth = (svg.current?.clientWidth ?? 1200) / zoom;
    const targetWidth = Math.min(680 / zoom, viewportWidth * 0.82);
    const ratio = (image.width ?? 1) / Math.max(1, image.height ?? 1);
    const targetHeight = targetWidth / ratio;
    board.put({
      ...image,
      x: pan.x + (viewportWidth - targetWidth) / 2,
      y: pan.y + 70 / zoom,
      width: targetWidth,
      height: targetHeight,
      updatedAt: Date.now(),
    });
  }
  function selectedImage() {
    return visibleElements.find((element) => element.id === selected && element.type === 'image');
  }
  function rotateSelectedImage() {
    const image = selectedImage();
    if (image) board.put({ ...image, rotation: (image.rotation ?? 0) + 90, updatedAt: Date.now() });
  }
  function toggleSelectedLock() {
    const image = selectedImage();
    if (image) board.put({ ...image, locked: !image.locked, updatedAt: Date.now() });
  }
  function duplicateSelectedImage() {
    const image = selectedImage();
    if (!image) return;
    const duplicate = {
      ...image,
      id: crypto.randomUUID(),
      x: image.x + 32,
      y: image.y + 32,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      zIndex: Math.max(...visibleElements.map((element) => element.zIndex ?? 0), 0) + 1,
    };
    board.put(duplicate);
    setSelected(duplicate.id);
  }
  function changeSelectedLayer(direction: 1 | -1) {
    const image = selectedImage();
    if (!image) return;
    board.put({ ...image, zIndex: (image.zIndex ?? 0) + direction, updatedAt: Date.now() });
  }
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function serializedPage() {
    const element = svg.current;
    if (!element) return null;
    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.collaborator-cursor, .laser-pointer').forEach((node) => node.remove());
    clone.setAttribute(
      'viewBox',
      `${pan.x} ${pan.y} ${(element.clientWidth || 1200) / zoom} ${(element.clientHeight || 800) / zoom}`,
    );
    clone.setAttribute('width', String(element.clientWidth || 1200));
    clone.setAttribute('height', String(element.clientHeight || 800));
    return new XMLSerializer().serializeToString(clone);
  }
  function exportSvg() {
    const content = serializedPage();
    if (content) downloadBlob(new Blob([content], { type: 'image/svg+xml' }), 'callyou-board.svg');
  }
  async function exportPng() {
    const content = serializedPage();
    if (!content) return;
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width || 1200;
      canvas.height = image.height || 800;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.toBlob((output) => output && downloadBlob(output, 'callyou-board.png'), 'image/png');
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  }
  function printPdf() {
    const content = serializedPage();
    if (!content) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return onNotice(t('popupBlocked'));
    popup.document.write(
      `<html><head><title>CallYou board</title><style>html,body{margin:0;height:100%}svg{width:100%;height:100%;display:block}</style></head><body>${content}</body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }
  function exportSession() {
    const session = {
      format: 'callyou-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: board.pages,
      elements: board.elements,
    };
    downloadBlob(
      new Blob([JSON.stringify(session)], { type: 'application/json' }),
      'callyou-session.json',
    );
  }
  function editText(event: React.MouseEvent<SVGSVGElement>) {
    const id = targetId(event);
    const element = visibleElements.find((value) => value.id === id && value.type === 'text');
    if (!element) return;
    setTextDialog({ point: { x: element.x, y: element.y }, element });
  }
  function saveText(value: string) {
    if (!textDialog) return;
    const now = Date.now();
    board.put(
      textDialog.element
        ? { ...textDialog.element, text: value.slice(0, LIMITS.boardText), updatedAt: now }
        : {
            id: crypto.randomUUID(),
            type: 'text',
            pageId: activePageId,
            createdBy: participantId,
            createdAt: now,
            updatedAt: now,
            x: textDialog.point.x,
            y: textDialog.point.y,
            text: value.slice(0, LIMITS.boardText),
            strokeColor: color,
            strokeWidth: width,
            opacity: 1,
          },
    );
    setTextDialog(null);
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (board.elements.filter((element) => element.type === 'image').length >= LIMITS.boardAssets) {
      onNotice(t('tooManyPages'));
      return;
    }
    setImporting(true);
    try {
      const assets = await prepareBoardAssets(file);
      const existing = board.elements.filter((element) => element.type === 'image').length;
      if (existing + assets.length > LIMITS.boardAssets) throw new Error('too_many_pages');
      const centerX = pan.x + (svg.current?.clientWidth ?? 1200) / (2 * zoom);
      let nextY = pan.y + 110 / zoom;
      for (const asset of assets) {
        const displayWidth = Math.min(760, asset.width);
        const displayHeight = (asset.height / asset.width) * displayWidth;
        const now = Date.now();
        board.put({
          id: crypto.randomUUID(),
          type: 'image',
          createdBy: participantId,
          createdAt: now,
          updatedAt: now,
          x: centerX - displayWidth / 2,
          y: nextY,
          width: displayWidth,
          height: displayHeight,
          assetName: asset.name.slice(0, 120),
          assetData: asset.data,
          pageId: activePageId,
          strokeColor: '#94a3b8',
          strokeWidth: 1,
          opacity: 1,
        });
        nextY += displayHeight + 32;
      }
      setTool('select');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      onNotice(
        t(
          code === 'too_many_pages'
            ? 'tooManyPages'
            : code === 'source_too_large' || code === 'asset_too_large'
              ? 'boardFileTooLarge'
              : code === 'unsupported_file'
                ? 'unsupportedFile'
                : 'boardAssetFailed',
        ),
      );
    } finally {
      setImporting(false);
    }
  }
  return (
    <section className="board-shell">
      <nav className="board-toolbar" aria-label="Whiteboard tools">
        {tools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={tool === id ? 'active' : ''}
            onClick={() => setTool(id)}
            title={t(label)}
            aria-label={t(label)}
          >
            <Icon />
          </button>
        ))}
        <span className="divider" />
        <button
          className="board-file-button"
          title={t('addBoardFile')}
          aria-label={t('addBoardFile')}
          disabled={importing}
          onClick={() => fileInput.current?.click()}
        >
          {importing ? <LoaderCircle className="spinning" /> : <ImagePlus />}
          <span>{importing ? t('importing') : t('addBoardFile')}</span>
        </button>
        <input
          ref={fileInput}
          className="board-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={importing}
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <span className="divider" />
        <label className="color-control" title="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="width-control">
          <input
            aria-label="Stroke width"
            type="range"
            min="1"
            max="24"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <span className="divider" />
        <button onClick={board.undo} title={t('undo')}>
          <Undo2 />
        </button>
        <button onClick={board.redo} title={t('redo')}>
          <Redo2 />
        </button>
        <button
          className={smartShapes ? 'active' : ''}
          onClick={() => setSmartShapes((value) => !value)}
          title={t('smartShapes')}
        >
          <WandSparkles />
          <span>{t('smartShapes')}</span>
        </button>
        {isHost && (
          <button className="clear-board-button" onClick={onClear} title={t('clearBoard')}>
            <Trash2 />
            <span>{t('clearBoard')}</span>
          </button>
        )}
        {selectedImage() && (
          <>
            <button onClick={fitSelectedImage} title={t('fitImage')}>
              <Maximize2 />
              <span>{t('fitImage')}</span>
            </button>
            <button onClick={rotateSelectedImage} title={t('rotateImage')}>
              <RotateCw />
              <span>{t('rotateImage')}</span>
            </button>
            <button
              onClick={toggleSelectedLock}
              title={t(selectedImage()?.locked ? 'unlockImage' : 'lockImage')}
            >
              {selectedImage()?.locked ? <Unlock /> : <Lock />}
              <span>{t(selectedImage()?.locked ? 'unlockImage' : 'lockImage')}</span>
            </button>
            <button onClick={duplicateSelectedImage} title={t('duplicateImage')}>
              <Copy />
              <span>{t('duplicateImage')}</span>
            </button>
            <button onClick={() => changeSelectedLayer(1)} title={t('bringForward')}>
              <ChevronUp />
              <span>{t('bringForward')}</span>
            </button>
            <button onClick={() => changeSelectedLayer(-1)} title={t('sendBackward')}>
              <ChevronDown />
              <span>{t('sendBackward')}</span>
            </button>
          </>
        )}
        <button onClick={() => void exportPng()} title={t('exportPng')}>
          <Download />
          <span>{t('exportPng')}</span>
        </button>
        <button onClick={exportSvg} title={t('exportSvg')}>
          <FileDown />
          <span>{t('exportSvg')}</span>
        </button>
        <button onClick={printPdf} title={t('printPdf')}>
          <FileDown />
          <span>{t('printPdf')}</span>
        </button>
        <button onClick={exportSession} title={t('exportSession')}>
          <Archive />
          <span>{t('exportSession')}</span>
        </button>
        <button
          className={followPresenter ? 'active' : ''}
          onClick={toggleFollowPresenter}
          title={t(followPresenter ? 'stopFollowingPresenter' : 'followPresenter')}
          disabled={!presenter}
        >
          {followPresenter ? <EyeOff /> : <Eye />}
          <span>{t(followPresenter ? 'stopFollowingPresenter' : 'followPresenter')}</span>
        </button>
      </nav>
      {presenter && (
        <div className="presenter-status" role="status">
          <span />
          {followPresenter
            ? t('followingPresenter').replace('{name}', presenter.displayName)
            : t('presenterActive').replace('{name}', presenter.displayName)}
        </div>
      )}
      <div className="page-tabs" role="tablist" aria-label={t('boards')}>
        {board.pages.map((page) => (
          <button
            key={page.id}
            className={page.id === activePageId ? 'active' : ''}
            role="tab"
            aria-selected={page.id === activePageId}
            onClick={() => {
              setActivePageId(page.id);
              setSelected(null);
            }}
          >
            {page.title}
          </button>
        ))}
        <button className="page-add" onClick={createPage} title={t('newBoard')}>
          <Plus />
        </button>
        {activePageId !== DEFAULT_PAGE_ID && (
          <button className="page-remove" onClick={removeCurrentPage} title={t('deleteBoard')}>
            <Trash2 />
          </button>
        )}
      </div>
      <svg
        ref={svg}
        className={`whiteboard tool-${tool}`}
        role="application"
        aria-label="Shared whiteboard"
        viewBox={`${pan.x} ${pan.y} ${(svg.current?.clientWidth ?? 1200) / zoom} ${(svg.current?.clientHeight ?? 800) / zoom}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
        onDoubleClick={editText}
      >
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,3.5 L0,7 Z" fill="#172554" />
          </marker>
        </defs>
        <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="#fff" />
        <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="url(#grid)" />
        {visibleElements.map((el) => renderElement(el, el.id === selected))}
        {draft && renderElement(draft)}
        {[...remoteStrokes.current]
          .filter(([, s]) => (s.pageId ?? DEFAULT_PAGE_ID) === activePageId)
          .map(([id, s]) => (
            <path
              key={id}
              d={path(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              opacity={s.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {remoteLaser?.active && (remoteLaser.pageId ?? DEFAULT_PAGE_ID) === activePageId && (
          <g
            className="laser-pointer"
            transform={`translate(${remoteLaser.x} ${remoteLaser.y})`}
            aria-label={remoteLaser.displayName}
          >
            <circle r="12" fill={remoteLaser.color} />
            <circle r="22" fill="none" stroke={remoteLaser.color} strokeWidth="3" />
          </g>
        )}
        {[...cursors.current].map(([id, c]) => (
          <g key={id} transform={`translate(${c.x} ${c.y})`} className="collaborator-cursor">
            <path d="M0 0 L4 17 L8 10 L15 8 Z" fill={c.color} />
            <text x="12" y="22" fill={c.color}>
              {c.name}
            </text>
          </g>
        ))}
      </svg>
      <div className="zoom-controls">
        <button onClick={resetView} title={t('resetView')}>
          <Maximize2 />
        </button>
        <button onClick={() => setZoom((v) => Math.min(5, v * 1.2))}>
          <ChevronUp />
        </button>
        <output>{Math.round(zoom * 100)}%</output>
        <button onClick={() => setZoom((v) => Math.max(0.2, v / 1.2))}>
          <ChevronDown />
        </button>
      </div>
      {textDialog && (
        <TextDialog
          initialValue={textDialog.element?.text}
          onCancel={() => setTextDialog(null)}
          onSave={saveText}
        />
      )}
    </section>
  );
}
