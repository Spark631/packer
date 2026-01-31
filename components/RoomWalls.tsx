"use client";

import React from "react";
import { Group, Rect } from "react-konva";

interface RoomWallsProps {
  width: number;
  height: number;
  wallHeight?: number;
  wallThickness?: number;
  wallColor?: string;
  floorThickness?: number;
}

const RoomWalls: React.FC<RoomWallsProps> = ({
  width,
  height,
  wallHeight = 120, // Visual height in pixels
  wallThickness = 10,
  wallColor = "#374151",
  floorThickness = 20,
}) => {
  // Shading
  const LEFT_WALL_COLOR = "#4b5563"; // Slightly lighter
  const RIGHT_WALL_COLOR = "#1f2937"; // Slightly darker
  const FLOOR_SIDE_COLOR = "#a8a29e"; // Stone/Concrete side

  return (
    <Group>
      {/* Floor Platform (Thickness) */}
      {/* Front-Left Face (Floor Thickness) */}
      <Rect
        x={0}
        y={height}
        width={width}
        height={floorThickness}
        fill={FLOOR_SIDE_COLOR}
        opacity={0.8}
      />

      {/* Left Wall (x=0 axis) */}
      <Rect
        x={-wallThickness}
        y={-wallThickness}
        width={wallThickness}
        height={height + wallThickness}
        fill={LEFT_WALL_COLOR}
        stroke={wallColor}
        strokeWidth={1}
      />
      
      {/* Right Wall (y=0 axis) */}
      <Rect
        x={-wallThickness}
        y={-wallThickness}
        width={width + wallThickness}
        height={wallThickness}
        fill={RIGHT_WALL_COLOR}
        stroke={wallColor}
        strokeWidth={1}
      />
    </Group>
  );
};

export default RoomWalls;
