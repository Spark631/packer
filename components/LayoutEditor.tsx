"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Stage, Layer, Rect, Group, Line } from "react-konva";
import { LayoutState, FurnitureItem } from "../types";
import { RotateCw, Trash2, Plus, X, Copy, RotateCcw, Share2, Camera, Box, LayoutGrid, Sparkles, Pencil, Home } from "lucide-react";
import { checkValidity, SNAP_SIZE, SNAP_THRESHOLD } from "../utils/geometry";
import { FURNITURE_PRESETS, FurniturePreset, FLOOR_PRESETS } from "../data/presets";
import { serializeLayout, deserializeLayout } from "../utils/serialization";
import ImageModelCreator from "./ImageModelCreator";
import URLImage from "./URLImage";
import ExtrudedRect from "./ExtrudedRect";
import RoomWalls from "./RoomWalls";
import ThreeScene from "./ThreeScene";
import IsoScene from "./IsoScene";

interface LayoutEditorProps {
  initialState: LayoutState;
}

const LayoutEditor: React.FC<LayoutEditorProps> = ({ initialState }) => {
  const router = useRouter();
  const [layout, setLayout] = useState<LayoutState>(initialState);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [invalidItems, setInvalidItems] = useState<Set<string>>(new Set());
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isThreeSceneOpen, setIsThreeSceneOpen] = useState(false); // New state for 3D overlay
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false); // New state for edit panel
  const [isoAngle, setIsoAngle] = useState<0 | 90 | 180 | 270>(0); // New angle state
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [isRoomSelected, setIsRoomSelected] = useState(false); // State for room selection
  
  // View Mode: '2d' or 'iso'
  const [viewMode, setViewMode] = useState<'2d' | 'iso'>('iso');

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

  // Calculate scale to fit room in window with padding
  const PADDING = 100;
  const availableWidth = windowSize.width - PADDING;
  const availableHeight = windowSize.height - PADDING;

  // Determine scale to fit the room
  const scaleX = availableWidth / layout.room.width;
  const scaleY = availableHeight / layout.room.height;
  
  // Use the smaller scale to ensure it fits entirely
  // But cap max scale (e.g. 5) to prevent tiny rooms from being massive
  const PIXELS_PER_UNIT = Math.min(scaleX, scaleY, 5);
  
  // Center the room in the stage
  const stageCenterX = windowSize.width / 2;
  const stageCenterY = windowSize.height / 2;
  
  const roomPixelWidth = layout.room.width * PIXELS_PER_UNIT;
  const roomPixelHeight = layout.room.height * PIXELS_PER_UNIT;
  
  // Isometric Transform Logic
  // We want to pivot around the center of the room.
  const roomCenterX = stageCenterX;
  const roomCenterY = stageCenterY;
  
  // Transform settings
  // ScaleY 0.5 squashes it vertically.
  // Rotate 45 degrees.
  // Since we are transforming the LAYER/GROUP, coordinates inside are still "local".
  // However, input events (mouse) need to be mapped if we transform the stage context heavily.
  // Fortunately, Konva handles hit testing through transforms usually.
  
  const isoScaleY = 0.6; // Slightly more than 0.5 to look better
  const isoRotation = 45;
  
  const groupScaleX = viewMode === 'iso' ? 1 : 1;
  const groupScaleY = viewMode === 'iso' ? isoScaleY : 1;
  const groupRotation = viewMode === 'iso' ? isoRotation : 0;
  
  // Adjust position to keep room centered after transform
  // For simple implementation, we just center the group
  const groupX = stageCenterX;

  const groupY = stageCenterY;

  const contentOffsetX = -roomPixelWidth / 2;
  const contentOffsetY = -roomPixelHeight / 2;

  const handleSelect = (id: string | null) => {
    setIsRoomSelected(false);
    setLayout((prev) => ({ ...prev, selectedItemId: id }));
  };

  const handleRotateView = () => {
    setIsoAngle(prev => {
        const next = (prev + 90) % 360;
        return next as 0 | 90 | 180 | 270;
    });
  };


  const handleDeselect = (e: any) => {
    // deselect when clicking on empty area of the room or stage
    const clickedOnStage = e.target === e.target.getStage();
    const clickedOnRoomFloor = e.target.attrs.name === "room-floor";
    
    if (clickedOnRoomFloor) {
      setLayout((prev) => ({ ...prev, selectedItemId: null, selectedAttachmentId: null }));
      setIsRoomSelected(true);
      return;
    }

    if (clickedOnStage) {
      setLayout((prev) => ({ ...prev, selectedItemId: null, selectedAttachmentId: null }));
      setIsRoomSelected(false);
    }
  };

  const handleDragMove = (id: string, e: any) => {
    const { x, y } = e.target.position();
    
    // Magnetic snap to grid
    const rawX = x / PIXELS_PER_UNIT;
    const rawY = y / PIXELS_PER_UNIT;
    
    const snappedX = Math.round(rawX / SNAP_SIZE) * SNAP_SIZE;
    const snappedY = Math.round(rawY / SNAP_SIZE) * SNAP_SIZE;
    
    const finalX = Math.abs(rawX - snappedX) < SNAP_THRESHOLD ? snappedX : Math.round(rawX);
    const finalY = Math.abs(rawY - snappedY) < SNAP_THRESHOLD ? snappedY : Math.round(rawY);
    
    const movingItem = layout.items.find(i => i.id === id);
    if (!movingItem) return;
    
    // Construct temporary rect for the moving item
    const isRotated = movingItem.rotation === 90 || movingItem.rotation === 270;
    const movingRect = {
       x: finalX,
       y: finalY,
       width: isRotated ? movingItem.height : movingItem.width,
       height: isRotated ? movingItem.width : movingItem.height,
    };

    setInvalidItems(checkValidity(layout.items, layout.room, id, movingRect));
  };

  const handleDragEnd = (id: string, e: any) => {
    const { x, y } = e.target.position();
    
    const rawX = x / PIXELS_PER_UNIT;
    const rawY = y / PIXELS_PER_UNIT;
    
    const snappedX = Math.round(rawX / SNAP_SIZE) * SNAP_SIZE;
    const snappedY = Math.round(rawY / SNAP_SIZE) * SNAP_SIZE;
    
    const finalX = Math.abs(rawX - snappedX) < SNAP_THRESHOLD ? snappedX : Math.round(rawX);
    const finalY = Math.abs(rawY - snappedY) < SNAP_THRESHOLD ? snappedY : Math.round(rawY);
    
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, x: finalX, y: finalY } : item
      ),
    }));
  };

  const handleUpdateItem = (id: string, updates: Partial<FurnitureItem>) => {
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
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

  // Attachment Handlers
  const handleAddAttachment = (attachment: any) => {
    setLayout((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), attachment],
      selectedAttachmentId: attachment.id,
      selectedItemId: null // Deselect furniture
    }));
  };

  const handleUpdateAttachment = (id: string, updates: any) => {
    setLayout((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).map((att) =>
        att.id === id ? { ...att, ...updates } : att
      ),
    }));
  };

  const handleDeleteAttachment = (id: string) => {
    setLayout((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((att) => att.id !== id),
      selectedAttachmentId: null,
    }));
  };

  const handleSelectAttachment = (id: string | null) => {
    setIsRoomSelected(false);
    setLayout((prev) => ({
        ...prev,
        selectedAttachmentId: id,
        selectedItemId: id ? null : prev.selectedItemId
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

  const handleUpdateRoom = (updates: Partial<typeof layout.room>) => {
    setLayout(prev => ({
        ...prev,
        room: { ...prev.room, ...updates }
    }));
  };

  const handleAddItem = (preset: FurniturePreset) => {
    const newItem: FurnitureItem = {
      id: Date.now().toString(),
      type: preset.type,
      width: preset.width,
      height: preset.height,
      x: layout.room.width / 2 - preset.width / 2,
      y: layout.room.height / 2 - preset.height / 2,
      rotation: 0,
      depth: preset.depth,
      color: preset.color
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

  const handleGenerateItem = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    
    try {
        const res = await fetch('/api/generate-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: aiPrompt })
        });
        
        const data = await res.json();
        
        if (data.code) {
             const newItem: FurnitureItem = {
                id: Date.now().toString(),
                type: 'custom',
                width: 36, // Default sizes
                height: 36,
                depth: 30,
                x: layout.room.width / 2 - 18,
                y: layout.room.height / 2 - 18,
                rotation: 0,
                color: "#60a5fa",
                proceduralCode: data.code
             };
             
             setLayout((prev) => ({
                ...prev,
                items: [...prev.items, newItem],
                selectedItemId: newItem.id,
             }));
             setIsAddPanelOpen(false);
             setAiPrompt("");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to generate model.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleSavePhotoItem = (item: FurnitureItem) => {
    // Center the new photo item
    item.x = layout.room.width / 2 - item.width / 2;
    item.y = layout.room.height / 2 - item.height / 2;
    
    setLayout((prev) => ({
        ...prev,
        items: [...prev.items, item],
        selectedItemId: item.id
    }));
    setIsCameraModalOpen(false);
    setIsAddPanelOpen(false);
  };

  const handleHome = () => {
    // Save to localStorage
    try {
        const savedRoomsStr = localStorage.getItem('packer_rooms');
        const savedRooms: LayoutState[] = savedRoomsStr ? JSON.parse(savedRoomsStr) : [];
        
        const currentRoom = {
            ...layout,
            id: layout.id || Date.now().toString(),
            name: layout.name || "Untitled Room",
            lastModified: Date.now()
        };

        // Upsert
        const existingIndex = savedRooms.findIndex(r => r.id === currentRoom.id);
        if (existingIndex >= 0) {
            savedRooms[existingIndex] = currentRoom;
        } else {
            savedRooms.push(currentRoom);
        }

        localStorage.setItem('packer_rooms', JSON.stringify(savedRooms));
    } catch (e) {
        console.error("Failed to save room", e);
    }
    
    router.push('/');
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
        stroke="rgba(0,0,0,0.05)" // Lighter grid
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
        stroke="rgba(0,0,0,0.05)" // Lighter grid
        strokeWidth={1}
        listening={false}
      />
    );
  }

  return (
    <div className="w-full h-screen bg-gray-100 overflow-hidden relative">
      <Stage 
        width={windowSize.width} 
        height={windowSize.height}
        onMouseDown={handleDeselect}
        onTouchStart={handleDeselect}
      >
        <Layer>
            {viewMode === 'iso' ? (
                 <Group x={stageCenterX} y={stageCenterY}>
                    <IsoScene 
                        layout={layout} 
                        viewAngle={isoAngle} 
                        pixelsPerUnit={PIXELS_PER_UNIT * 0.5} 
                        invalidItems={invalidItems}
                        onSelectItem={handleSelect}
                        onItemMove={(id, x, y) => {
                             setLayout(prev => ({
                                ...prev,
                                items: prev.items.map(i => i.id === id ? { ...i, x, y } : i)
                             }));
                        }}
                        onSelectAttachment={handleSelectAttachment}
                        onUpdateAttachment={handleUpdateAttachment}
                    />
                 </Group>
            ) : (
              <Group
                 x={groupX}
                 y={groupY}
              >
                 <Group x={contentOffsetX} y={contentOffsetY}>
    
                    {/* Wall Borders (Simulated by drawing a larger rect behind) */}
                      <Rect
                        x={-10}
                        y={-10}
                        width={roomPixelWidth + 20}
                        height={roomPixelHeight + 20}
                        fill="#374151" // Dark Gray Walls
                        cornerRadius={0}
                        shadowBlur={0}
                        shadowColor="black"
                        shadowOpacity={0.2}
                      />
    
                    {/* Room Floor */}
                    <Rect
                      name="room-floor"
                      width={roomPixelWidth}
                      height={roomPixelHeight}
                      fill={layout.room.floorColor || "#d6d3d1"}
                    />
                    
                    {/* Grid */}
                    {gridLines}
    
                    {/* Furniture Items */}
                    {layout.items.map((item) => {
                      const isSelected = layout.selectedItemId === item.id;
                      const isInvalid = invalidItems.has(item.id);
                      
                      const itemProps = {
                          x: item.x * PIXELS_PER_UNIT,
                          y: item.y * PIXELS_PER_UNIT,
                          width: (item.rotation === 90 || item.rotation === 270 ? item.height : item.width) * PIXELS_PER_UNIT,
                          height: (item.rotation === 90 || item.rotation === 270 ? item.width : item.height) * PIXELS_PER_UNIT,
                          depth: (item.depth || 20), // visual height
                          color: item.color || "#3b82f6",
                          imageUrl: item.imageUrl,
                          rotation: 0, 
                          isIsoMode: false,
                          
                          isSelected,
                          isInvalid,
                          draggable: true,
                          onDragMove: (e: any) => handleDragMove(item.id, e),
                          onDragEnd: (e: any) => handleDragEnd(item.id, e),
                          dragBoundFunc: (pos: { x: number, y: number }) => {
                              // Only snap in 2D mode here. Iso mode is handled in IsoScene.
                              if (viewMode === 'iso') return pos;
                              
                              const parentAbsX = groupX + contentOffsetX;
                              const parentAbsY = groupY + contentOffsetY;
                              
                              const relX = pos.x - parentAbsX;
                              const relY = pos.y - parentAbsY;
                              
                              const rawX = relX / PIXELS_PER_UNIT;
                              const rawY = relY / PIXELS_PER_UNIT;
                              
                              const snappedX = Math.round(rawX / SNAP_SIZE) * SNAP_SIZE;
                              const snappedY = Math.round(rawY / SNAP_SIZE) * SNAP_SIZE;
                              
                              const finalX = Math.abs(rawX - snappedX) < SNAP_THRESHOLD ? snappedX : rawX;
                              const finalY = Math.abs(rawY - snappedY) < SNAP_THRESHOLD ? snappedY : rawY;
                              
                              return {
                                x: parentAbsX + finalX * PIXELS_PER_UNIT,
                                y: parentAbsY + finalY * PIXELS_PER_UNIT
                              };
                          },
                          onClick: (e: any) => {
                            e.cancelBubble = true;
                            handleSelect(item.id);
                          },
                          onTap: (e: any) => {
                             e.cancelBubble = true;
                             handleSelect(item.id);
                          }
                      };
                      
                      return (
                        <ExtrudedRect
                           key={item.id}
                           {...itemProps}
                        />
                      );
                    })}
                 </Group>
              </Group>
            )}
        </Layer>
      </Stage>
      
      {/* Overlay UI for info */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur p-4 rounded-xl shadow-sm border border-gray-200 z-10 flex flex-col gap-2">
        <div>
           <input
             type="text"
             value={layout.name || ""}
             placeholder="Untitled Room"
             onChange={(e) => setLayout(prev => ({ ...prev, name: e.target.value }))}
             className="font-bold text-lg text-gray-800 bg-transparent border-none focus:ring-0 p-0 w-full placeholder-gray-400"
           />
           <div className="flex items-center gap-2 mt-1">
             <span className="text-sm text-gray-500">Room:</span>
             <input
               type="number"
               value={layout.room.width}
               onChange={(e) => handleUpdateRoom({ width: Math.max(1, Number(e.target.value)) })}
               className="w-16 p-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
             />
             <span className="text-sm text-gray-500">x</span>
             <input
               type="number"
               value={layout.room.height}
               onChange={(e) => handleUpdateRoom({ height: Math.max(1, Number(e.target.value)) })}
               className="w-16 p-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
             />
             <span className="text-sm text-gray-500">"</span>
           </div>
        </div>
      </div>
      
      {/* View Mode Toggle */}
      <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur p-1 rounded-lg shadow-xl border border-gray-200 z-10 flex">
         <button
           onClick={() => setViewMode('2d')}
           className={`p-3 rounded-md flex items-center gap-2 font-semibold text-sm transition-all ${viewMode === '2d' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
         >
           <LayoutGrid size={20} />
           2D Top
         </button>
         <button
           onClick={() => setViewMode('iso')}
           className={`p-3 rounded-md flex items-center gap-2 font-semibold text-sm transition-all ${viewMode === 'iso' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
         >
           <Box size={20} />
           3D View
         </button>
         <button
           onClick={() => setIsThreeSceneOpen(true)}
           className="p-3 rounded-md flex items-center gap-2 font-semibold text-sm transition-all text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
         >
           <Box size={20} />
           True 3D
         </button>
         
         {viewMode === 'iso' && (
             <button
                onClick={handleRotateView}
                className="ml-2 p-3 rounded-md flex items-center gap-2 font-semibold text-sm transition-all text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                title="Rotate View 90°"
             >
                <RotateCw size={20} />
             </button>
         )}
      </div>

       <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button 
             onClick={handleHome}
             className="bg-white p-3 rounded-full shadow-sm text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-gray-200"
             title="Save & Home"
           >
             <Home size={20} />
           </button>
          <button 
             onClick={handleShare}
             className="bg-white p-3 rounded-full shadow-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-all border border-gray-200"
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
             className="bg-white p-3 rounded-full shadow-sm text-gray-700 hover:text-red-600 hover:bg-red-50 transition-all border border-gray-200"
             title="Reset Layout"
           >
             <RotateCcw size={20} />
           </button>
           <button 
             onClick={() => setIsAddPanelOpen(true)}
             className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-lg hover:bg-black transition-all font-medium flex items-center gap-2 transform hover:scale-105 active:scale-95"
           >
             <Plus size={20} />
             Add Furniture
           </button>
       </div>
      
      {/* Validation Message */}
      {invalidItems.size > 0 && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full shadow-lg z-10 font-bold animate-pulse">
          Out of bounds or colliding!
        </div>
      )}

      {/* Selected Item Controls */}
      {layout.selectedItemId && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-8 py-4 rounded-2xl shadow-xl z-10 flex gap-6 items-center border border-gray-200">
           <button 
             onClick={() => setIsEditPanelOpen(true)}
             className="flex flex-col items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
           >
             <div className="p-2 bg-gray-100 rounded-full group-hover:bg-indigo-100 transition-colors">
                <Pencil size={20} />
             </div>
             <span className="text-xs font-semibold">Edit</span>
           </button>
           <div className="w-px h-10 bg-gray-200"></div>
           <button 
             onClick={handleRotate}
             className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
           >
             <div className="p-2 bg-gray-100 rounded-full group-hover:bg-blue-100 transition-colors">
                <RotateCw size={20} />
             </div>
             <span className="text-xs font-semibold">Rotate</span>
           </button>
           <div className="w-px h-10 bg-gray-200"></div>
           <button 
             onClick={handleDuplicate}
             className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
           >
             <div className="p-2 bg-gray-100 rounded-full group-hover:bg-blue-100 transition-colors">
                <Copy size={20} />
             </div>
             <span className="text-xs font-semibold">Clone</span>
           </button>
           <div className="w-px h-10 bg-gray-200"></div>
           <button 
             onClick={handleDelete}
             className="flex flex-col items-center gap-1 text-gray-600 hover:text-red-600 transition-colors"
           >
             <div className="p-2 bg-gray-100 rounded-full group-hover:bg-red-100 transition-colors">
                <Trash2 size={20} />
             </div>
             <span className="text-xs font-semibold">Delete</span>
           </button>
        </div>
      )}

      {/* Edit Item Panel */}
      {isEditPanelOpen && layout.selectedItemId && (
        <div className="absolute top-20 right-4 w-72 bg-white/95 backdrop-blur p-6 rounded-2xl shadow-xl z-20 border border-gray-200">
           <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-gray-800">Edit Attributes</h3>
             <button onClick={() => setIsEditPanelOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
               <X size={20} />
             </button>
           </div>
           
           {(() => {
              const item = layout.items.find(i => i.id === layout.selectedItemId);
              if (!item) return null;
              
              return (
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Width (in)</label>
                          <input 
                            type="number" 
                            value={item.width} 
                            onChange={(e) => handleUpdateItem(item.id, { width: Math.max(1, Number(e.target.value)) })}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Depth (in)</label>
                          <input 
                            type="number" 
                            value={item.height} 
                            onChange={(e) => handleUpdateItem(item.id, { height: Math.max(1, Number(e.target.value)) })}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Height (in)</label>
                          <input 
                            type="number" 
                            value={item.depth || 20} 
                            onChange={(e) => handleUpdateItem(item.id, { depth: Math.max(1, Number(e.target.value)) })}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Color</label>
                          <div className="flex gap-2">
                              <input 
                                type="color" 
                                value={item.color || "#3b82f6"} 
                                onChange={(e) => handleUpdateItem(item.id, { color: e.target.value })}
                                className="w-10 h-10 rounded border-0 cursor-pointer"
                              />
                              <input 
                                type="text"
                                value={item.color || "#3b82f6"}
                                onChange={(e) => handleUpdateItem(item.id, { color: e.target.value })}
                                className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                              />
                          </div>
                      </div>
                  </div>
              );
           })()}
        </div>
      )}

      {/* Room Properties Panel */}
      {isRoomSelected && (
        <div className="absolute top-20 right-4 w-72 bg-white/95 backdrop-blur p-6 rounded-2xl shadow-xl z-20 border border-gray-200">
           <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-gray-800">Room Properties</h3>
             <button onClick={() => setIsRoomSelected(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
               <X size={20} />
             </button>
           </div>
           
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Material Presets</label>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {FLOOR_PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => handleUpdateRoom({ floorColor: preset.color })}
                                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
                            >
                                <div 
                                    className="w-6 h-6 rounded-full border border-gray-200 shadow-sm flex-shrink-0" 
                                    style={{ backgroundColor: preset.color }}
                                />
                                <span className="text-xs font-medium text-gray-700">{preset.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Custom Color</label>
                    <div className="flex gap-2">
                        <input 
                        type="color" 
                        value={layout.room.floorColor || "#d6d3d1"} 
                        onChange={(e) => handleUpdateRoom({ floorColor: e.target.value })}
                        className="w-10 h-10 rounded border-0 cursor-pointer"
                        />
                        <input 
                        type="text"
                        value={layout.room.floorColor || "#d6d3d1"}
                        onChange={(e) => handleUpdateRoom({ floorColor: e.target.value })}
                        className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Add Furniture Panel */}
      {isAddPanelOpen && (
        <div className="absolute top-0 right-0 h-full w-96 bg-white shadow-2xl z-20 overflow-y-auto border-l border-gray-100 p-8">
           <div className="flex justify-between items-center mb-8">
             <h2 className="text-2xl font-extrabold text-gray-900">Add Furniture</h2>
             <button onClick={() => setIsAddPanelOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
               <X size={24} className="text-gray-500" />
             </button>
           </div>
           
           <div className="mb-8">
             <button 
               onClick={() => setIsCameraModalOpen(true)}
               className="w-full flex items-center justify-center gap-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-5 rounded-xl font-bold hover:shadow-lg transition-all transform hover:-translate-y-1"
             >
               <Camera size={24} />
               <span>Create from Photo</span>
             </button>
           </div>
           
           <div className="mb-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <h3 className="flex items-center gap-2 text-sm font-bold text-blue-800 uppercase tracking-wider mb-2">
                 <Sparkles size={16} /> AI Generation
              </h3>
              <textarea 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. A modern round coffee table"
                className="w-full p-2 text-sm border border-blue-200 rounded mb-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button 
                onClick={handleGenerateItem}
                disabled={isGenerating}
                className="w-full bg-blue-600 text-white py-2 rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {isGenerating ? "Dreaming..." : "Generate 3D Model"}
              </button>
           </div>
           
           <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Presets</h3>
           <div className="space-y-3">
             {FURNITURE_PRESETS.map(preset => (
               <button
                 key={preset.id}
                 onClick={() => handleAddItem(preset)}
                 className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50 transition-all text-left group bg-white"
               >
                 <div className="w-10 h-10 rounded bg-gray-100 mr-4 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:text-indigo-500">
                    <div style={{ width: '60%', height: '60%', backgroundColor: preset.color || '#cbd5e1', borderRadius: 2 }}></div>
                 </div>
                 <div>
                    <span className="block font-bold text-gray-800 group-hover:text-indigo-900">{preset.label}</span>
                    <span className="text-xs text-gray-500 font-medium">{preset.width}" x {preset.height}"</span>
                 </div>
               </button>
             ))}
           </div>
        </div>
      )}

      {/* Camera Modal */}
      {isCameraModalOpen && (
        <ImageModelCreator 
            onClose={() => setIsCameraModalOpen(false)}
            onSave={handleSavePhotoItem}
        />
      )}

      {/* True 3D Overlay */}
      {isThreeSceneOpen && (
        <ThreeScene 
            layout={layout}
            onClose={() => setIsThreeSceneOpen(false)}
            onAddAttachment={handleAddAttachment}
            onUpdateAttachment={handleUpdateAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            onSelectAttachment={handleSelectAttachment}
        />
      )}
    </div>
  );
};

export default LayoutEditor;
