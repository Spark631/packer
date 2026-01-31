"use client";

import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Group, Text } from "react-konva";
import useImage from "use-image";
import { FurnitureItem } from "../types";
import { Camera, Ruler, Check, X, BoxSelect } from "lucide-react";

interface ImageModelCreatorProps {
  onClose: () => void;
  onSave: (item: FurnitureItem) => void;
}

type Step = "upload" | "calibrate" | "crop" | "preview";

const ImageModelCreator: React.FC<ImageModelCreatorProps> = ({ onClose, onSave }) => {
  const [step, setStep] = useState<Step>("upload");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [image] = useImage(imageSrc || "");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  
  // Calibration State
  const [refPoints, setRefPoints] = useState<{ x: number; y: number }[]>([]); // 2 points
  const [refLength, setRefLength] = useState<number>(8.5); // Default inches (Letter paper)

  // Crop/Bounds State
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Resize stage to fit container
  useEffect(() => {
    if (containerRef.current && step !== "upload") {
      setStageSize({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
      });
    }
  }, [step, containerRef.current?.offsetWidth, containerRef.current?.offsetHeight]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setStep("calibrate");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getScale = () => {
    if (!image || stageSize.width === 0) return 1;
    const scaleX = stageSize.width / image.width;
    const scaleY = stageSize.height / image.height;
    return Math.min(scaleX, scaleY, 1); // Fit within stage, don't upscale
  };

  const scale = getScale();
  const imageX = (stageSize.width - (image?.width || 0) * scale) / 2;
  const imageY = (stageSize.height - (image?.height || 0) * scale) / 2;

  // --- Calibration Logic ---
  const handleStageClick = (e: any) => {
    if (step !== "calibrate") return;
    const { x, y } = e.target.getStage().getPointerPosition();
    
    // In calibrate mode, we place 2 points
    if (refPoints.length < 2) {
      setRefPoints([...refPoints, { x, y }]);
    } else {
        // Reset if clicking again? Or maybe just drag points (simpler: click to reset)
        // For MVP simplicity: click 3rd time resets
        setRefPoints([{ x, y }]);
    }
  };

  // --- Crop/Bounds Logic ---
  const handleMouseDown = (e: any) => {
    if (step !== "crop") return;
    const { x, y } = e.target.getStage().getPointerPosition();
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCropRect({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: any) => {
    if (step !== "crop" || !isDrawing || !startPoint) return;
    const { x, y } = e.target.getStage().getPointerPosition();
    setCropRect({
      x: Math.min(x, startPoint.x),
      y: Math.min(y, startPoint.y),
      width: Math.abs(x - startPoint.x),
      height: Math.abs(y - startPoint.y),
    });
  };

  const handleMouseUp = () => {
    if (step !== "crop") return;
    setIsDrawing(false);
  };

  // --- Calculations ---
  const calculatePixelsPerInch = () => {
    if (refPoints.length !== 2) return 0;
    const dx = refPoints[1].x - refPoints[0].x;
    const dy = refPoints[1].y - refPoints[0].y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance / refLength;
  };

  const handleSave = () => {
    if (!cropRect || !imageSrc) return;

    const ppi = calculatePixelsPerInch();
    if (ppi === 0) return;

    // Real world dimensions
    const widthInInches = cropRect.width / ppi;
    const heightInInches = cropRect.height / ppi;

    // Create a cropped version of the image for the final item
    // We can do this using a temporary canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx || !image) return;

    // Coordinates relative to the displayed image
    // Need to reverse the stage scaling and centering
    const relativeCropX = (cropRect.x - imageX) / scale;
    const relativeCropY = (cropRect.y - imageY) / scale;
    const relativeCropW = cropRect.width / scale;
    const relativeCropH = cropRect.height / scale;

    canvas.width = relativeCropW;
    canvas.height = relativeCropH;
    
    ctx.drawImage(
        image,
        relativeCropX, relativeCropY, relativeCropW, relativeCropH, // Source
        0, 0, relativeCropW, relativeCropH // Dest
    );

    const croppedDataUrl = canvas.toDataURL();

    const newItem: FurnitureItem = {
      id: Date.now().toString(),
      type: "custom",
      width: Math.round(widthInInches),
      height: Math.round(heightInInches),
      x: 0, // Will be centered in room by parent
      y: 0,
      rotation: 0,
      imageUrl: croppedDataUrl
    };

    onSave(newItem);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Camera size={24} className="text-blue-600" />
            <span>Create from Photo</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative bg-gray-900 flex flex-col" ref={containerRef}>
          
          {step === "upload" && (
            <div className="flex-1 flex flex-col items-center justify-center text-white p-8">
              <div className="bg-gray-800 p-8 rounded-full mb-6">
                 <Camera size={64} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Upload a Photo</h3>
              <p className="text-gray-400 mb-8 text-center max-w-md">
                Take a top-down photo of your furniture. Include a reference object (like a piece of paper) for accurate sizing.
              </p>
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105">
                <span>Select Photo</span>
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          )}

          {(step === "calibrate" || step === "crop") && imageSrc && (
            <Stage
              width={stageSize.width}
              height={stageSize.height}
              onMouseDown={step === "crop" ? handleMouseDown : handleStageClick}
              onMouseMove={step === "crop" ? handleMouseMove : undefined}
              onMouseUp={step === "crop" ? handleMouseUp : undefined}
              onTouchStart={step === "crop" ? handleMouseDown : handleStageClick}
              onTouchMove={step === "crop" ? handleMouseMove : undefined}
              onTouchEnd={step === "crop" ? handleMouseUp : undefined}
            >
              <Layer>
                {/* Background Image */}
                {image && (
                  <KonvaImage
                    image={image}
                    x={imageX}
                    y={imageY}
                    width={image.width * scale}
                    height={image.height * scale}
                  />
                )}

                {/* Calibration UI */}
                {step === "calibrate" && (
                   <Group>
                      {refPoints.map((p, i) => (
                        <Circle key={i} x={p.x} y={p.y} radius={6} fill="#ef4444" stroke="white" strokeWidth={2} />
                      ))}
                      {refPoints.length === 2 && (
                         <Line
                           points={[refPoints[0].x, refPoints[0].y, refPoints[1].x, refPoints[1].y]}
                           stroke="#ef4444"
                           strokeWidth={2}
                           dash={[10, 5]}
                         />
                      )}
                   </Group>
                )}

                {/* Crop UI */}
                {step === "crop" && cropRect && (
                   <Group>
                      <Rect
                        x={cropRect.x}
                        y={cropRect.y}
                        width={cropRect.width}
                        height={cropRect.height}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="rgba(59, 130, 246, 0.2)"
                      />
                      {/* Show dimensions text if calibrated */}
                      {refPoints.length === 2 && (
                         <Text
                           x={cropRect.x}
                           y={cropRect.y - 25}
                           text={`${Math.round(cropRect.width / calculatePixelsPerInch())}" x ${Math.round(cropRect.height / calculatePixelsPerInch())}"`}
                           fontSize={16}
                           fill="white"
                           padding={4}
                           background="black" // Note: Konva Text doesn't support bg directly like this, usually needs a Rect behind. Simplified here or use label.
                         />
                      )}
                   </Group>
                )}
              </Layer>
            </Stage>
          )}

        </div>

        {/* Footer / Controls */}
        <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center">
          
          <div className="flex gap-2">
             {/* Progress Indicators */}
             <div className={`h-2 w-8 rounded-full ${step === "upload" ? "bg-blue-600" : "bg-gray-200"}`}></div>
             <div className={`h-2 w-8 rounded-full ${step === "calibrate" ? "bg-blue-600" : "bg-gray-200"}`}></div>
             <div className={`h-2 w-8 rounded-full ${step === "crop" ? "bg-blue-600" : "bg-gray-200"}`}></div>
          </div>

          <div className="flex gap-4 items-center">
            {step === "calibrate" && (
                <>
                  <div className="flex items-center gap-2 mr-4">
                     <span className="text-sm font-medium text-gray-700">Reference Size:</span>
                     <input 
                       type="number" 
                       value={refLength}
                       onChange={(e) => setRefLength(Number(e.target.value))}
                       className="w-20 p-2 border rounded text-center"
                     />
                     <span className="text-sm text-gray-500">inches</span>
                  </div>
                  <p className="text-sm text-gray-500 mr-4">Click two points to define this length</p>
                  <button 
                    disabled={refPoints.length !== 2}
                    onClick={() => setStep("crop")}
                    className="flex items-center gap-2 bg-blue-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Next <Ruler size={18} />
                  </button>
                </>
            )}

            {step === "crop" && (
                <>
                 <p className="text-sm text-gray-500 mr-4">Drag a box around the furniture item</p>
                 <button 
                    onClick={() => setStep("calibrate")}
                    className="text-gray-500 hover:text-gray-800 font-medium px-4"
                  >
                    Back
                  </button>
                  <button 
                    disabled={!cropRect || cropRect.width === 0}
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-green-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Finish <Check size={18} />
                  </button>
                </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModelCreator;

