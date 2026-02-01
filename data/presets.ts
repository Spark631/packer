export interface FurniturePreset {
  id: string;
  label: string;
  type: string;
  width: number;
  height: number;
  depth?: number; // Visual height in inches
  color?: string;
}

export const FURNITURE_PRESETS: FurniturePreset[] = [
  { id: "twin-bed", label: "Twin Bed", type: "bed", width: 38, height: 75, depth: 20, color: "#1e293b" }, // Navy/Dark
  { id: "full-bed", label: "Full Bed", type: "bed", width: 54, height: 75, depth: 20, color: "#1e293b" },
  { id: "queen-bed", label: "Queen Bed", type: "bed", width: 60, height: 80, depth: 20, color: "#1e293b" },
  { id: "king-bed", label: "King Bed", type: "bed", width: 76, height: 80, depth: 20, color: "#1e293b" },
  { id: "desk-small", label: "Small Desk", type: "desk", width: 24, height: 48, depth: 30, color: "#334155" }, // Slate
  { id: "desk-large", label: "Large Desk", type: "desk", width: 30, height: 60, depth: 30, color: "#334155" },
  { id: "couch-loveseat", label: "Loveseat", type: "couch", width: 36, height: 60, depth: 24, color: "#475569" },
  { id: "couch-3seater", label: "3-Seat Couch", type: "couch", width: 36, height: 84, depth: 24, color: "#475569" },
  { id: "nightstand", label: "Nightstand", type: "table", width: 18, height: 18, depth: 24, color: "#94a3b8" },
  { id: "dresser", label: "Dresser", type: "storage", width: 20, height: 60, depth: 40, color: "#64748b" },
  { id: "bed", label: "Bed", type: "bed", width: 60, height: 80, depth: 20, color: "#1e293b" },
  { id: "desk", label: "Desk", type: "desk", width: 24, height: 48, depth: 30, color: "#334155" },
  { id: "couch", label: "Couch", type: "couch", width: 36, height: 60, depth: 24, color: "#475569" },
  { id: "table", label: "Table", type: "table", width: 18, height: 18, depth: 24, color: "#94a3b8" },
  { id: "storage", label: "Storage", type: "storage", width: 20, height: 60, depth: 40, color: "#64748b" },
  { id: "chair", label: "Chair", type: "chair", width: 18, height: 18, depth: 24, color: "#94a3b8" },
  { id: "lamp", label: "Lamp", type: "lamp", width: 18, height: 18, depth: 24, color: "#94a3b8" },
  { id: "plant", label: "Plant", type: "plant", width: 18, height: 18, depth: 24, color: "#94a3b8" },
];

