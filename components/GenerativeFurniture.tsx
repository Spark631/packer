"use client";

import React, { useMemo, Suspense } from "react";
import * as THREE from "three";
import * as Drei from "@react-three/drei";
import { transform } from "sucrase";
import { FurnitureItem } from "../types";

// Error Boundary for the generative component
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      console.warn("Generative Component Error:", this.state.error);
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface GenerativeFurnitureProps {
  item: FurnitureItem;
  code: string;
  fallback: React.ReactNode;
}

export const GenerativeFurniture: React.FC<GenerativeFurnitureProps> = ({
  item,
  code,
  fallback,
}) => {
  // Use React.useMemo to compile the component only when code changes
  const Component = useMemo(() => {
    try {
      // Create a function that returns the component
      // We inject React, THREE, and Drei into the scope
      const scope = {
        React,
        ...THREE,
        ...Drei,
      };

      // Simple regex to remove 'export default' or 'export' keywords 
      // as we just want the function body/definition to return
      // Ideally the AI returns "return function MyComponent(props) { ... }" or similar.
      // But usually AI returns "export default function...".
      // We will wrap it in a closure.
      
      // Clean up the code to make it executable as a function body
      // We assume the AI returns a functional component definition.
      // We'll construct a new Function that returns this component.
      
      // Strategy:
      // 1. Remove imports (we provide them)
      // 2. Remove 'export default'
      // 3. Transpile JSX -> JS using sucrase
      // 4. Eval the rest to get the function
      
      let cleanCode = code
        .replace(/import .*?;/g, "")
        .replace(/export default /g, "return ")
        .replace(/export /g, "");

      // Transpile JSX to JS
      const transpiled = transform(cleanCode, {
        transforms: ["jsx", "typescript"],
        production: true,
      }).code;

      // Create the factory function
      // It takes our scope keys as arguments
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      
      // The function body returns the React component
      const factory = new Function(...keys, transpiled);
      
      // Execute factory to get the Component
      const GeneratedComponent = factory(...values);
      
      return GeneratedComponent;
    } catch (err) {
      console.error("Failed to compile generative code:", err);
      return null;
    }
  }, [code]);

  if (!Component) return <>{fallback}</>;

  // Calculate dimensions for props
  // Handle rotation swapping width/depth logic in the Parent, 
  // but usually props are passed as the raw item dimensions
  // and the component handles local geometry.
  // We'll pass standard props: width, height, depth, color
  
  const props = {
    width: item.width,
    height: item.depth || 20, // Visual height (y-axis)
    depth: item.height, // Z-axis depth
    color: item.color || "#3b82f6",
  };

  const posX = item.x + item.width / 2;
  const posZ = item.y + item.height / 2;

  return (
    <group position={[posX, 0, posZ]} rotation={[0, -Math.PI / 2 * (item.rotation / 90), 0]}>
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={null}>
          <Component {...props} />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
};

