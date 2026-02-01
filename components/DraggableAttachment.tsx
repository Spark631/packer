"use client";

import React, { useRef, useState, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, Plane } from "three";
import { WallAttachment, WallSide } from "../types";
import { Edges } from "@react-three/drei";

interface DraggableAttachmentProps {
  attachment: WallAttachment;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WallAttachment>) => void;
  onDragChange?: (isDragging: boolean) => void;
  roomWidth: number;
  roomHeight: number;
}

export const DraggableAttachment: React.FC<DraggableAttachmentProps> = ({
  attachment,
  isSelected,
  onSelect,
  onUpdate,
  onDragChange,
  roomWidth,
  roomHeight,
}) => {
  const { width, height, x, y, side, type } = attachment;
  const meshRef = useRef<any>(null);
  const dragPlane = useRef(new Plane());
  const dragOffset = useRef(new Vector3());
  const [isDragging, setIsDragging] = useState(false);
  const { raycaster } = useThree();

  // Notify parent component when drag state changes
  React.useEffect(() => {
    if (onDragChange) {
      onDragChange(isDragging);
    }
  }, [isDragging, onDragChange]);

  // Calculate initial position and rotation based on wall side
  const { position, rotation } = useMemo(() => {
    let pos: [number, number, number] = [0, 0, 0];
    let rot: [number, number, number] = [0, 0, 0];

    if (side === "back") {
      pos = [x + width / 2, y + height / 2, 0];
      rot = [0, 0, 0];
    } else if (side === "front") {
      pos = [x + width / 2, y + height / 2, roomHeight];
      rot = [0, 0, 0];
    } else if (side === "left") {
      pos = [0, y + height / 2, x + width / 2];
      rot = [0, Math.PI / 2, 0];
    } else if (side === "right") {
      pos = [roomWidth, y + height / 2, x + width / 2];
      rot = [0, -Math.PI / 2, 0];
    }
    return { position: new Vector3(...pos), rotation: formatRotation(rot) };
  }, [x, y, width, height, side, roomWidth, roomHeight]);
  
  function formatRotation(r: number[]): [number, number, number] {
      return [r[0], r[1], r[2]];
  }

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    onSelect(attachment.id);
    
    // Set pointer capture to ensure we receive move events outside the mesh
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDragging(true);

    // Define the drag plane based on the wall side (in World Space)
    // The plane normal (perpendicular to the wall)
    const normal = new Vector3();
    
    if (side === "back") normal.set(0, 0, 1);
    else if (side === "front") normal.set(0, 0, 1);
    else if (side === "left") normal.set(1, 0, 0);
    else if (side === "right") normal.set(1, 0, 0);
    
    const planePoint = new Vector3(); 
    if (meshRef.current) {
        meshRef.current.updateMatrixWorld();
        meshRef.current.getWorldPosition(planePoint);
    } else {
        planePoint.copy(position);
    }

    dragPlane.current.setFromNormalAndCoplanarPoint(normal, planePoint);

    // Calculate intersection point of the ray with the plane
    const intersect = new Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersect);
    
    if (intersect) {
         // Calculate offset: where we clicked vs object world center
        dragOffset.current.subVectors(planePoint, intersect);
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    
    const intersect = new Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersect);
    
    if (intersect) {
        // New world position = intersection + offset
        const newWorldPos = intersect.add(dragOffset.current);
        
        // Convert World Position -> Wall Position (x, y)
        let newWallX = 0;
        let newWallY = newWorldPos.y - height / 2;
        
        if (side === "back" || side === "front") {
            newWallX = newWorldPos.x - width / 2;
        } else {
            // Left/Right walls run along Z
            newWallX = newWorldPos.z - width / 2;
        }

        // Clamp to wall boundaries
        const wallLimit = (side === "back" || side === "front") ? roomWidth : roomHeight;
        
        if (newWallX < 0) newWallX = 0;
        if (newWallX > wallLimit - width) newWallX = wallLimit - width;
        if (newWallY < 0) newWallY = 0;

        // Perform update
        onUpdate(attachment.id, { x: newWallX, y: newWallY });
    }
  };

  const handlePointerUp = (e: any) => {
    if (isDragging) {
        setIsDragging(false);
        (e.target as Element).releasePointerCapture(e.pointerId);
    }
  };

  // Visuals
  const color = type === 'window' ? '#93c5fd' : type === 'door' ? '#78350f' : '#a16207';
  const depth = type === 'shelf' ? (attachment.offsetFromWall || 12) : 4;
  const opacity = type === 'window' ? 0.6 : 1;
  const transparent = type === 'window';

  return (
    <group 
        ref={meshRef}
        position={position} 
        rotation={rotation}
    >
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} opacity={opacity} transparent={transparent} />
        {isSelected && <Edges color="white" threshold={15} />}
      </mesh>
    </group>
  );
};
