// Geometry normalization for AI-generated furniture analyses.
//
// The vision model describes furniture as a list of parts in a unit bounding box whose
// origin is the center of the footprint, on the floor (see GenerativeFurniture.tsx).
// In practice it drifts from that contract: parts float apart (a drawer front emitted as
// a slab out in front of the carcass) or x/z are given on a 0..1 scale instead of
// -0.5..0.5. These passes repair the analysis so it always renders as one connected
// solid sitting inside the item's own dimensions.

export interface FurniturePart {
  name: string;
  shape: 'box' | 'cylinder' | 'sphere';
  proportions: { width: number; height: number; depth: number };
  position: { x: number; y: number; z: number };
  rotation?: { x?: number; y?: number; z?: number };
  count?: number; // For symmetric parts like legs, armrests
  mirror?: 'x' | 'z'; // Axis to mirror on if count > 1
  // Curved part properties
  curved?: boolean; // Mark this part as curved
  curveDirection?: 'x' | 'y' | 'z'; // Primary axis the curve bends along
  curveAngle?: number; // Total arc angle in radians (e.g., 1.57 for 90°)
  segments?: number; // Number of segments to approximate curve (default: 4)
}

export interface FurnitureAnalysis {
  furnitureType: string;
  parts: FurniturePart[];
}

export const EPSILON = 1e-4;

type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];

// Drop parts the model described with missing or nonsensical numbers, and copy the rest
// so the normalization passes can mutate them freely.
export function sanitizeParts(parts: FurniturePart[]): FurniturePart[] {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && isFinite(v) ? v : fallback;

  return (parts || [])
    .filter(part => part && part.proportions && part.position)
    .map(part => ({
      ...part,
      name: (part.name || 'part').replace(/[^a-zA-Z0-9_\- ]/g, '') || 'part',
      shape: (part.shape === 'cylinder' || part.shape === 'sphere'
        ? part.shape
        : 'box') as FurniturePart['shape'],
      proportions: {
        width: Math.max(num(part.proportions.width, 0.1), EPSILON),
        height: Math.max(num(part.proportions.height, 0.1), EPSILON),
        depth: Math.max(num(part.proportions.depth, 0.1), EPSILON),
      },
      position: {
        x: num(part.position.x, 0),
        y: num(part.position.y, 0),
        z: num(part.position.z, 0),
      },
    }));
}

// Expand a part with count/mirror into concrete, individually-positioned parts.
// Mirroring is only meaningful when the part is actually offset from the mirror axis -
// mirroring a centered part just stacks duplicates in the same place, so we keep one.
export function expandPart(part: FurniturePart): FurniturePart[] {
  const count = part.count || 1;
  if (count <= 1) return [part];

  const mirror = part.mirror || 'x';
  const { x, z } = part.position;
  const copies: FurniturePart[] = [];

  for (let i = 0; i < count; i++) {
    const pos = { ...part.position };

    if (count === 2) {
      const offset = mirror === 'x' ? Math.abs(x) : Math.abs(z);
      // Centered part: not a real mirrored pair, emit a single copy.
      if (offset < EPSILON) return [part];
      if (mirror === 'x') pos.x = i === 0 ? offset : -offset;
      else pos.z = i === 0 ? offset : -offset;
    } else if (count === 4) {
      // Four corners - only valid if the part is offset on both axes.
      if (Math.abs(x) < EPSILON || Math.abs(z) < EPSILON) return [part];
      pos.x = Math.abs(x) * (i % 2 === 0 ? 1 : -1);
      pos.z = Math.abs(z) * (i < 2 ? 1 : -1);
    } else {
      // Radial arrangement (star bases, etc.) around the y axis.
      const radius = Math.hypot(x, z);
      if (radius < EPSILON) return [part];
      const angle = (2 * Math.PI * i) / count;
      pos.x = radius * Math.sin(angle);
      pos.z = radius * Math.cos(angle);
    }

    copies.push({ ...part, position: pos });
  }

  return copies;
}

// Half-size of a part's axis-aligned bounding box. Rotation is ignored: rotated parts
// are rare and over-estimating their extent would drag the whole assembly out of shape.
function halfExtents(part: FurniturePart): Record<Axis, number> {
  const { width, height, depth } = part.proportions;
  if (part.shape === 'sphere') {
    const r = width / 2;
    return { x: r, y: r, z: r };
  }
  if (part.shape === 'cylinder') {
    return { x: width / 2, y: height / 2, z: width / 2 };
  }
  return { x: width / 2, y: height / 2, z: depth / 2 };
}

function volumeOf(part: FurniturePart): number {
  const h = halfExtents(part);
  return h.x * h.y * h.z;
}

// Signed overlap of two parts along one axis. Positive = interpenetrating,
// zero = exactly flush, negative = the size of the gap between them.
function overlapOn(a: FurniturePart, b: FurniturePart, axis: Axis): number {
  return halfExtents(a)[axis] + halfExtents(b)[axis] - Math.abs(a.position[axis] - b.position[axis]);
}

// Pull any disconnected part onto the nearest already-connected part.
// Parts are anchored largest-first, so the carcass anchors the drawer fronts rather than
// the other way round.
export function snapDisconnectedParts(parts: FurniturePart[]): void {
  // Curved parts are approximated by segments swept along an arc, so their AABB is not
  // meaningful here - leave them where the model put them.
  const snappable = parts.filter(p => !p.curved);
  if (snappable.length < 2) return;

  const ordered = [...snappable].sort((a, b) => volumeOf(b) - volumeOf(a));
  const anchored: FurniturePart[] = [ordered[0]];

  for (const part of ordered.slice(1)) {
    let best: { target: FurniturePart; faceContact: boolean; distance: number } | null = null;

    for (const target of anchored) {
      const gaps = AXES.map(axis => Math.max(0, -overlapOn(part, target, axis)));
      const distance = Math.hypot(...gaps);
      // Touching or interpenetrating on every axis - already connected, leave it alone.
      if (distance <= EPSILON) {
        best = null;
        break;
      }

      // Prefer a target this part can meet face-to-face: one where it already overlaps
      // on two axes, so closing the gap on the third lands it flat against a face.
      // Without this a drawer front will happily snap to the edge of the drawer front
      // above it - technically touching, but still visibly floating off the carcass.
      const overlappingAxes = AXES.filter(axis => overlapOn(part, target, axis) > EPSILON).length;
      const faceContact = overlappingAxes >= 2;

      const better =
        !best ||
        (faceContact && !best.faceContact) ||
        (faceContact === best.faceContact && distance < best.distance);
      if (better) best = { target, faceContact, distance };
    }

    // Close the gap on every separated axis, moving toward the nearest neighbour. For a
    // floating drawer front this is exactly the translation that makes it flush with the
    // carcass face, since that is the shortest way to remove the gap.
    if (best) {
      for (const axis of AXES) {
        const gap = -overlapOn(part, best.target, axis);
        if (gap > EPSILON) {
          const direction = Math.sign(best.target.position[axis] - part.position[axis]);
          part.position[axis] += direction * gap;
        }
      }
    }

    anchored.push(part);
  }
}

// Re-frame the assembly into the renderer's unit box: centered on x/z, resting on the
// floor, and no larger than the item's own dimensions. This absorbs the case where the
// model used a 0..1 convention for x/z instead of -0.5..0.5.
export function fitToUnitBox(parts: FurniturePart[]): void {
  const bounds = AXES.map(axis => {
    let min = Infinity;
    let max = -Infinity;
    for (const part of parts) {
      const h = halfExtents(part)[axis];
      min = Math.min(min, part.position[axis] - h);
      max = Math.max(max, part.position[axis] + h);
    }
    return { axis, min, max };
  });

  for (const { axis, min, max } of bounds) {
    const extent = max - min;
    if (!isFinite(extent) || extent < EPSILON) continue;

    // Only ever shrink - scaling a small model up would distort it.
    const scale = extent > 1 ? 1 / extent : 1;
    // y rests on the floor (0..1); x and z are centered on the origin (-0.5..0.5).
    const targetMin = axis === 'y' ? 0 : -(extent * scale) / 2;
    const sizeKey = axis === 'x' ? 'width' : axis === 'y' ? 'height' : 'depth';

    for (const part of parts) {
      part.position[axis] = (part.position[axis] - min) * scale + targetMin;
      if (scale !== 1) part.proportions[sizeKey] *= scale;
    }
  }
}

// Full repair pipeline: validate, expand repeats, connect stray parts, re-frame.
export function normalizeParts(parts: FurniturePart[]): FurniturePart[] {
  const expanded = sanitizeParts(parts).flatMap(expandPart);
  if (expanded.length === 0) return [];
  snapDisconnectedParts(expanded);
  fitToUnitBox(expanded);
  return expanded;
}
