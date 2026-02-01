"use client";

import React, { useMemo, useRef } from "react";
import { Group, Shape, Path, Rect, Text } from "react-konva";
import { LayoutState, FurnitureItem, WallAttachment } from "../types";
import { SNAP_SIZE, SNAP_THRESHOLD } from "../utils/geometry";

// --- Constants & Types ---
interface IsoSceneProps {
  layout: LayoutState;
  viewAngle: 0 | 90 | 180 | 270;
  pixelsPerUnit: number;
  invalidItems?: Set<string>;
  onSelectItem: (id: string) => void;
  onItemMove: (id: string, x: number, y: number) => void;
  onSelectAttachment?: (id: string | null) => void;
  onUpdateAttachment?: (id: string, updates: any) => void;
}

// Standard Isometric Tile Ratio 2:1
const TILE_WIDTH = 2; 
const TILE_HEIGHT = 1;

// --- Math Utilities ---

/**
 * Projects 3D grid coordinates to 2D screen coordinates (Isometric)
 * @param x Grid X
 * @param y Grid Y
 * @param z Grid Z (Height)
 * @param pixelsPerUnit Scale factor
 */
function toScreen(x: number, y: number, z: number, pixelsPerUnit: number) {
  // Iso projection: 
  // ScreenX = (X - Y) * cos(30)
  // ScreenY = (X + Y) * sin(30) - Z
  // Simplified for 2:1 pixel art style:
  // ScreenX = (X - Y)
  // ScreenY = (X + Y) / 2 - Z
  
  const sx = (x - y) * pixelsPerUnit;
  const sy = ((x + y) * pixelsPerUnit) / 2 - (z * pixelsPerUnit);
  return { x: sx, y: sy };
}

/**
 * Rotates a point (x,y) around the room center based on view angle (0, 90, 180, 270)
 * Logic: We rotate the *entire world* relative to the origin (0,0) of the room,
 * but effectively we are swapping axes.
 *
 * 0 deg:   x'=x, y'=y (No change)
 * 90 deg:  x'=W-y, y'=x (Rotate CW)
 * 180 deg: x'=W-x, y'=H-y
 * 270 deg: x'=y, y'=H-x
 */
function rotatePoint(x: number, y: number, angle: number, roomW: number, roomH: number) {
  switch (angle) {
    case 90: return { x: roomH - y, y: x }; // Note: dimensions swap if room is not square
    case 180: return { x: roomW - x, y: roomH - y };
    case 270: return { x: y, y: roomW - x };
    default: return { x, y };
  }
}

/**
 * Gets the effective room dimensions after rotation
 */
function getRotatedDimensions(w: number, h: number, angle: number) {
  if (angle === 90 || angle === 270) return { w: h, h: w };
  return { w, h };
}

/**
 * Maps wall attachment coordinates to 3D world position
 * @param side Wall side (front/back/left/right)
 * @param x Horizontal position along wall (inches)
 * @param y Vertical position from floor (inches) 
 * @param viewAngle Current view rotation
 * @param roomW Room width
 * @param roomH Room height (depth)
 * @returns {worldX, worldY, worldZ} 3D world coordinates
 */
function getWallCoordinates(
  side: 'front' | 'back' | 'left' | 'right',
  x: number,
  y: number,
  viewAngle: number,
  roomW: number,
  roomH: number
) {
  let worldX = 0;
  let worldY = 0;
  const worldZ = y;

  // Map wall-relative to world coordinates (before rotation)
  switch (side) {
    case 'front': // Y = 0 wall
      worldX = x;
      worldY = 0;
      break;
    case 'back': // Y = roomH wall
      worldX = x;
      worldY = roomH;
      break;
    case 'left': // X = 0 wall
      worldX = 0;
      worldY = x;
      break;
    case 'right': // X = roomW wall
      worldX = roomW;
      worldY = x;
      break;
  }

  // Apply view rotation
  const rotated = rotatePoint(worldX, worldY, viewAngle, roomW, roomH);
  return { worldX: rotated.x, worldY: rotated.y, worldZ };
}

// --- Components ---

const IsoFloor: React.FC<{ w: number; h: number; ppu: number }> = ({ w, h, ppu }) => {
  // 4 corners of the floor
  const c1 = toScreen(0, 0, 0, ppu);
  const c2 = toScreen(w, 0, 0, ppu);
  const c3 = toScreen(w, h, 0, ppu);
  const c4 = toScreen(0, h, 0, ppu);

  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
      fill="#e5e5e5"
      stroke="#d4d4d4"
      strokeWidth={1}
      listening={false} // Click-through to background for deselection
    />
  );
};

const IsoWall: React.FC<{ 
    start: {x:number, y:number}, 
    end: {x:number, y:number}, 
    height: number, 
    ppu: number,
    color?: string
}> = ({ start, end, height, ppu, color = "#9ca3af" }) => {
    
    // Base line
    const b1 = toScreen(start.x, start.y, 0, ppu);
    const b2 = toScreen(end.x, end.y, 0, ppu);
    // Top line
    const t1 = toScreen(start.x, start.y, height, ppu);
    const t2 = toScreen(end.x, end.y, height, ppu);
    
    return (
        <Shape
            sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.moveTo(b1.x, b1.y);
                ctx.lineTo(b2.x, b2.y);
                ctx.lineTo(t2.x, t2.y);
                ctx.lineTo(t1.x, t1.y);
                ctx.closePath();
                ctx.fillStrokeShape(shape);
            }}
            fill={color}
            stroke="#6b7280"
            strokeWidth={1}
        />
    );
};

const IsoFurniture: React.FC<{
    item: FurnitureItem;
    angle: number;
    roomW: number;
    roomH: number;
    ppu: number;
    selected: boolean;
    isInvalid?: boolean;
    onSelect: (id: string) => void;
    onMove: (id: string, x: number, y: number) => void;
}> = ({ item, angle, roomW, roomH, ppu, selected, isInvalid, onSelect, onMove }) => {
    const startAbsPos = useRef<{x:number, y:number} | null>(null);

    // 1. Rotate Position
    const { x: rx, y: ry } = rotatePoint(item.x, item.y, angle, roomW, roomH);

    const handleDragEnd = (e: any) => {
        const sx = e.target.x();
        const sy = e.target.y();
        
        // Reset local drag offset
        e.target.position({ x: 0, y: 0 });
        startAbsPos.current = null;

        // Calculate Delta Grid (Rotated space)
        // Inverse Iso: Gx = (Sx + 2Sy) / 2PPU, Gy = (2Sy - Sx) / 2PPU
        const dGx = (sx + 2 * sy) / (2 * ppu);
        const dGy = (2 * sy - sx) / (2 * ppu);

        // Calculate Delta World (Original space) through inverse rotation
        let dWx = dGx;
        let dWy = dGy;

        if (angle === 90) {
             // 90 deg:  x'=H-y, y'=x => dx' = -dy, dy' = dx 
             // Inverse: dx = dy', dy = -dx'
             dWx = dGy; 
             dWy = -dGx;
        } else if (angle === 180) {
            // 180 deg: x'=W-x => dx' = -dx
            dWx = -dGx;
            dWy = -dGy;
        } else if (angle === 270) {
            // 270 deg: x'=y, y'=H-x => dx' = dy, dy' = -dx
            // Inverse: dx = -dy', dy = dx'
            dWx = -dGy;
            dWy = dGx;
        }

        const targetX = item.x + dWx;
        const targetY = item.y + dWy;
        
        const snappedX = Math.round(targetX / SNAP_SIZE) * SNAP_SIZE;
        const snappedY = Math.round(targetY / SNAP_SIZE) * SNAP_SIZE;
        
        const finalX = Math.abs(targetX - snappedX) < SNAP_THRESHOLD ? snappedX : Math.round(targetX);
        const finalY = Math.abs(targetY - snappedY) < SNAP_THRESHOLD ? snappedY : Math.round(targetY);
        
        onMove(item.id, finalX, finalY);
    };

    const dragBoundFunc = (pos: { x: number; y: number }) => {
        if (!startAbsPos.current) return pos;

        const sx = pos.x - startAbsPos.current.x;
        const sy = pos.y - startAbsPos.current.y;

        // 1. Screen Delta -> Grid Delta
        const dGx = (sx + 2 * sy) / (2 * ppu);
        const dGy = (2 * sy - sx) / (2 * ppu);

        // 2. Grid Delta -> World Delta
        let dWx = dGx;
        let dWy = dGy;
        
        if (angle === 90) {
             dWx = dGy; dWy = -dGx;
        } else if (angle === 180) {
            dWx = -dGx; dWy = -dGy;
        } else if (angle === 270) {
            dWx = -dGy; dWy = dGx;
        }

        // 3. Snap World Position
        const targetX = item.x + dWx;
        const targetY = item.y + dWy;
        
        const snappedX = Math.round(targetX / SNAP_SIZE) * SNAP_SIZE;
        const snappedY = Math.round(targetY / SNAP_SIZE) * SNAP_SIZE;
        
        const finalX = Math.abs(targetX - snappedX) < SNAP_THRESHOLD ? snappedX : targetX;
        const finalY = Math.abs(targetY - snappedY) < SNAP_THRESHOLD ? snappedY : targetY;
        
        // 4. Snapped World Delta
        const finalDwx = finalX - item.x;
        const finalDwy = finalY - item.y;
        
        // 5. World Delta -> Grid Delta
        let finalDgx = finalDwx;
        let finalDgy = finalDwy;
        
        if (angle === 90) {
            finalDgx = -finalDwy;
            finalDgy = finalDwx;
        } else if (angle === 180) {
            finalDgx = -finalDwx;
            finalDgy = -finalDwy;
        } else if (angle === 270) {
            finalDgx = finalDwy;
            finalDgy = -finalDwx;
        }
        
        // 6. Grid Delta -> Screen Delta
        const finalSx = (finalDgx - finalDgy) * ppu;
        const finalSy = ((finalDgx + finalDgy) * ppu) / 2; // Z=0

        return {
            x: startAbsPos.current.x + finalSx,
            y: startAbsPos.current.y + finalSy
        };
    };
    
    const h = item.depth || 20; // Extrusion height

    // Original 4 corners of the base rect relative to (0,0)
    // Account for item's own rotation
    const isItemRotated = item.rotation === 90 || item.rotation === 270;
    const iw = isItemRotated ? item.height : item.width;
    const id_ = isItemRotated ? item.width : item.height; // "depth" in 2D plan

    // World corners
    const w1 = { x: item.x, y: item.y };
    const w2 = { x: item.x + iw, y: item.y };
    const w3 = { x: item.x + iw, y: item.y + id_ };
    const w4 = { x: item.x, y: item.y + id_ };

    // Valid rotated corners
    const r1 = rotatePoint(w1.x, w1.y, angle, roomW, roomH);
    const r2 = rotatePoint(w2.x, w2.y, angle, roomW, roomH);
    const r3 = rotatePoint(w3.x, w3.y, angle, roomW, roomH);
    const r4 = rotatePoint(w4.x, w4.y, angle, roomW, roomH);
    
    const corners = [r1, r2, r3, r4];

    // Project to screen (Base & Top)
    const basePoints = corners.map(p => toScreen(p.x, p.y, 0, ppu));
    const topPoints = corners.map(p => toScreen(p.x, p.y, h, ppu));

    // Determine visible faces
    // The "nearest" corner to the camera (bottom of diamond) has the highest (x+y) in rotated grid space.
    // We draw the two faces connected to this corner.
    
    let maxDepth = -Infinity;
    let nearIndex = 0;
    
    corners.forEach((p, i) => {
        // Grid space depth = x + y
        const depth = p.x + p.y;
        if (depth > maxDepth) {
            maxDepth = depth;
            nearIndex = i;
        }
    });

    // Indices of the corners connected to nearIndex
    const prevIndex = (nearIndex - 1 + 4) % 4;
    const nextIndex = (nearIndex + 1) % 4;

    // Face 1: near -> next
    const face1 = [
        topPoints[nearIndex],
        topPoints[nextIndex],
        basePoints[nextIndex],
        basePoints[nearIndex]
    ];

    // Face 2: prev -> near
    const face2 = [
        topPoints[prevIndex],
        topPoints[nearIndex],
        basePoints[nearIndex],
        basePoints[prevIndex]
    ];

    // Color logic
    const baseColor = isInvalid ? "#ef4444" : (item.color || "#3b82f6");

    return (
        <Group 
            draggable
            onDragStart={(e) => {
                startAbsPos.current = e.target.getAbsolutePosition();
                onSelect(item.id);
            }}
            onDragEnd={handleDragEnd}
            dragBoundFunc={dragBoundFunc}
            onClick={(e) => { e.cancelBubble = true; onSelect(item.id); }}
            onTap={(e) => { e.cancelBubble = true; onSelect(item.id); }}
        >
            {/* Face 1 */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(face1[0].x, face1[0].y);
                    ctx.lineTo(face1[1].x, face1[1].y);
                    ctx.lineTo(face1[2].x, face1[2].y);
                    ctx.lineTo(face1[3].x, face1[3].y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={baseColor}
                opacity={isInvalid ? 0.85 : 0.7}
                stroke={selected ? "white" : (isInvalid ? "#dc2626" : "black")}
                strokeWidth={isInvalid ? 2 : (selected ? 1 : 0.5)}
            />

            {/* Face 2 */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(face2[0].x, face2[0].y);
                    ctx.lineTo(face2[1].x, face2[1].y);
                    ctx.lineTo(face2[2].x, face2[2].y);
                    ctx.lineTo(face2[3].x, face2[3].y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={baseColor}
                opacity={isInvalid ? 0.75 : 0.5}
                stroke={selected ? "white" : (isInvalid ? "#dc2626" : "black")}
                strokeWidth={isInvalid ? 2 : (selected ? 1 : 0.5)}
            />

            {/* Top Face (Always visible) */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(topPoints[0].x, topPoints[0].y);
                    ctx.lineTo(topPoints[1].x, topPoints[1].y);
                    ctx.lineTo(topPoints[2].x, topPoints[2].y);
                    ctx.lineTo(topPoints[3].x, topPoints[3].y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={baseColor}
                opacity={isInvalid ? 0.95 : 0.9}
                stroke={selected ? "white" : (isInvalid ? "#dc2626" : "black")}
                strokeWidth={isInvalid ? 3 : (selected ? 2 : 0)}
            />
        </Group>
    );
}

const IsoWallAttachment: React.FC<{
    attachment: WallAttachment;
    viewAngle: number;
    roomW: number;
    roomH: number;
    ppu: number;
    selected: boolean;
    isDimmed: boolean;
    onSelect: (id: string | null) => void;
    onUpdate: (id: string, updates: any) => void;
}> = ({ attachment, viewAngle, roomW, roomH, ppu, selected, isDimmed, onSelect, onUpdate }) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragStart = () => {
        setIsDragging(true);
        onSelect(attachment.id);
    };

    const handleDragEnd = (e: any) => {
        setIsDragging(false);
        const sx = e.target.x();
        const sy = e.target.y();
        e.target.position({ x: 0, y: 0 });

        // Inverse projection for wall attachments
        // For horizontal (X) movement along wall
        const dGx = (sx + 2 * sy) / (2 * ppu);
        const dGy = (2 * sy - sx) / (2 * ppu);

        let dWallX = 0;
        let dWallY = 0;

        // Map grid delta back to wall-relative delta based on side
        // This is complex - simplified: just use horizontal component
        if (attachment.side === 'front' || attachment.side === 'back') {
            dWallX = dGx; // X movement along wall
            dWallY = attachment.type === 'door' ? 0 : -sy / ppu; // Y only for non-doors
        } else {
            dWallX = dGy;
            dWallY = attachment.type === 'door' ? 0 : -sy / ppu;
        }

        const newX = Math.max(0, Math.min(attachment.side === 'left' || attachment.side === 'right' ? roomH : roomW, attachment.x + dWallX));
        const newY = attachment.type === 'door' ? 0 : Math.max(0, Math.min(96, attachment.y + dWallY));

        onUpdate(attachment.id, { x: newX, y: newY });
    };

    // Get 3D position
    const { worldX, worldY, worldZ } = getWallCoordinates(
        attachment.side,
        attachment.x,
        attachment.y,
        viewAngle,
        roomW,
        roomH
    );

    // Determine color by type
    const typeColors = {
        window: '#60a5fa',
        door: '#92400e',
        shelf: '#d97706'
    };
    const color = typeColors[attachment.type];

    // Project corners
    const w = attachment.width;
    const h = attachment.height;
    const offset = attachment.offsetFromWall || 0;

    // Get rotated start and end points for the wall segment
    // Since getWallCoordinates handles rotation, we use it for both points.
    
    const start = getWallCoordinates(
        attachment.side, 
        attachment.x, 
        attachment.y, 
        viewAngle, 
        roomW, 
        roomH
    );

    const end = getWallCoordinates(
        attachment.side, 
        attachment.x + w, 
        attachment.y, 
        viewAngle, 
        roomW, 
        roomH
    );

    // Construct 3D corners for the main face
    const corners = [
        { x: start.worldX, y: start.worldY, z: start.worldZ },            // Bottom-Start
        { x: end.worldX, y: end.worldY, z: end.worldZ },                  // Bottom-End
        { x: end.worldX, y: end.worldY, z: end.worldZ + h },              // Top-End
        { x: start.worldX, y: start.worldY, z: start.worldZ + h }         // Top-Start
    ];

    const screenCorners = corners.map(c => toScreen(c.x, c.y, c.z, ppu));
    const [s1, s2, s3, s4] = screenCorners;

    // Shelf depth rendering
    const shelfDepth = attachment.type === 'shelf' ? (offset || 12) : 0;
    let shelfFrontCorners: any[] = [];
    if (shelfDepth > 0) {
        // We need to know the "outward" direction for the shelf depth
        // This depends on the wall orientation
        // Simplified: Since we don't have vector math handy, let's use the known wall axes.
        // Wall Start->End vector is (end.worldX - start.worldX, end.worldY - start.worldY)
        // Normal vector (outward) is perpendicular to Wall Vector
        // But "outward" depends on which side of the wall is "inside" the room.
        // Room interior is always [0, W] x [0, H] ?
        // Actually, wall attachments are on the perimeter. Outward usually means towards interior? 
        // Or "offsetFromWall" implies sticking OUT into the room.
        // So we want vector pointing INTO the room.
        
        // Wall vectors:
        // Front (y=0): Along X. Normal (0, 1) points into room.
        // Back (y=H): Along X. Normal (0, -1) points into room.
        // Left (x=0): Along Y. Normal (1, 0) points into room.
        // Right (x=W): Along Y. Normal (-1, 0) points into room.
        
        let nx = 0, ny = 0;
        if (attachment.side === 'front') { nx = 0; ny = 1; }
        else if (attachment.side === 'back') { nx = 0; ny = -1; }
        else if (attachment.side === 'left') { nx = 1; ny = 0; }
        else if (attachment.side === 'right') { nx = -1; ny = 0; }
        
        // Rotate the normal vector
        const rotatedNormal = rotatePoint(nx, ny, viewAngle, 0, 0); // Rotate relative to origin
        // But rotatePoint assumes rotation around room center?
        // No, rotatePoint impl:
        // case 90: return { x: roomH - y, y: x };
        // If we rotate a vector, we don't care about translation (room dimensions).
        // Let's use simplified rotation for vectors:
        // 0: x, y
        // 90: -y, x
        // 180: -x, -y
        // 270: y, -x
        
        let rnx = nx, rny = ny;
        if (viewAngle === 90) { rnx = -ny; rny = nx; }
        else if (viewAngle === 180) { rnx = -nx; rny = -ny; }
        else if (viewAngle === 270) { rnx = ny; rny = -nx; }
        
        // Shelf front face is shifted by normal * depth
        const shiftX = rnx * shelfDepth;
        const shiftY = rny * shelfDepth;
        
        shelfFrontCorners = corners.map(c => toScreen(c.x + shiftX, c.y + shiftY, c.z, ppu));
    }

    const opacity = isDimmed ? 0.4 : 0.9;

    return (
        <Group
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => { e.cancelBubble = true; onSelect(attachment.id); }}
            onTap={(e) => { e.cancelBubble = true; onSelect(attachment.id); }}
        >
            {/* Main face */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.lineTo(s3.x, s3.y);
                    ctx.lineTo(s4.x, s4.y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={color}
                opacity={opacity}
                stroke={selected ? 'white' : '#000'}
                strokeWidth={selected ? 2 : 1}
            />

            {/* Shelf depth front face */}
            {shelfDepth > 0 && shelfFrontCorners.length > 0 && (
                <Shape
                    sceneFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.moveTo(shelfFrontCorners[0].x, shelfFrontCorners[0].y);
                        ctx.lineTo(shelfFrontCorners[1].x, shelfFrontCorners[1].y);
                        ctx.lineTo(shelfFrontCorners[2].x, shelfFrontCorners[2].y);
                        ctx.lineTo(shelfFrontCorners[3].x, shelfFrontCorners[3].y);
                        ctx.closePath();
                        ctx.fillStrokeShape(shape);
                    }}
                    fill={color}
                    opacity={opacity * 0.8}
                    stroke='#000'
                    strokeWidth={0.5}
                />
            )}

            {/* Ghost outline when dragging */}
            {isDragging && (
                <Shape
                    sceneFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.moveTo(s1.x, s1.y);
                        ctx.lineTo(s2.x, s2.y);
                        ctx.lineTo(s3.x, s3.y);
                        ctx.lineTo(s4.x, s4.y);
                        ctx.closePath();
                        ctx.setLineDash([5, 5]);
                        ctx.strokeShape(shape);
                    }}
                    stroke='#ffffff'
                    strokeWidth={2}
                    opacity={0.5}
                />
            )}
        </Group>
    );
};

// --- Main Component ---

const IsoScene: React.FC<IsoSceneProps> = ({ 
    layout, 
    viewAngle, 
    pixelsPerUnit,
    invalidItems,
    onSelectItem,
    onItemMove,
    onSelectAttachment,
    onUpdateAttachment
}) => {
    // 1. Calculate Rotated World Bounds
    const { w: rw, h: rh } = getRotatedDimensions(layout.room.width, layout.room.height, viewAngle);

    // 2. Sort Items by Depth
    // In Iso, depth = X + Y. (Back corner is 0,0, front corner is W,H)
    // We want larger (X+Y) to be drawn later (on top).
    // But wait, standard painter's Algo for iso:
    // Sort by (GridX + GridY). Smallest sum (furthest back) draws first.
    
    const sortedItems = useMemo(() => {
        return [...layout.items].sort((a, b) => {
            // Must use rotated coordinates for sorting!
            const ra = rotatePoint(a.x, a.y, viewAngle, layout.room.width, layout.room.height);
            const rb = rotatePoint(b.x, b.y, viewAngle, layout.room.width, layout.room.height);
            return (ra.x + ra.y) - (rb.x + rb.y);
        });
    }, [layout.items, viewAngle, layout.room]);

    return (
        <Group>
            {/* 1. Floor */}
            <IsoFloor w={rw} h={rh} ppu={pixelsPerUnit} />

            {/* 2. Back Walls */}
            {/* In our rotated view, the "Back" walls are always at x=0 and y=0 ? */}
            {/* Yes! If we rotated correctly, (0,0) is always the "Far Top" corner of the diamond. */}
            {/* Left Wall: along Y axis (x=0) */}
            <IsoWall 
                start={{x: 0, y: rh}} 
                end={{x: 0, y: 0}} 
                height={96} // Standard wall height
                ppu={pixelsPerUnit}
                color="#6b7280"
            />
            {/* Right Wall: along X axis (y=0) */}
            <IsoWall 
                start={{x: 0, y: 0}} 
                end={{x: rw, y: 0}} 
                height={96}
                ppu={pixelsPerUnit}
                color="#4b5563"
            />

            {/* 3. Wall Attachments */}
            {(layout.attachments || []).map(attachment => {
                // Calculate if attachment is dimmed (behind furniture)
                const attCoords = getWallCoordinates(attachment.side, attachment.x, attachment.y, viewAngle, layout.room.width, layout.room.height);
                const attDepth = attCoords.worldX + attCoords.worldY;

                // Check if any furniture blocks this attachment
                const isDimmed = sortedItems.some(item => {
                    const { x: rx, y: ry } = rotatePoint(item.x, item.y, viewAngle, layout.room.width, layout.room.height);
                    const itemDepth = rx + ry;
                    // Simple check: if furniture is closer (higher depth), dim attachment
                    return itemDepth > attDepth + 10; // 10 inch buffer
                });

                return (
                    <IsoWallAttachment
                        key={attachment.id}
                        attachment={attachment}
                        viewAngle={viewAngle}
                        roomW={layout.room.width}
                        roomH={layout.room.height}
                        ppu={pixelsPerUnit}
                        selected={layout.selectedAttachmentId === attachment.id}
                        isDimmed={isDimmed}
                        onSelect={onSelectAttachment || (() => {})}
                        onUpdate={onUpdateAttachment || (() => {})}
                    />
                );
            })}

            {/* 4. Furniture */}
            {sortedItems.map(item => (
                <IsoFurniture
                    key={item.id}
                    item={item}
                    angle={viewAngle}
                    roomW={layout.room.width}
                    roomH={layout.room.height}
                    ppu={pixelsPerUnit}
                    selected={layout.selectedItemId === item.id}
                    isInvalid={invalidItems?.has(item.id)}
                    onSelect={onSelectItem}
                    onMove={onItemMove}
                />
            ))}
        </Group>
    );
};

export default IsoScene;
