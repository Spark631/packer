// Geometry normalization for AI-generated furniture analyses.
//
// The vision model describes furniture as a list of parts in a unit bounding box whose
// origin is the center of the footprint, on the floor (see GenerativeFurniture.tsx).
// In practice it drifts from that contract: parts float apart (a drawer front emitted as
// a slab out in front of the carcass) or x/z are given on a 0..1 scale instead of
// -0.5..0.5. These passes repair the analysis so it always renders as one connected
// solid sitting inside the item's own dimensions.
//
// Curved parts are converted to straight segments up front, so every later pass deals
// only with boxes. Segments of one curve stay rigid relative to each other by sharing a
// group id - a backrest is repositioned as a whole, never bent apart.

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

// A part resolved to a concrete, straight, rotated box ready to emit.
export interface PlacedPart {
  name: string;
  shape: 'box' | 'cylinder' | 'sphere';
  proportions: { width: number; height: number; depth: number };
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  group: number; // Parts sharing a group move together during snapping.
}

export const EPSILON = 1e-4;

type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];
const SIZE_KEY: Record<Axis, 'width' | 'height' | 'depth'> = {
  x: 'width',
  y: 'height',
  z: 'depth',
};

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
      rotation: {
        x: num(part.rotation?.x, 0),
        y: num(part.rotation?.y, 0),
        z: num(part.rotation?.z, 0),
      },
      curveAngle: part.curved ? num(part.curveAngle, 0.5) : part.curveAngle,
      segments: part.curved
        ? Math.min(Math.max(Math.round(num(part.segments, 4)), 2), 12)
        : part.segments,
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

// Approximate a curved part with straight segments swept along an arc.
//
// The arc is CENTERED on the part's stated position: it runs from -curveAngle/2 to
// +curveAngle/2 so the chord's midpoint stays put and the ends bow away symmetrically.
// Sweeping from 0 instead (as an earlier version did) marched the whole part off its
// position by a full arc length, which is how a curved backrest ended up as a staircase
// of blocks flying off into space.
function expandCurvedPart(part: FurniturePart, group: number): PlacedPart[] {
  const segmentCount = part.segments || 4;
  const curveAngle = part.curveAngle || 0.5;
  const dir = part.curveDirection || 'z';
  const { width: pw, height: ph, depth: pd } = part.proportions;
  const { x: px, y: py, z: pz } = part.position;

  // Which local dimension runs along the arc, and which one bulges.
  // 'x': spans width, bulges in y (an arched rail).
  // 'y': spans width, bulges in z (a backrest curving around the sitter).
  // 'z': spans depth, bulges in y (an armrest curving down front-to-back).
  const arcLength = dir === 'z' ? pd : pw;
  const bulgeThickness = dir === 'y' ? pd : ph;

  // Degenerate curve - emit it as a single straight box rather than dividing by ~zero.
  if (curveAngle < 0.01 || arcLength < EPSILON) {
    return [toPlaced(part, part.position, group)];
  }

  const radius = arcLength / curveAngle;
  const angleStep = curveAngle / segmentCount;
  const half = curveAngle / 2;

  // Space segments by chord length and give them a little extra so the wedge-shaped
  // gaps between adjacent rotated boxes close up.
  const chord = 2 * radius * Math.sin(angleStep / 2);
  const segmentLength = chord + bulgeThickness * Math.tan(angleStep / 2);
  // Distance from the chord midpoint to the arc, removed so the part stays centered.
  const apexOffset = radius * Math.cos(half);

  const placed: PlacedPart[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const angle = -half + angleStep * (i + 0.5);
    const along = radius * Math.sin(angle);
    const across = radius * Math.cos(angle) - apexOffset;

    let position: { x: number; y: number; z: number };
    let rotation: { x: number; y: number; z: number };
    let proportions: { width: number; height: number; depth: number };

    if (dir === 'z') {
      position = { x: px, y: py + across, z: pz + along };
      rotation = { x: angle, y: 0, z: 0 };
      proportions = { width: pw, height: ph, depth: segmentLength };
    } else if (dir === 'x') {
      position = { x: px + along, y: py + across, z: pz };
      rotation = { x: 0, y: 0, z: -angle };
      proportions = { width: segmentLength, height: ph, depth: pd };
    } else {
      position = { x: px + along, y: py, z: pz + across };
      rotation = { x: 0, y: angle, z: 0 };
      proportions = { width: segmentLength, height: ph, depth: pd };
    }

    placed.push({
      name: `${part.name}_seg${i}`,
      shape: part.shape,
      proportions,
      position,
      rotation,
      group,
    });
  }

  return placed;
}

function toPlaced(
  part: FurniturePart,
  position: { x: number; y: number; z: number },
  group: number
): PlacedPart {
  return {
    name: part.name,
    shape: part.shape,
    proportions: { ...part.proportions },
    position: { ...position },
    rotation: {
      x: part.rotation?.x || 0,
      y: part.rotation?.y || 0,
      z: part.rotation?.z || 0,
    },
    group,
  };
}

// Half-size of a part's axis-aligned bounding box, accounting for rotation.
// For a rotated box the world extent along each axis is |R| applied to the local
// half-extents. Curve segments are always rotated, so ignoring this would badly
// under-measure them and let them escape the unit box.
function halfExtents(part: PlacedPart): Record<Axis, number> {
  const { width, height, depth } = part.proportions;
  const local =
    part.shape === 'sphere'
      ? { x: width / 2, y: width / 2, z: width / 2 }
      : part.shape === 'cylinder'
        ? { x: width / 2, y: height / 2, z: width / 2 }
        : { x: width / 2, y: height / 2, z: depth / 2 };

  const { x: rx, y: ry, z: rz } = part.rotation;
  if (!rx && !ry && !rz) return local;

  const [cx, sx] = [Math.cos(rx), Math.sin(rx)];
  const [cy, sy] = [Math.cos(ry), Math.sin(ry)];
  const [cz, sz] = [Math.cos(rz), Math.sin(rz)];

  // R = Rx * Ry * Rz (three.js default Euler order), absolute values only.
  const m = [
    [cy * cz, cy * sz, sy],
    [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, -sx * cy],
    [-(cx * sy * cz + sx * sz), -(cx * sy * sz - sx * cz), cx * cy],
  ].map(row => row.map(Math.abs));

  return {
    x: m[0][0] * local.x + m[0][1] * local.y + m[0][2] * local.z,
    y: m[1][0] * local.x + m[1][1] * local.y + m[1][2] * local.z,
    z: m[2][0] * local.x + m[2][1] * local.y + m[2][2] * local.z,
  };
}

interface Box {
  min: Record<Axis, number>;
  max: Record<Axis, number>;
}

function boxOf(parts: PlacedPart[]): Box {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const part of parts) {
    const h = halfExtents(part);
    for (const axis of AXES) {
      min[axis] = Math.min(min[axis], part.position[axis] - h[axis]);
      max[axis] = Math.max(max[axis], part.position[axis] + h[axis]);
    }
  }
  return { min, max };
}

function volumeOf(box: Box): number {
  return AXES.reduce((acc, axis) => acc * Math.max(box.max[axis] - box.min[axis], 0), 1);
}

// Signed overlap of two boxes along one axis. Positive = interpenetrating,
// zero = exactly flush, negative = the size of the gap between them.
function overlapOn(a: Box, b: Box, axis: Axis): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
}

interface Group {
  members: PlacedPart[];
  box: Box;
}

function touching(a: Box, b: Box): boolean {
  return AXES.every(axis => overlapOn(a, b, axis) >= -EPSILON);
}

// Move a group so it meets the target box, closing the gap on every separated axis.
function shiftToMeet(group: Group, target: Box): void {
  for (const axis of AXES) {
    const gap = -overlapOn(group.box, target, axis);
    if (gap > EPSILON) {
      const groupCenter = (group.box.min[axis] + group.box.max[axis]) / 2;
      const targetCenter = (target.min[axis] + target.max[axis]) / 2;
      const shift = Math.sign(targetCenter - groupCenter) * gap;
      for (const part of group.members) part.position[axis] += shift;
      group.box.min[axis] += shift;
      group.box.max[axis] += shift;
    }
  }
}

// Pull genuinely orphaned groups onto the body of the furniture.
//
// Connectivity is decided by the assembly as given, not by processing order: we find
// everything already reachable from the largest group through touching parts, and only
// relocate what is left over. An earlier version anchored groups largest-first, which
// dragged a correctly-attached backrest down onto the seat merely because the posts
// holding it up had not been anchored yet.
//
// A multi-segment curve shares one group id, so it moves as one rigid piece.
export function snapDisconnectedParts(parts: PlacedPart[]): void {
  const byGroup = new Map<number, PlacedPart[]>();
  for (const part of parts) {
    const members = byGroup.get(part.group);
    if (members) members.push(part);
    else byGroup.set(part.group, [part]);
  }
  if (byGroup.size < 2) return;

  const groups: Group[] = [...byGroup.values()].map(members => ({
    members,
    box: boxOf(members),
  }));

  // Seed the connected component with the largest group - the seat, carcass, tabletop.
  const largest = groups.reduce((a, b) => (volumeOf(b.box) > volumeOf(a.box) ? b : a));
  const connected = new Set<Group>([largest]);

  // Grow the component until nothing else is already touching it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of groups) {
      if (connected.has(group)) continue;
      if ([...connected].some(c => touching(group.box, c.box))) {
        connected.add(group);
        grew = true;
      }
    }
  }

  // Whatever is still outside the component is floating. Attach the closest one, then
  // reconsider - once it lands, it may be what a further orphan should attach to.
  const orphans = groups.filter(g => !connected.has(g));
  while (orphans.length > 0) {
    let best: { orphan: Group; target: Box; faceContact: boolean; distance: number } | null =
      null;

    for (const orphan of orphans) {
      for (const target of connected) {
        const gaps = AXES.map(axis => Math.max(0, -overlapOn(orphan.box, target.box, axis)));
        const distance = Math.hypot(...gaps);

        // Prefer a target this group can meet face-to-face: one it already overlaps on
        // two axes, so closing the gap on the third lands it flat against a face.
        // Without this a drawer front snaps to the edge of the drawer front above it -
        // technically touching, but still visibly floating off the carcass.
        const overlappingAxes = AXES.filter(
          axis => overlapOn(orphan.box, target.box, axis) > EPSILON
        ).length;
        const faceContact = overlappingAxes >= 2;

        const better =
          !best ||
          (faceContact && !best.faceContact) ||
          (faceContact === best.faceContact && distance < best.distance);
        if (better) best = { orphan, target: target.box, faceContact, distance };
      }
    }

    if (!best) break;
    shiftToMeet(best.orphan, best.target);
    connected.add(best.orphan);
    orphans.splice(orphans.indexOf(best.orphan), 1);
  }
}

// Re-frame the assembly into the renderer's unit box: centered on x/z, resting on the
// floor, and no larger than the item's own dimensions. This absorbs the case where the
// model used a 0..1 convention for x/z instead of -0.5..0.5.
export function fitToUnitBox(parts: PlacedPart[]): void {
  const box = boxOf(parts);

  // Only ever shrink - scaling a small model up would distort it.
  const scales = AXES.map(axis => {
    const extent = box.max[axis] - box.min[axis];
    return isFinite(extent) && extent > 1 ? 1 / extent : 1;
  });
  // Rotated parts have no meaningful per-axis local dimension, so any resize of them has
  // to be uniform or the arc would shear.
  const uniformScale = Math.min(...scales);

  AXES.forEach((axis, i) => {
    const extent = box.max[axis] - box.min[axis];
    if (!isFinite(extent) || extent < EPSILON) return;

    const scale = scales[i];
    // y rests on the floor (0..1); x and z are centered on the origin (-0.5..0.5).
    const targetMin = axis === 'y' ? 0 : -(extent * scale) / 2;

    for (const part of parts) {
      part.position[axis] = (part.position[axis] - box.min[axis]) * scale + targetMin;
      const isRotated = !!(part.rotation.x || part.rotation.y || part.rotation.z);
      if (!isRotated && scale !== 1) part.proportions[SIZE_KEY[axis]] *= scale;
    }
  });

  if (uniformScale !== 1) {
    for (const part of parts) {
      if (part.rotation.x || part.rotation.y || part.rotation.z) {
        part.proportions.width *= uniformScale;
        part.proportions.height *= uniformScale;
        part.proportions.depth *= uniformScale;
      }
    }
  }
}

// How deep the furniture is front-to-back, as a multiple of its width.
//
// A photo only shows an elevation, so the crop can measure width and standing height but
// never floor depth. The analysis does carry it: the parts occupy a unit box whose z
// extent is the depth the model inferred from perspective cues. Returning the ratio lets
// the caller turn a measured width into a plausible footprint.
export function footprintDepthRatio(parts: PlacedPart[]): number | null {
  if (parts.length === 0) return null;
  const box = boxOf(parts);
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  if (!isFinite(width) || !isFinite(depth) || width < EPSILON || depth < EPSILON) return null;

  // Clamp to a sane furniture range: a 5x-deeper-than-wide result is a bad analysis,
  // not a real piece of furniture.
  return Math.min(Math.max(depth / width, 0.2), 3);
}

// Full repair pipeline: validate, expand repeats and curves, connect stray parts, reframe.
export function normalizeParts(parts: FurniturePart[]): PlacedPart[] {
  const placed: PlacedPart[] = [];
  let group = 0;

  for (const part of sanitizeParts(parts)) {
    for (const copy of expandPart(part)) {
      // Each copy is its own rigid group; a curve's segments share their copy's group.
      if (copy.curved) placed.push(...expandCurvedPart(copy, group));
      else placed.push(toPlaced(copy, copy.position, group));
      group++;
    }
  }

  if (placed.length === 0) return [];
  snapDisconnectedParts(placed);
  fitToUnitBox(placed);
  return placed;
}
