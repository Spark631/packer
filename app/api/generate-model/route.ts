import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, image } = await req.json();

    if (!prompt && !image) {
      return NextResponse.json({ error: 'Prompt or image is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    // Fallback to mock if no key is present (dev mode)
    if (!apiKey) {
      console.warn("No GEMINI_API_KEY found, using mock response.");
      const mockCode = `
      export default function GeneratedFurniture({ width, height, depth, color }) {
        return (
          <group>
            <mesh position={[0, height/2, 0]}>
              <boxGeometry args={[width, height, depth]} />
              <meshStandardMaterial color={color || "orange"} />
            </mesh>
          </group>
        );
      }
      `;
      return NextResponse.json({ code: mockCode });
    }

    // Call Google Gemini API
    // Using gemini-1.5-flash for multimodal support
    const model = 'gemini-2.5-flash'; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const parts = [];
    
    // Add text prompt
    parts.push({
        text: `You are an expert 3D React Developer using React Three Fiber.
        Your task is to generate a functional React component that renders a 3D model.
        ${image ? "First, analyze the provided image of a furniture item. Describe its shape, structure, and distinct features in detail. Then," : ""}
        Generate a React component that renders this 3D model using standard Three.js geometries.
        
        RULES:
        1. Return ONLY the code for the component. No markdown, no backticks, no explanation.
        2. The component must be the default export.
        3. It must accept props: { width, height, depth, color }.
        4. Use ONLY standard geometries: boxGeometry, cylinderGeometry, sphereGeometry, etc. Combine them to match the shape.
        5. Use meshStandardMaterial.
        6. Center the object so its bottom sits at y=0.
        7. Ensure the object fits roughly within the provided width/height/depth props.
        ${prompt ? `Additional instructions: ${prompt}` : ""}
        `
    });

    // Add image data if present
    if (image) {
        parts.push({
            inline_data: {
                mime_type: "image/png",
                data: image
            }
        });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }]
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini API Error');
    }

    let code = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!code) {
        throw new Error("No code returned from Gemini");
    }
    
    // Cleanup code if the LLM wrapped it in markdown
    code = code.replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');

    return NextResponse.json({ code });

  } catch (error: any) {
    console.error('AI Generation Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to generate model' }, { status: 500 });
  }
}
