export interface FurniturePreset {
  id: string;
  label: string;
  type: string;
  width: number;
  height: number;
}

export const FURNITURE_PRESETS: FurniturePreset[] = [
  { id: "twin-bed", label: "Twin Bed", type: "bed", width: 38, height: 75 },
  { id: "full-bed", label: "Full Bed", type: "bed", width: 54, height: 75 },
  { id: "queen-bed", label: "Queen Bed", type: "bed", width: 60, height: 80 },
  { id: "king-bed", label: "King Bed", type: "bed", width: 76, height: 80 },
  { id: "desk-small", label: "Small Desk", type: "desk", width: 24, height: 48 },
  { id: "desk-large", label: "Large Desk", type: "desk", width: 30, height: 60 },
  { id: "couch-loveseat", label: "Loveseat", type: "couch", width: 36, height: 60 },
  { id: "couch-3seater", label: "3-Seat Couch", type: "couch", width: 36, height: 84 },
  { id: "nightstand", label: "Nightstand", type: "table", width: 18, height: 18 },
  { id: "dresser", label: "Dresser", type: "storage", width: 20, height: 60 },
];

