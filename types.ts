export interface Room {
  width: number; // inches
  height: number; // inches
}

export interface FurnitureItem {
  id: string;
  type: string;
  width: number; // inches
  height: number; // inches
  x: number; // units (inches relative to room origin)
  y: number; // units
  rotation: number; // degrees, typically 0 or 90
  imageUrl?: string; // Optional base64 data URL for photo-based items
  depth?: number; // Visual Z-height
  color?: string; // Hex color
}

export interface LayoutState {
  room: Room;
  items: FurnitureItem[];
  selectedItemId: string | null;
}

