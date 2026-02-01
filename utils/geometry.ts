import { FurnitureItem, Room } from "../types";

export const SNAP_SIZE = 6; // inches
export const SNAP_THRESHOLD = 2; // inches

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getItemRect(item: FurnitureItem): Rect {
  const isRotated = item.rotation === 90 || item.rotation === 270;
  return {
    x: item.x,
    y: item.y,
    width: isRotated ? item.height : item.width,
    height: isRotated ? item.width : item.height,
  };
}

export function isOverlapping(rect1: Rect, rect2: Rect): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

export function isOutOfBounds(itemRect: Rect, room: Room): boolean {
  return (
    itemRect.x < 0 ||
    itemRect.y < 0 ||
    itemRect.x + itemRect.width > room.width ||
    itemRect.y + itemRect.height > room.height
  );
}

export function checkValidity(
  layoutItems: FurnitureItem[],
  room: Room,
  movingItemId?: string,
  movingItemRect?: Rect
): Set<string> {
  const invalidItemIds = new Set<string>();
  
  // Create a list of all rects to check
  // If movingItemId is provided, use movingItemRect instead of item's stored state
  const itemRects = layoutItems.map(item => {
    if (item.id === movingItemId && movingItemRect) {
      return { id: item.id, rect: movingItemRect };
    }
    return { id: item.id, rect: getItemRect(item) };
  });

  // Check bounds
  for (const { id, rect } of itemRects) {
    if (isOutOfBounds(rect, room)) {
      invalidItemIds.add(id);
    }
  }

  // Check collisions
  for (let i = 0; i < itemRects.length; i++) {
    for (let j = i + 1; j < itemRects.length; j++) {
      if (isOverlapping(itemRects[i].rect, itemRects[j].rect)) {
        invalidItemIds.add(itemRects[i].id);
        invalidItemIds.add(itemRects[j].id);
      }
    }
  }

  return invalidItemIds;
}

