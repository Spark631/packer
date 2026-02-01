"use client";

import React, { Suspense, useState, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stage, Environment, ContactShadows, TransformControls, Html, Edges } from "@react-three/drei";
import { LayoutState, FurnitureItem, WallAttachment, WallSide, AttachmentType } from "../types";
import { TextureLoader, MathUtils, Shape, Path, DoubleSide, Vector3, Mesh } from "three";
import { useLoader } from "@react-three/fiber";
import { FolderPlus, Heading1, X, Move, Maximize2, ArrowUpFromLine } from "lucide-react";

import { checkValidity } from "../utils/geometry";
import { DraggableAttachment } from "./DraggableAttachment";
import { GenerativeFurniture } from "./GenerativeFurniture";

interface ThreeSceneProps {
  layout: LayoutState;
  onClose: () => void;
  onAddAttachment?: (attachment: WallAttachment) => void;
  onUpdateAttachment?: (id: string, updates: Partial<WallAttachment>) => void;
  onDeleteAttachment?: (id: string) => void;
  onSelectAttachment?: (id: string | null) => void;
}

// ... RoomFloor component ...

const WallObject: React.FC<{
  width: number;
  height: number;
  side: WallSide;
  attachments: WallAttachment[];
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  onWallClick: (side: WallSide, point: Vector3, event: any) => void;
}> = ({ width, height, side, attachments, visible, position, rotation, onWallClick }) => {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0);
    s.lineTo(width, 0);
    s.lineTo(width, height);
    s.lineTo(0, height);
    s.lineTo(0, 0);

    attachments.forEach((att) => {
      const hole = new Path();
      hole.moveTo(att.x, att.y);
      hole.lineTo(att.x + att.width, att.y);
      hole.lineTo(att.x + att.width, att.y + att.height);
      hole.lineTo(att.x, att.y + att.height);
      hole.lineTo(att.x, att.y);
      s.holes.push(hole);
    });
    return s;
  }, [width, height, attachments]);

  const extrudeSettings = useMemo(() => ({
    depth: 4,
    bevelEnabled: false
  }), []);

  const zOffset = (side === 'back' || side === 'right') ? -4 : 0;

  return (
    <group position={position} rotation={rotation} visible={visible}>
      <mesh
        position={[0, 0, zOffset]}
        receiveShadow
        castShadow
        onClick={visible ? (e) => {
          e.stopPropagation();
          onWallClick(side, e.point, e);
        } : undefined}
      >
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color={side === "left" || side === "right" ? "#4b5563" : "#374151"} />
      </mesh>
    </group>
  );
};

// AttachmentObject component removed in favor of DraggableAttachment

const RoomFloor: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#d6d3d1" roughness={0.8} metalness={0.2} />
    </mesh>
  );
};

const DynamicRoomWalls: React.FC<{ 
  width: number; 
  height: number; 
  layout: LayoutState;
  onWallClick: (side: WallSide, point: Vector3, event: any) => void;
  onSelectAttachment: (id: string | null) => void;
  onUpdateAttachment?: (id: string, updates: Partial<WallAttachment>) => void;
  onDragChange?: (isDragging: boolean) => void;
}> = ({ width, height, layout, onWallClick, onSelectAttachment, onUpdateAttachment, onDragChange }) => {
  const wallHeight = 96;
  const [visibleWalls, setVisibleWalls] = useState<{
    back: boolean;
    front: boolean;
    left: boolean;
    right: boolean;
  }>({ back: true, front: false, left: true, right: false });

  useFrame((state) => {
    const cx = state.camera.position.x;
    const cz = state.camera.position.z;
    const isFront = cz > 0;
    const isRight = cx > 0;
    setVisibleWalls({
        back: isFront,
        front: !isFront,
        left: isRight,
        right: !isRight,
    });
  });

  return (
    <group>
      {/* Back Wall (Z=0 axis) */}
      <WallObject 
        side="back" width={width} height={wallHeight} 
        visible={visibleWalls.back} 
        position={[0, 0, 0]} rotation={[0, 0, 0]}
        attachments={layout.attachments?.filter(a => a.side === 'back') || []}
        onWallClick={onWallClick}
      />
      {/* Front Wall (Z=height axis) */}
      <WallObject 
        side="front" width={width} height={wallHeight} 
        visible={visibleWalls.front} 
        position={[0, 0, height]} rotation={[0, 0, 0]}
        attachments={layout.attachments?.filter(a => a.side === 'front') || []}
        onWallClick={onWallClick}
      />
      {/* Left Wall (X=0 axis) */}
      <WallObject 
        side="left" width={height} height={wallHeight} 
        visible={visibleWalls.left} 
        position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}
        attachments={layout.attachments?.filter(a => a.side === 'left') || []}
        onWallClick={onWallClick}
      />
      {/* Right Wall (X=width axis) */}
      <WallObject 
        side="right" width={height} height={wallHeight} 
        visible={visibleWalls.right} 
        position={[width, 0, 0]} rotation={[0, -Math.PI / 2, 0]}
        attachments={layout.attachments?.filter(a => a.side === 'right') || []}
        onWallClick={onWallClick}
      />
      
      {/* Attachments */}
      {layout.attachments?.map(att => {
        if (!visibleWalls[att.side]) return null;
        return (
          <DraggableAttachment 
              key={att.id} 
              attachment={att} 
              isSelected={layout.selectedAttachmentId === att.id}
              onSelect={onSelectAttachment}
              onUpdate={onUpdateAttachment!}
              onDragChange={onDragChange}
              roomWidth={width}
              roomHeight={height}
          />
        );
      })}
    </group>
  );
};

const FurnitureBox: React.FC<{ item: FurnitureItem; isInvalid: boolean }> = ({ item, isInvalid }) => {
  let texture = null;
  if (item.imageUrl) {
     texture = useLoader(TextureLoader, item.imageUrl);
  }

  const width = item.rotation === 90 || item.rotation === 270 ? item.height : item.width;
  const depthLength = item.rotation === 90 || item.rotation === 270 ? item.width : item.height;
  const height = item.depth || 20;

  const posX = item.x + width / 2;
  const posZ = item.y + depthLength / 2;
  const posY = height / 2;

  return (
    <mesh position={[posX, posY, posZ]} castShadow receiveShadow>
      <boxGeometry args={[width, height, depthLength]} />
      {/* Materials ... simplified for brevity if needed, but keeping full assignment is better */}
       <meshStandardMaterial color={isInvalid ? "#ef4444" : (item.color || "#3b82f6")} map={texture} />
    </mesh>
  );
};

const SmartFurniture: React.FC<{ item: FurnitureItem; isInvalid: boolean }> = ({ item, isInvalid }) => {
    // 1. Procedural AI Furniture (Highest Priority)
    if (item.proceduralCode) {
        return (
            <GenerativeFurniture 
                item={item} 
                code={item.proceduralCode} 
                fallback={<FurnitureBox item={item} isInvalid={isInvalid} />} 
            />
        );
    }

    return <FurnitureBox item={item} isInvalid={isInvalid} />;
};

const ThreeScene: React.FC<ThreeSceneProps> = ({ layout, onClose, onAddAttachment, onUpdateAttachment, onDeleteAttachment, onSelectAttachment }) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, side: WallSide, wallX: number, wallY: number, screenX: number, screenY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const invalidItems = useMemo(() => checkValidity(layout.items, layout.room), [layout.items, layout.room]);

  const selectedAttachment = layout.attachments?.find(a => a.id === layout.selectedAttachmentId);

  const handlePointerMissed = (e: MouseEvent) => {
     setContextMenu(null);
     if (onSelectAttachment) onSelectAttachment(null);
  }

  const handleWallClick = (side: WallSide, point: Vector3, e: any) => {
    let wallX = 0;
    // World space point to Wall space
    // Room origin (0,0,0) corresponds to Back-Left corner visually in my new system?
    // Let's check grouping offset.
    // group position={[-layout.room.width / 2, 0, -layout.room.height / 2]}
    // So (0,0,0) IS the corner.
    
    if (side === 'back') wallX = point.x;
    else if (side === 'front') wallX = point.x;
    else if (side === 'left') wallX = point.z; // Left wall extends along Z
    else if (side === 'right') wallX = point.z; // Right wall extends along Z
    
    // Check bounds
    const limit = (side === 'back' || side === 'front') ? layout.room.width : layout.room.height;
    if (wallX < 0) wallX = 0;
    if (wallX > limit) wallX = limit;

    setContextMenu({
        side,
        wallX,
        wallY: point.y,
        x: point.x, // 3d point
        y: point.y,
        screenX: e.clientX,
        screenY: e.clientY
    });
  };

  const handleAddStart = (type: AttachmentType) => {
      if (!contextMenu || !onAddAttachment) return;
      const { side, wallX, wallY } = contextMenu;
      
      const width = type === 'door' ? 36 : type === 'window' ? 48 : 24;
      const height = type === 'door' ? 80 : type === 'window' ? 48 : 4;
      const finalY = type === 'door' ? 0 : Math.max(0, wallY - height/2); // Door always on floor
      
      onAddAttachment({
          id: Date.now().toString(),
          type,
          side,
          x: wallX - width/2,
          y: finalY,
          width,
          height,
          offsetFromWall: type === 'shelf' ? 12 : undefined
      });
      setContextMenu(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-white text-black p-2 rounded-full font-bold hover:bg-gray-200 transition-colors"
      >
        Close
      </button>

      {/* Property Panel for Selected Attachment */}
      {selectedAttachment && onUpdateAttachment && (
        <div 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur px-6 py-4 rounded-2xl shadow-2xl z-50 flex gap-6 items-center border border-gray-200"
            onPointerDown={(e) => e.stopPropagation()}
        >
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Width</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <Maximize2 size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.width} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { width: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>
           
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Height</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <ArrowUpFromLine size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.height} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { height: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>
           
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Elevation</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <Move size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.y} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { y: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>

           <div className="w-px h-10 bg-gray-200 mx-2"></div>
           
           <button 
             onClick={() => onDeleteAttachment && onDeleteAttachment(selectedAttachment.id)}
             className="flex flex-col items-center gap-1 text-red-500 hover:text-red-700 transition-colors"
           >
              <div className="p-2 bg-red-50 rounded-full hover:bg-red-100 transition-colors">
                 <X size={18} />
              </div>
              <span className="text-xs font-semibold">Delete</span>
           </button>
        </div>
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
          <div 
            className="absolute z-50 bg-white rounded-lg shadow-2xl p-2 flex flex-col gap-1 min-w-[150px] animate-in fade-in zoom-in-95 duration-100"
            style={{ 
                left: contextMenu.screenX, 
                top: contextMenu.screenY,
                transform: 'translate(10px, 10px)'
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
             <div className="text-xs font-bold text-gray-400 px-2 py-1 border-b mb-1 uppercase tracking-wider">Add Object</div>
             <button onClick={() => handleAddStart('window')} className="text-left px-3 py-2 hover:bg-blue-50 text-gray-800 rounded text-sm font-medium flex items-center justify-between group">
                Window <span className="opacity-0 group-hover:opacity-100 text-blue-500">→</span>
             </button>
             <button onClick={() => handleAddStart('door')} className="text-left px-3 py-2 hover:bg-blue-50 text-gray-800 rounded text-sm font-medium flex items-center justify-between group">
                Door <span className="opacity-0 group-hover:opacity-100 text-blue-500">→</span>
             </button>
             <button onClick={() => handleAddStart('shelf')} className="text-left px-3 py-2 hover:bg-blue-50 text-gray-800 rounded text-sm font-medium flex items-center justify-between group">
                Shelf <span className="opacity-0 group-hover:opacity-100 text-blue-500">→</span>
             </button>
             <div className="border-t my-1"></div>
             <button onClick={() => setContextMenu(null)} className="text-left px-3 py-1 hover:bg-red-50 text-red-600 rounded text-xs font-medium">
                Cancel
             </button>
          </div>
      )}
      
      {/* Property Panel for Selected Attachment */}
      {selectedAttachment && onUpdateAttachment && (
        <div 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur px-6 py-4 rounded-2xl shadow-2xl z-50 flex gap-6 items-center border border-gray-200"
            onPointerDown={(e) => e.stopPropagation()}
        >
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Width</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <Maximize2 size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.width} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { width: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>
           
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Height</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <ArrowUpFromLine size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.height} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { height: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>
           
           <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Elevation</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                 <Move size={16} className="text-gray-400" />
                 <input 
                    type="number" 
                    value={selectedAttachment.y} 
                    onChange={(e) => onUpdateAttachment(selectedAttachment.id, { y: Number(e.target.value) })}
                    className="w-16 bg-transparent text-sm font-semibold outline-none"
                 />
                 <span className="text-xs text-gray-400">"</span>
              </div>
           </div>

           <div className="w-px h-10 bg-gray-200 mx-2"></div>
           
           <button 
             onClick={() => onDeleteAttachment && onDeleteAttachment(selectedAttachment.id)}
             className="flex flex-col items-center gap-1 text-red-500 hover:text-red-700 transition-colors"
           >
              <div className="p-2 bg-red-50 rounded-full hover:bg-red-100 transition-colors">
                 <X size={18} />
              </div>
              <span className="text-xs font-semibold">Delete</span>
           </button>
        </div>
      )}
      
      <div className="w-full h-full">
        <Canvas 
          shadows 
          camera={{ position: [100, 100, 100], fov: 45 }}
          onPointerMissed={handlePointerMissed}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <directionalLight 
                position={[50, 100, 50]} 
                intensity={1} 
                castShadow 
                shadow-mapSize={[1024, 1024]}
            />
            
            <group position={[-layout.room.width / 2, 0, -layout.room.height / 2]}>
                <RoomFloor width={layout.room.width} height={layout.room.height} />
                <DynamicRoomWalls 
                    width={layout.room.width} 
                    height={layout.room.height} 
                    layout={layout}
                    onWallClick={handleWallClick}
                    onSelectAttachment={onSelectAttachment!}
                    onUpdateAttachment={onUpdateAttachment}
                    onDragChange={setIsDragging}
                />
                
                {layout.items.map(item => (
                    <SmartFurniture key={item.id} item={item} isInvalid={invalidItems.has(item.id)} />
                ))}
            </group>

            <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={200} blur={2.5} far={4} />
            <Environment preset="city" />
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} enabled={!isDragging} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
};

export default ThreeScene;
