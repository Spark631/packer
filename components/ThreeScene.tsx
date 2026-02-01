"use client";

import React, { Suspense, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stage, Environment, ContactShadows } from "@react-three/drei";
import { LayoutState, FurnitureItem } from "../types";
import { TextureLoader, MathUtils } from "three";
import { useLoader } from "@react-three/fiber";

interface ThreeSceneProps {
  layout: LayoutState;
  onClose: () => void;
}

const RoomFloor: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]} receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#d6d3d1" roughness={0.8} metalness={0.2} />
    </mesh>
  );
};

const DynamicRoomWalls: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const wallHeight = 96;
  const wallThickness = 6;
  const [visibleWalls, setVisibleWalls] = useState<{
    back: boolean;
    front: boolean;
    left: boolean;
    right: boolean;
  }>({ back: true, front: false, left: true, right: false });

  // Determine wall visibility based on camera azimuth
  useFrame((state) => {
    // Get azimuth angle in degrees (0 to 360)
    // Azimuth is angle around Y axis.
    // Three.js camera position:
    // x, z determines the quadrant.
    // Room center is at [width/2, 0, height/2].
    // Let's get vector from Room Center to Camera.
    
    const cx = state.camera.position.x;
    const cz = state.camera.position.z;
    
    // Relative to room center (which is at origin of our group? No, group is offset)
    // The group in ThreeScene is position={[-layout.room.width / 2, 0, -layout.room.height / 2]}
    // So the Room (0,0) is at world (-W/2, -H/2).
    // The Room Center (W/2, H/2) is at world (0,0).
    // So camera position (cx, cz) is directly relative to room center!
    
    // Determine Quadrant:
    // Q1: (+X, +Z) -> Front-Right view -> Show Back (Far Z) & Left (Far X) walls?
    // Wait:
    // -Z is Back. +Z is Front.
    // -X is Left. +X is Right.
    //
    // If camera is at (+X, +Z) (Front-Right), we look towards (-X, -Z).
    // We see the Back Wall (at -Z end) and Left Wall (at -X end). CORRECT.
    //
    // If camera is at (-X, +Z) (Front-Left), we look towards (+X, -Z).
    // We see Back Wall (-Z) and Right Wall (+X).
    //
    // If camera is at (-X, -Z) (Back-Left), we look towards (+X, +Z).
    // We see Front Wall (+Z) and Right Wall (+X).
    //
    // If camera is at (+X, -Z) (Back-Right), we look towards (-X, +Z).
    // We see Front Wall (+Z) and Left Wall (-X).
    
    const isFront = cz > 0;
    const isRight = cx > 0;
    
    // We want to show the walls that are "behind" the room from our perspective.
    // If we are at Front (+Z), we show Back (-Z) wall.
    // If we are at Back (-Z), we show Front (+Z) wall.
    // If we are at Right (+X), we show Left (-X) wall.
    // If we are at Left (-X), we show Right (+X) wall.
    
    setVisibleWalls({
        back: isFront, // Show Back wall if we are in Front
        front: !isFront, // Show Front wall if we are in Back
        left: isRight, // Show Left wall if we are Right
        right: !isRight, // Show Right wall if we are Left
    });
  });

  return (
    <group>
      {/* Back Wall (at Z=0, extending along X) */}
      <mesh 
        visible={visibleWalls.back}
        position={[width / 2, wallHeight / 2, -wallThickness / 2]} 
        receiveShadow 
        castShadow
      >
        <boxGeometry args={[width + wallThickness * 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {/* Front Wall (at Z=height, extending along X) */}
      <mesh 
        visible={visibleWalls.front}
        position={[width / 2, wallHeight / 2, height + wallThickness / 2]} 
        receiveShadow 
        castShadow
      >
        <boxGeometry args={[width + wallThickness * 2, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {/* Left Wall (at X=0, extending along Z) */}
      <mesh 
        visible={visibleWalls.left}
        position={[-wallThickness / 2, wallHeight / 2, height / 2]} 
        receiveShadow 
        castShadow
      >
        <boxGeometry args={[wallThickness, wallHeight, height]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>

      {/* Right Wall (at X=width, extending along Z) */}
      <mesh 
        visible={visibleWalls.right}
        position={[width + wallThickness / 2, wallHeight / 2, height / 2]} 
        receiveShadow 
        castShadow
      >
        <boxGeometry args={[wallThickness, wallHeight, height]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      
      {/* Floor Platform Base (Always Visible) */}
      <mesh position={[width / 2, -4, height / 2]}>
         <boxGeometry args={[width + wallThickness, 8, height + wallThickness]} />
         <meshStandardMaterial color="#a8a29e" />
      </mesh>
    </group>
  );
};

const FurnitureBox: React.FC<{ item: FurnitureItem }> = ({ item }) => {
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
      {texture ? (
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
            
            {/* Center the room at world origin (0,0,0) so rotation logic works */}
            <group position={[-layout.room.width / 2, 0, -layout.room.height / 2]}>
                <RoomFloor width={layout.room.width} height={layout.room.height} />
                <DynamicRoomWalls width={layout.room.width} height={layout.room.height} />
                
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
