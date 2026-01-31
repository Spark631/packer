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
}

export interface LayoutState {
  room: Room;
  items: FurnitureItem[];
  selectedItemId: string | null;
}

