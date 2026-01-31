"use client";

import React from "react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";

interface URLImageProps {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  cornerRadius?: number;
  onClick?: (e: any) => void;
  onTap?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  onDragMove?: (e: any) => void;
  draggable?: boolean;
  stroke?: string;
  strokeWidth?: number;
}

const URLImage: React.FC<URLImageProps> = ({ src, ...props }) => {
  const [image] = useImage(src);
  return (
    <KonvaImage
      image={image}
      {...props}
    />
  );
};

export default URLImage;

