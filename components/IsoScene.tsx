"use client";

import React, { useMemo } from "react";
import { Group, Shape, Path, Rect, Text } from "react-konva";
import { LayoutState, FurnitureItem, WallAttachment } from "../types";

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
    // 1. Rotate Position
    const { x: rx, y: ry } = rotatePoint(item.x, item.y, angle, roomW, roomH);

    const handleDragEnd = (e: any) => {
        const sx = e.target.x();
        const sy = e.target.y();
        
        // Reset local drag offset
        e.target.position({ x: 0, y: 0 });

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

        const newX = Math.round(item.x + dWx);
        const newY = Math.round(item.y + dWy);
        
        onMove(item.id, newX, newY);
    };
    
    // 2. Rotate Dimensions
    // Standard rotation swap logic for width/depth
    let rw = item.width;
    let rh = item.height; // "depth" on grid
    
    // If view is rotated 90 or 270, the item's perceived w/h might swap relative to screen X/Y?
    // Actually, simple point rotation handles position. 
    // We just need to know if the item ITSELF is rotated relative to the new axes.
    //
    // Let's think:
    // Item at 0,0 size 20x10. View 0. Drawn from 0,0 to 20,10.
    // View 90. Item moves to (H, 0).
    // The "Width" (x-axis size) becomes aligned with Y axis?
    //
    // Easier approach: Calculate the 4 corners of the base rect in world space, 
    // rotate THEM, then draw.
    
    const h = item.depth || 20; // Extrusion height

    // Original 4 corners of the base rect relative to (0,0)
    // Account for item's own rotation
    const isItemRotated = item.rotation === 90 || item.rotation === 270;
    const iw = isItemRotated ? item.height : item.width;
    const id_ = isItemRotated ? item.width : item.height; // "depth" in 2D plan

    // Local corners relative to item origin
    // p1 = (0,0), p2 = (iw, 0), p3 = (iw, id_), p4 = (0, id_)
    
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
    
    // Project to screen (Base)
    const s1 = toScreen(r1.x, r1.y, 0, ppu);
    const s2 = toScreen(r2.x, r2.y, 0, ppu);
    const s3 = toScreen(r3.x, r3.y, 0, ppu);
    const s4 = toScreen(r4.x, r4.y, 0, ppu);
    
    // Project to screen (Top)
    const t1 = toScreen(r1.x, r1.y, h, ppu);
    const t2 = toScreen(r2.x, r2.y, h, ppu);
    const t3 = toScreen(r3.x, r3.y, h, ppu);
    const t4 = toScreen(r4.x, r4.y, h, ppu);

    // Color logic
    const baseColor = isInvalid ? "#ef4444" : (item.color || "#3b82f6");

    // Mouse interaction for top face
    // Currently limited to clicking. Dragging in ISO needs inverse projection.
    
    return (
        <Group 
            draggable
            onDragStart={() => onSelect(item.id)}
            onDragEnd={handleDragEnd}
            onClick={(e) => { e.cancelBubble = true; onSelect(item.id); }}
            onTap={(e) => { e.cancelBubble = true; onSelect(item.id); }}
        >
            {/* Right Face (Side 2-3) */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(t2.x, t2.y);
                    ctx.lineTo(t3.x, t3.y);
                    ctx.lineTo(s3.x, s3.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={baseColor}
                opacity={isInvalid ? 0.85 : 0.7}
                stroke={selected ? "white" : (isInvalid ? "#dc2626" : "black")}
                strokeWidth={isInvalid ? 2 : (selected ? 1 : 0.5)}
            />

            {/* Left Face (Side 3-4) */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(t3.x, t3.y);
                    ctx.lineTo(t4.x, t4.y);
                    ctx.lineTo(s4.x, s4.y);
                    ctx.lineTo(s3.x, s3.y);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={baseColor}
                opacity={isInvalid ? 0.75 : 0.5}
                stroke={selected ? "white" : (isInvalid ? "#dc2626" : "black")}
                strokeWidth={isInvalid ? 2 : (selected ? 1 : 0.5)}
            />

            {/* Top Face (Lighter) */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(t1.x, t1.y);
                    ctx.lineTo(t2.x, t2.y);
                    ctx.lineTo(t3.x, t3.y);
                    ctx.lineTo(t4.x, t4.y);
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

    // For wall attachments, we render them as flat rectangles on the wall
    // Bottom-left, bottom-right, top-right, top-left
    let corners: Array<{x: number, y: number, z: number}> = [];
    
    if (attachment.side === 'front' || attachment.side === 'back') {
        // Horizontal wall (along X axis)
        corners = [
            { x: worldX, y: worldY, z: worldZ },
            { x: worldX + w, y: worldY, z: worldZ },
            { x: worldX + w, y: worldY, z: worldZ + h },
            { x: worldX, y: worldY, z: worldZ + h }
        ];
    } else {
        // Vertical wall (along Y axis)
        corners = [
            { x: worldX, y: worldY, z: worldZ },
            { x: worldX, y: worldY + w, z: worldZ },
            { x: worldX, y: worldY + w, z: worldZ + h },
            { x: worldX, y: worldY, z: worldZ + h }
        ];
    }

    const screenCorners = corners.map(c => toScreen(c.x, c.y, c.z, ppu));
    const [s1, s2, s3, s4] = screenCorners;

    // Shelf depth rendering
    const shelfDepth = attachment.type === 'shelf' ? (offset || 12) : 0;
    let shelfFrontCorners: any[] = [];
    if (shelfDepth > 0) {
        if (attachment.side === 'front') {
            shelfFrontCorners = [
                toScreen(worldX, worldY - shelfDepth, worldZ, ppu),
                toScreen(worldX + w, worldY - shelfDepth, worldZ, ppu),
                toScreen(worldX + w, worldY - shelfDepth, worldZ + h, ppu),
                toScreen(worldX, worldY - shelfDepth, worldZ + h, ppu)
            ];
        } else if (attachment.side === 'back') {
            shelfFrontCorners = [
                toScreen(worldX, worldY + shelfDepth, worldZ, ppu),
                toScreen(worldX + w, worldY + shelfDepth, worldZ, ppu),
                toScreen(worldX + w, worldY + shelfDepth, worldZ + h, ppu),
                toScreen(worldX, worldY + shelfDepth, worldZ + h, ppu)
            ];
        }
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
