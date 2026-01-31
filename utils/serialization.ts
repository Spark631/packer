import { LayoutState } from "../types";

export function serializeLayout(layout: LayoutState): string {
  // Simple JSON stringify + Base64
  // We only save room and items, not selection state
  const data = {
    room: layout.room,
    items: layout.items.map(item => ({
        id: item.id,
        type: item.type,
        width: item.width,
        height: item.height,
        x: item.x,
        y: item.y,
        rotation: item.rotation
    }))
  };
  return btoa(JSON.stringify(data));
}

export function deserializeLayout(encoded: string): LayoutState | null {
  try {
    const json = atob(encoded);
    const data = JSON.parse(json);
    
    // Basic validation (optional but good practice)
    if (!data.room || !data.items) return null;

    return {
        room: data.room,
        items: data.items,
        selectedItemId: null
    };
  } catch (e) {
    console.error("Failed to parse layout from URL", e);
    return null;
  }
}

