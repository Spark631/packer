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

export type WallSide = 'front' | 'back' | 'left' | 'right';
export type AttachmentType = 'window' | 'door' | 'shelf';

export interface WallAttachment {
  id: string;
  type: AttachmentType;
  side: WallSide;
  x: number; // Horizontal position along the wall (inches)
  y: number; // Vertical position from floor (inches)
  width: number; // inches
  height: number; // inches
  offsetFromWall?: number; // For shelves (sticking out)
}

export interface LayoutState {
  room: Room;
  items: FurnitureItem[];
  attachments: WallAttachment[];
  selectedItemId: string | null;
  selectedAttachmentId?: string | null;
}

