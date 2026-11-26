"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";

/** Returns a new array with one item moved, leaving the original untouched. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Native HTML5 drag/drop plus ArrowUp/ArrowDown support for one reorderable list.
 * Each list gets its own controller so drops never cross between unrelated lists.
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragType = useRef(`application/x-jss-reorder-${Math.random().toString(36).slice(2)}`).current;

  function ownsDrag(data: DataTransfer) {
    return Array.from(data.types).includes(dragType);
  }

  function clearDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  function dropProps(index: number) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer) || dragging === null || dragging === index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget((current) => (current === index ? current : index));
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer)) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTarget((current) => (current === index ? null : current));
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer)) return;
        event.preventDefault();
        const raw = event.dataTransfer.getData(dragType);
        const transferred = raw === "" ? Number.NaN : Number(raw);
        const from = dragging ?? transferred;
        if (Number.isInteger(from) && from >= 0 && from !== index) {
          onReorder(from, index);
        }
        clearDrag();
      },
    };
  }

  function handleProps(index: number, count: number, label: string) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(dragType, String(index));
        event.dataTransfer.setData("text/plain", String(index));
        setDragging(index);
      },
      onDragEnd: clearDrag,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          onReorder(index, index - 1);
        } else if (event.key === "ArrowDown" && index < count - 1) {
          event.preventDefault();
          onReorder(index, index + 1);
        }
      },
      "aria-label": `Reorder ${label}. Drag, or press arrow up and arrow down.`,
      title: "Drag to reorder, or use ↑ / ↓",
    };
  }

  return { dragging, dropTarget, dropProps, handleProps };
}

export type DragReorderController = ReturnType<typeof useDragReorder>;

/** A position in a list of grouped items, such as a skill inside a skill group. */
export interface DragLocation {
  group: number;
  index: number;
}

function sameLocation(a: DragLocation | null, b: DragLocation | null): boolean {
  return a?.group === b?.group && a?.index === b?.index;
}

function parseLocation(raw: string): DragLocation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DragLocation>;
    if (
      Number.isInteger(value.group) &&
      Number.isInteger(value.index) &&
      (value.group as number) >= 0 &&
      (value.index as number) >= 0
    ) {
      return { group: value.group as number, index: value.index as number };
    }
  } catch {
    // Fall through to the plain-text fallback below.
  }
  const match = raw.match(/^(\d+):(\d+)$/);
  return match ? { group: Number(match[1]), index: Number(match[2]) } : null;
}

/**
 * Native drag/drop for items that can move within or between several lists.
 * One controller is shared by every list so a drop target can identify both
 * the destination group and the insertion index.
 */
export function useGroupedDragReorder(
  onReorder: (from: DragLocation, to: DragLocation) => void,
  groupSizes: number[],
) {
  const [dragging, setDragging] = useState<DragLocation | null>(null);
  const [dropTarget, setDropTarget] = useState<DragLocation | null>(null);
  const dragType = useRef(`application/x-jss-grouped-reorder-${Math.random().toString(36).slice(2)}`).current;

  function ownsDrag(data: DataTransfer) {
    return Array.from(data.types).includes(dragType);
  }

  function clearDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  function dropProps(groupIndex: number, index: number) {
    const location = { group: groupIndex, index };
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer) || dragging === null || sameLocation(dragging, location)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget((current) => (sameLocation(current, location) ? current : location));
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer)) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && sameLocation(dropTarget, location)) {
          setDropTarget(null);
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!ownsDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const from = dragging ?? parseLocation(event.dataTransfer.getData(dragType));
        if (from && !sameLocation(from, location)) {
          onReorder(from, location);
        }
        clearDrag();
      },
    };
  }

  function handleProps(groupIndex: number, index: number, label: string) {
    const currentCount = groupSizes[groupIndex] ?? 0;
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        const location = { group: groupIndex, index };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(dragType, JSON.stringify(location));
        event.dataTransfer.setData("text/plain", `${groupIndex}:${index}`);
        setDragging(location);
      },
      onDragEnd: clearDrag,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        let to: DragLocation | null = null;
        if (event.key === "ArrowUp") {
          if (index > 0) to = { group: groupIndex, index: index - 1 };
          else if (groupIndex > 0) to = { group: groupIndex - 1, index: groupSizes[groupIndex - 1] ?? 0 };
        } else if (event.key === "ArrowDown") {
          if (index < currentCount - 1) to = { group: groupIndex, index: index + 1 };
          else if (groupIndex < groupSizes.length - 1) to = { group: groupIndex + 1, index: 0 };
        }
        if (to) {
          event.preventDefault();
          onReorder({ group: groupIndex, index }, to);
        }
      },
      "aria-label": `Reorder ${label}. Drag to another group, or press arrow up and arrow down.`,
      title: "Drag between groups, or use ↑ / ↓",
    };
  }

  return { dragging, dropTarget, dropProps, handleProps };
}

export type GroupedDragReorderController = ReturnType<typeof useGroupedDragReorder>;

export function GroupedDragHandle({
  controller,
  groupIndex,
  index,
  label,
}: {
  controller: GroupedDragReorderController;
  groupIndex: number;
  index: number;
  label: string;
}) {
  const location = { group: groupIndex, index };
  return (
    <button
      type="button"
      data-skill-group={groupIndex}
      data-skill-index={index}
      className={`btn-ghost drag-handle h-8 w-8 shrink-0 justify-center p-0 ${
        sameLocation(controller.dragging, location) ? "drag-handle-active opacity-60" : ""
      }`}
      {...controller.handleProps(groupIndex, index, label)}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

export function GroupedSortableZone({
  controller,
  groupIndex,
  index,
  className = "",
  children,
}: {
  controller: GroupedDragReorderController;
  groupIndex: number;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const location = { group: groupIndex, index };
  const isSource = sameLocation(controller.dragging, location);
  const isTarget = controller.dragging !== null && !isSource && sameLocation(controller.dropTarget, location);
  const placeAfter =
    controller.dragging !== null &&
    controller.dragging.group === groupIndex &&
    controller.dragging.index < index;

  return (
    <div
      data-skill-group={groupIndex}
      data-skill-index={index}
      className={`relative transition-all duration-200 ease-out ${isSource ? "drag-source" : ""} ${isTarget ? "drop-target" : ""} ${className}`}
      {...controller.dropProps(groupIndex, index)}
    >
      {isTarget && (
        <span
          aria-hidden="true"
          className={`drop-line ${placeAfter ? "drop-line-after" : "drop-line-before"}`}
        />
      )}
      {children}
    </div>
  );
}

export function DragHandle({
  controller,
  index,
  count,
  label,
}: {
  controller: DragReorderController;
  index: number;
  count: number;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost drag-handle h-8 w-8 shrink-0 justify-center p-0 ${controller.dragging === index ? "drag-handle-active opacity-60" : ""}`}
      {...controller.handleProps(index, count, label)}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

/**
 * Drop wrapper that previews the insertion point while a compatible drag is
 * hovering. The line is animated and appears above or below the target based
 * on which direction the item is moving.
 */
export function SortableZone({
  controller,
  index,
  className = "",
  children,
}: {
  controller: DragReorderController;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const isSource = controller.dragging === index;
  const isTarget = !isSource && controller.dragging !== null && controller.dropTarget === index;
  const placeAfter = controller.dragging !== null && controller.dragging < index;

  return (
    <div
      className={`relative transition-all duration-200 ease-out ${isSource ? "drag-source" : ""} ${isTarget ? "drop-target" : ""} ${className}`}
      {...controller.dropProps(index)}
    >
      {isTarget && (
        <span
          aria-hidden="true"
          className={`drop-line ${placeAfter ? "drop-line-after" : "drop-line-before"}`}
        />
      )}
      {children}
    </div>
  );
}
