"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { serializeLayout } from "../utils/serialization";
import { LayoutState } from "../types";

export default function LandingPage() {
  const router = useRouter();
  const [width, setWidth] = useState(108); // 9 ft
  const [height, setHeight] = useState(132); // 11 ft

  const handleStart = () => {
    const layout: LayoutState = {
      room: { width, height },
      items: [],
      selectedItemId: null,
    };
    const serialized = serializeLayout(layout);
    router.push(`/editor?layout=${serialized}`);
  };

  const loadDemo = () => {
     // Create a demo layout with some items
     const layout: LayoutState = {
        room: { width: 108, height: 132 },
        items: [
            { id: "demo-bed", type: "bed", width: 60, height: 80, x: 10, y: 10, rotation: 0 }, // Queen
            { id: "demo-desk", type: "desk", width: 24, height: 48, x: 80, y: 10, rotation: 90 },
        ],
        selectedItemId: null
     };
     const serialized = serializeLayout(layout);
     router.push(`/editor?layout=${serialized}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">Packer</h1>
        <p className="text-gray-600 mb-8 text-lg">Test-fit your furniture before you sign the lease.</p>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (inches)</label>
                <input 
                type="number" 
                value={width} 
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (inches)</label>
                <input 
                type="number" 
                value={height} 
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
            </div>
          </div>
          
          <button 
            onClick={handleStart}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Start Layout
          </button>

           <div className="pt-6 border-t border-gray-100 text-center">
             <p className="text-sm text-gray-500 mb-3">Not sure? Try a preset:</p>
             <button 
               onClick={loadDemo}
               className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
             >
               NYC Bedroom (9' x 11')
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
