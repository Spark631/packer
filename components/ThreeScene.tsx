"use client";

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, Environment, ContactShadows } from "@react-three/drei";
import { LayoutState, FurnitureItem } from "../types";
import { TextureLoader } from "three";
import { useLoader } from "@react-three/fiber";

interface ThreeSceneProps {
  layout: LayoutState;
  onClose: () => void;
}

const RoomFloor: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  // width/height in inches
  // Three.js units: let's scale so 1 inch = 0.1 units to keep numbers manageable, 
  // OR just use 1 unit = 1 inch if we zoom camera out.
  // Let's use 1 unit = 1 inch for simplicity matching the 2D logic.
  
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#d6d3d1" roughness={0.8} metalness={0.2} />
    </mesh>
  );
};

const RoomWalls: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const wallHeight = 96; // 8ft standard ceiling height
  const wallThickness = 6;

  return (
    <group>
      {/* Back Wall (along Width) */}
      <mesh position={[width / 2, wallHeight / 2, -wallThickness / 2]} receiveShadow castShadow>
        <boxGeometry args={[width + wallThickness * 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {/* Left Wall (along Height) */}
      <mesh position={[-wallThickness / 2, wallHeight / 2, height / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, wallHeight, height]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      
      {/* Floor Platform Base */}
      <mesh position={[width / 2, -4, height / 2]}>
         <boxGeometry args={[width + wallThickness, 8, height + wallThickness]} />
         <meshStandardMaterial color="#a8a29e" />
      </mesh>
    </group>
  );
};

const FurnitureBox: React.FC<{ item: FurnitureItem }> = ({ item }) => {
  // Texture loading if image exists
  let texture = null;
  if (item.imageUrl) {
     texture = useLoader(TextureLoader, item.imageUrl);
  }

  // Position:
  // 2D: x, y is top-left corner.
  // Three.js Box: position is center.
  // Also 2D Y is 3D Z.
  // Item center X = item.x + item.width/2
  // Item center Z = item.y + item.height/2
  
  const width = item.rotation === 90 || item.rotation === 270 ? item.height : item.width;
  const depthLength = item.rotation === 90 || item.rotation === 270 ? item.width : item.height;
  const height = item.depth || 20; // Default height if missing

  const posX = item.x + width / 2;
  const posZ = item.y + depthLength / 2;
  const posY = height / 2;

  return (
    <mesh position={[posX, posY, posZ]} castShadow receiveShadow>
      <boxGeometry args={[width, height, depthLength]} />
      {texture ? (
        // Map texture to top face (index 2 or 3 depending on orientation)
        // Material array: Right, Left, Top, Bottom, Front, Back
        <>
           <meshStandardMaterial attach="material-0" color={item.color || "#3b82f6"} />
           <meshStandardMaterial attach="material-1" color={item.color || "#3b82f6"} />
           <meshStandardMaterial attach="material-2" map={texture} />
           <meshStandardMaterial attach="material-3" color={item.color || "#3b82f6"} />
           <meshStandardMaterial attach="material-4" color={item.color || "#3b82f6"} />
           <meshStandardMaterial attach="material-5" color={item.color || "#3b82f6"} />
        </>
      ) : (
        <meshStandardMaterial color={item.color || "#3b82f6"} />
      )}
    </mesh>
  );
};

const ThreeScene: React.FC<ThreeSceneProps> = ({ layout, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-white text-black p-2 rounded-full font-bold hover:bg-gray-200 transition-colors"
      >
        Close
      </button>
      
      <div className="w-full h-full">
        <Canvas shadows camera={{ position: [100, 100, 100], fov: 45 }}>
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
                <RoomWalls width={layout.room.width} height={layout.room.height} />
                
                {layout.items.map(item => (
                    <FurnitureBox key={item.id} item={item} />
                ))}
            </group>

            <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={200} blur={2.5} far={4} />
            <Environment preset="city" />
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
};

export default ThreeScene;

