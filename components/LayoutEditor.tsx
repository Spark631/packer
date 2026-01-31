"use client";

import React, { useState, useEffect } from "react";
import { Stage, Layer, Rect, Group, Line } from "react-konva";
import { LayoutState } from "../types";
import { RotateCw, Trash2, Plus, X, Copy, RotateCcw, Share2 } from "lucide-react";
import { checkValidity } from "../utils/geometry";
import { FURNITURE_PRESETS, FurniturePreset } from "../data/presets";
import { serializeLayout, deserializeLayout } from "../utils/serialization";

interface LayoutEditorProps {
  initialState: LayoutState;
}

const LayoutEditor: React.FC<LayoutEditorProps> = ({ initialState }) => {
  const [layout, setLayout] = useState<LayoutState>(initialState);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [invalidItems, setInvalidItems] = useState<Set<string>>(new Set());
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);

  // Handle window resize for responsive stage
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    handleResize(); // Init
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const layoutParam = params.get("layout");
    if (layoutParam) {
        const loadedLayout = deserializeLayout(layoutParam);
        if (loadedLayout) {
            setLayout(loadedLayout);
        }
    }
  }, []);

  // Update URL on layout change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
        const serialized = serializeLayout(layout);
        const url = new URL(window.location.href);
        url.searchParams.set("layout", serialized);
        window.history.replaceState({}, "", url.toString());
    }, 500);
    return () => clearTimeout(timer);
  }, [layout]);

  // Check validity on layout change
  useEffect(() => {
    setInvalidItems(checkValidity(layout.items, layout.room));
  }, [layout]);

  if (windowSize.width === 0) {
    return null; // Avoid hydration mismatch or rendering before client
  }

  const PIXELS_PER_UNIT = 5; // 1 inch = 5 pixels. 10ft room = 120in = 600px.
  
  // Center the room in the stage
  const stageCenterX = windowSize.width / 2;
  const stageCenterY = windowSize.height / 2;
  
  const roomPixelWidth = layout.room.width * PIXELS_PER_UNIT;
  const roomPixelHeight = layout.room.height * PIXELS_PER_UNIT;
  
  const roomX = stageCenterX - roomPixelWidth / 2;
  const roomY = stageCenterY - roomPixelHeight / 2;

  const handleSelect = (id: string) => {
    setLayout((prev) => ({ ...prev, selectedItemId: id }));
  };

  const handleDeselect = (e: any) => {
    // deselect when clicking on empty area of the room or stage
    const clickedOnStage = e.target === e.target.getStage();
    const clickedOnRoomFloor = e.target.attrs.name === "room-floor";
    
    if (clickedOnStage || clickedOnRoomFloor) {
      setLayout((prev) => ({ ...prev, selectedItemId: null }));
    }
  };

  const handleDragMove = (id: string, e: any) => {
    const { x, y } = e.target.position();
    const newX = Math.round(x / PIXELS_PER_UNIT);
    const newY = Math.round(y / PIXELS_PER_UNIT);
    
    const movingItem = layout.items.find(i => i.id === id);
    if (!movingItem) return;
    
    // Construct temporary rect for the moving item
    const isRotated = movingItem.rotation === 90 || movingItem.rotation === 270;
    const movingRect = {
       x: newX,
       y: newY,
       width: isRotated ? movingItem.height : movingItem.width,
       height: isRotated ? movingItem.width : movingItem.height,
    };

    setInvalidItems(checkValidity(layout.items, layout.room, id, movingRect));
  };

  const handleDragEnd = (id: string, e: any) => {
    const { x, y } = e.target.position();
    // Convert back to units relative to room origin
    const newX = Math.round(x / PIXELS_PER_UNIT);
    const newY = Math.round(y / PIXELS_PER_UNIT);
    
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, x: newX, y: newY } : item
      ),
    }));
  };

  const handleRotate = () => {
    if (!layout.selectedItemId) return;
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id === prev.selectedItemId) {
          const newRotation = item.rotation === 0 ? 90 : 0;
          return { ...item, rotation: newRotation };
        }
        return item;
      }),
    }));
  };

  const handleDelete = () => {
    if (!layout.selectedItemId) return;
    setLayout((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== prev.selectedItemId),
      selectedItemId: null,
    }));
  };

  const handleDuplicate = () => {
    if (!layout.selectedItemId) return;
    const item = layout.items.find(i => i.id === layout.selectedItemId);
    if (!item) return;
    
    const newItem = {
        ...item,
        id: Date.now().toString(),
        x: item.x + 5, // offset slightly
        y: item.y + 5,
    };
     setLayout((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
      selectedItemId: newItem.id,
    }));
  };

  const handleReset = () => {
    if (confirm("Reset layout? All items will be removed.")) {
        setLayout(prev => ({ ...prev, items: [], selectedItemId: null }));
    }
  };

  const handleAddItem = (preset: FurniturePreset) => {
    const newItem = {
      id: Date.now().toString(),
      type: preset.type,
      width: preset.width,
      height: preset.height,
      x: layout.room.width / 2 - preset.width / 2,
      y: layout.room.height / 2 - preset.height / 2,
      rotation: 0,
    };
    setLayout((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
      selectedItemId: newItem.id,
    }));
    setIsAddPanelOpen(false);
  };

  const handleShare = () => {
    const serialized = serializeLayout(layout);
    const url = new URL(window.location.href);
    url.searchParams.set("layout", serialized);
    navigator.clipboard.writeText(url.toString());
    setIsShared(true);
    setTimeout(() => setIsShared(false), 2000);
  };

  // Grid generation
  const gridLines = [];
  const gridSize = 12; // 12 inches (1 foot) grid
  
  // Vertical lines
  for (let i = 0; i <= layout.room.width; i += gridSize) {
    gridLines.push(
      <Line
        key={`v-${i}`}
        points={[i * PIXELS_PER_UNIT, 0, i * PIXELS_PER_UNIT, roomPixelHeight]}
        stroke="#e5e7eb"
        strokeWidth={1}
        listening={false}
      />
    );
  }
  // Horizontal lines
  for (let i = 0; i <= layout.room.height; i += gridSize) {
    gridLines.push(
      <Line
        key={`h-${i}`}
        points={[0, i * PIXELS_PER_UNIT, roomPixelWidth, i * PIXELS_PER_UNIT]}
        stroke="#e5e7eb"
        strokeWidth={1}
        listening={false}
      />
    );
  }

  return (
    <div className="w-full h-screen bg-gray-50 overflow-hidden relative">
      <Stage 
        width={windowSize.width} 
        height={windowSize.height}
        onMouseDown={handleDeselect}
        onTouchStart={handleDeselect}
      >
        <Layer>
          {/* Room Group helps us move everything together */}
          <Group x={roomX} y={roomY}>
            {/* Room Floor */}
            <Rect
              name="room-floor"
              width={roomPixelWidth}
              height={roomPixelHeight}
              fill="white"
              stroke="#333"
              strokeWidth={2}
              shadowBlur={20}
              shadowColor="rgba(0,0,0,0.1)"
              shadowOpacity={0.3}
            />
            
            {/* Grid */}
            {gridLines}

            {/* Furniture Items */}
            {layout.items.map((item) => {
              const isSelected = layout.selectedItemId === item.id;
              const isInvalid = invalidItems.has(item.id);
              
              return (
                <Rect
                  key={item.id}
                  x={item.x * PIXELS_PER_UNIT}
                  y={item.y * PIXELS_PER_UNIT}
                  width={(item.rotation === 90 || item.rotation === 270 ? item.height : item.width) * PIXELS_PER_UNIT}
                  height={(item.rotation === 90 || item.rotation === 270 ? item.width : item.height) * PIXELS_PER_UNIT}
                  fill={isInvalid ? "#ef4444" : (isSelected ? "#60a5fa" : "#3b82f6")} // Red if invalid, light blue if selected, else blue
                  stroke={isInvalid ? "#b91c1c" : (isSelected ? "#2563eb" : "#1d4ed8")}
                  strokeWidth={isSelected || isInvalid ? 2 : 1}
                  cornerRadius={2}
                  opacity={0.9}
                  draggable
                  onDragMove={(e) => handleDragMove(item.id, e)}
                  onDragEnd={(e) => handleDragEnd(item.id, e)}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    handleSelect(item.id);
                  }}
                  onTap={(e) => {
                     e.cancelBubble = true;
                     handleSelect(item.id);
                  }}
                />
              );
            })}
          </Group>
        </Layer>
      </Stage>
      
      {/* Overlay UI for info */}
      <div className="absolute top-4 left-4 bg-white p-4 rounded shadow-md z-10 pointer-events-none flex gap-4">
        <div>
           <h1 className="font-bold text-lg">Packer</h1>
           <p className="text-sm text-gray-600">Room: {layout.room.width}" x {layout.room.height}"</p>
        </div>
      </div>

       <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button 
             onClick={handleShare}
             className="bg-white p-2 rounded shadow text-gray-700 hover:text-blue-600 border border-gray-200"
             title="Share Layout"
           >
             <Share2 size={20} />
           </button>
           {isShared && (
             <div className="absolute top-full mt-2 right-0 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap">
               Copied link!
             </div>
           )}
          <button 
             onClick={handleReset}
             className="bg-white p-2 rounded shadow text-gray-700 hover:text-red-600 border border-gray-200"
             title="Reset Layout"
           >
             <RotateCcw size={20} />
           </button>
           <button 
             onClick={() => setIsAddPanelOpen(true)}
             className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium flex items-center gap-2"
           >
             <Plus size={20} />
             Add Furniture
           </button>
       </div>
      
      {/* Validation Message */}
      {invalidItems.size > 0 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-100 text-red-800 px-4 py-2 rounded shadow-md z-10 border border-red-200 font-medium">
          Out of bounds or colliding!
        </div>
      )}

      {/* Selected Item Controls */}
      {layout.selectedItemId && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white px-6 py-3 rounded-full shadow-lg z-10 flex gap-4 items-center border border-gray-200">
           <button 
             onClick={handleRotate}
             className="flex flex-col items-center gap-1 text-gray-700 hover:text-blue-600 transition-colors"
           >
             <RotateCw size={20} />
             <span className="text-xs font-medium">Rotate</span>
           </button>
           <div className="w-px h-8 bg-gray-200 mx-2"></div>
           <button 
             onClick={handleDuplicate}
             className="flex flex-col items-center gap-1 text-gray-700 hover:text-blue-600 transition-colors"
           >
             <Copy size={20} />
             <span className="text-xs font-medium">Clone</span>
           </button>
           <div className="w-px h-8 bg-gray-200 mx-2"></div>
           <button 
             onClick={handleDelete}
             className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600 transition-colors"
           >
             <Trash2 size={20} />
             <span className="text-xs font-medium">Delete</span>
           </button>
        </div>
      )}

      {/* Add Furniture Panel */}
      {isAddPanelOpen && (
        <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl z-20 overflow-y-auto border-l border-gray-200 p-6">
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-xl font-bold">Add Furniture</h2>
             <button onClick={() => setIsAddPanelOpen(false)} className="text-gray-500 hover:text-gray-800">
               <X size={24} />
             </button>
           </div>
           
           <div className="grid grid-cols-1 gap-4">
             {FURNITURE_PRESETS.map(preset => (
               <button
                 key={preset.id}
                 onClick={() => handleAddItem(preset)}
                 className="flex flex-col items-start p-4 border border-gray-200 rounded hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
               >
                 <span className="font-bold text-gray-800">{preset.label}</span>
                 <span className="text-sm text-gray-500">{preset.width}" x {preset.height}"</span>
               </button>
             ))}
           </div>
        </div>
      )}
    </div>
  );
};

export default LayoutEditor;
