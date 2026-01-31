"use client";

import React from "react";
import { Group, Rect, Path, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

interface ExtrudedRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number; // Visual height in pixels
  color?: string;
  imageUrl?: string;
  isSelected?: boolean;
  isInvalid?: boolean;
  rotation?: number;
  isIsoMode?: boolean; // New prop for conditional extrusion
  onClick?: (e: any) => void;
  onTap?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  onDragMove?: (e: any) => void;
  draggable?: boolean;
}

const ExtrudedRect: React.FC<ExtrudedRectProps> = ({
  x,
  y,
  width,
  height,
  depth = 20,
  color = "#3b82f6",
  imageUrl,
  isSelected,
  isInvalid,
  rotation = 0,
  isIsoMode = true, // Default to true until controlled
  ...props
}) => {
  const [image] = useImage(imageUrl || "");

  const mainColor = isInvalid ? "#ef4444" : color;
  const strokeColor = isInvalid ? "#b91c1c" : (isSelected ? "#fff" : "rgba(0,0,0,0.1)");
  
  // Shade colors
  const FRONT_SHADE = "rgba(0,0,0,0.1)";

  // Shadow parameters - only in ISO mode
  const shadowOffset = isIsoMode ? depth * 0.2 : 4;
  
  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      draggable={props.draggable}
      onDragMove={props.onDragMove}
      onDragEnd={props.onDragEnd}
      onClick={props.onClick}
      onTap={props.onTap}
    >
        {/* Drop Shadow */}
        <Rect
            x={shadowOffset}
            y={shadowOffset}
            width={width}
            height={height}
            fill="rgba(0,0,0,0.2)"
            cornerRadius={4}
            opacity={0.5}
        />

        {/* Extrusion (Sides) - Only visible in ISO mode */}
        {isIsoMode && (
          <>
            <Rect
                x={0}
                y={height}
                width={width}
                height={depth}
                fill={mainColor}
            />
            <Rect
                 x={0}
                 y={height}
                 width={width}
                 height={depth}
                 fill={FRONT_SHADE} // Darken it
            />
          </>
        )}

        {/* Top Face */}
        <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={mainColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 3 : 1}
            cornerRadius={2}
        />
        
        {/* Image Texture on Top Face */}
        {imageUrl && image && (
            <KonvaImage
                image={image}
                x={0}
                y={0}
                width={width}
                height={height}
                opacity={isInvalid ? 0.5 : 1}
                cornerRadius={2}
            />
        )}
        
        {/* Highlight/Selection Border */}
        {isSelected && (
            <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                stroke="#fff"
                strokeWidth={2}
                cornerRadius={2}
                shadowColor="white"
                shadowBlur={10}
                shadowOpacity={0.5}
            />
        )}
    </Group>
  );
};

export default ExtrudedRect;
