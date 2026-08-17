import { NextRequest, NextResponse } from 'next/server';
import { FurnitureAnalysis, PlacedPart, normalizeParts } from './geometry';

type Provider = 'gemini' | 'openai';

// ===========================================
// STEP 1: Analysis Prompt (Image -> JSON)
// ===========================================
function getAnalysisPrompt(userPrompt?: string): string {
  return `You are an expert at analyzing furniture images. Your task is to examine the provided image and output a detailed JSON description of the furniture's structure.

CRITICAL: Return ONLY valid JSON. No markdown, no backticks, no explanation.

Analyze the image carefully and identify EVERY distinct structural part. Look closely at:
- The main surface (tabletop, seat, etc.)
- Support structures (legs, pedestals, columns)
- Base structures (cross bases, star bases, flat bases, feet)
- Connecting elements (crossbars, stretchers, supports)
- Additional features (armrests, backrests, cushions, drawers)

COORDINATE SYSTEM (follow this exactly - this is the most common source of errors):
The furniture occupies a unit bounding box. The origin (0,0,0) is at the CENTER OF THE FOOTPRINT, ON THE FLOOR.
- x: LEFT to RIGHT.  Ranges from -0.5 (left edge) to +0.5 (right edge). Center = 0.
- y: FLOOR to TOP.   Ranges from 0 (floor) to 1 (top of furniture). NOT centered.
- z: BACK to FRONT.  Ranges from -0.5 (back edge) to +0.5 (front edge). Center = 0.
"position" is the CENTER POINT of the part, not its corner.
A part of height h sitting on the floor has position.y = h/2, NOT 0.
A part flush with the front face has position.z = 0.5 - (its depth / 2).

For each part, specify:
- shape: "box" for rectangular parts, "cylinder" for round/tubular parts, "sphere" for round parts
- proportions: relative size as a fraction of the full furniture dimension (0-1)
  - For BOX shapes: width, height, depth are the 3 dimensions
  - For CYLINDER shapes: width = diameter, height = length of cylinder, depth = diameter (same as width)
- position: center point of the part, in the coordinate system above
- rotation: in radians (for angled parts)

JSON Schema:
{
  "furnitureType": "string describing what this is",
  "parts": [
    {
      "name": "descriptive name",
      "shape": "box" | "cylinder" | "sphere",
      "proportions": { "width": 0-1, "height": 0-1, "depth": 0-1 },
      "position": { "x": number, "y": number, "z": number },
      "rotation": { "x": number, "y": number, "z": number },
      "count": number (optional),
      "mirror": "x" | "z" (optional),
      "curved": boolean (optional - true if the part is curved/arched),
      "curveDirection": "x" | "y" | "z" (required if curved - axis the curve bends along),
      "curveAngle": number (required if curved - total arc angle in radians),
      "segments": number (optional - how many segments, default 4)
    }
  ]
}

CRITICAL RULES:
1. All values must be plain numbers. NO Math.PI or JavaScript expressions.
   - 90° = 1.5708, 45° = 0.7854, 180° = 3.1416
2. Position y=0 is floor level. Parts stack upward from there.
3. Be EXHAUSTIVE - list every visible structural element separately.
4. EVERY PART MUST TOUCH ANOTHER PART. The result must be one connected solid,
   never floating pieces with gaps between them. Before emitting each part, check that
   its box overlaps or is flush against the box of the part it attaches to.
5. The assembly must FILL the unit box: some part must reach x=-0.5, some x=+0.5,
   some z=-0.5, some z=+0.5, and some part must reach y=1.

ATTACHING A FACE PANEL (drawer fronts, doors, cabinet panels):
These are the parts most often left floating. A face panel is NOT a separate slab out in
front of the body - it is FLUSH WITH or SLIGHTLY INSET INTO the body's front face.
Given a carcass centered at z=0 with depth D, and a panel of depth t (t is small, ~0.02-0.05):
  panel.position.z = (D / 2) - (t / 2)     <- flush with the front face
The panel's width must be <= the carcass width, and it must sit within the carcass's
y-range. Handles/pulls attach the same way to the panel's own front face.

STACKED REPEATED PARTS (multiple drawers, shelves, slats):
Do NOT use "count"/"mirror" for parts stacked vertically - mirroring reflects position
across the origin and will fling them apart. "mirror" is ONLY for parts that are genuinely
symmetric about the center (a pair of legs, two armrests).
For stacked parts, emit each one as its OWN entry with its own position.y.

EXAMPLE - two-drawer dresser (note every part touches, and the fronts are flush):
{
  "furnitureType": "two drawer dresser",
  "parts": [
    { "name": "carcass", "shape": "box", "proportions": { "width": 1, "height": 0.92, "depth": 0.9 }, "position": { "x": 0, "y": 0.5, "z": 0 } },
    { "name": "top panel", "shape": "box", "proportions": { "width": 1, "height": 0.04, "depth": 0.95 }, "position": { "x": 0, "y": 0.98, "z": 0 } },
    { "name": "upper drawer front", "shape": "box", "proportions": { "width": 0.94, "height": 0.4, "depth": 0.03 }, "position": { "x": 0, "y": 0.73, "z": 0.435 } },
    { "name": "lower drawer front", "shape": "box", "proportions": { "width": 0.94, "height": 0.4, "depth": 0.03 }, "position": { "x": 0, "y": 0.31, "z": 0.435 } },
    { "name": "upper drawer pull", "shape": "box", "proportions": { "width": 0.16, "height": 0.03, "depth": 0.02 }, "position": { "x": 0, "y": 0.73, "z": 0.46 } },
    { "name": "lower drawer pull", "shape": "box", "proportions": { "width": 0.16, "height": 0.03, "depth": 0.02 }, "position": { "x": 0, "y": 0.31, "z": 0.46 } }
  ]
}

COMMON FURNITURE BASES (identify correctly):
- X-base / Cross base: 4 legs extending outward in X pattern - use count:4 with rotation
- Star base: 5 legs radiating from center - use count:5
- 4-leg base: 4 vertical legs at corners - use count:4 with positions at corners
- Pedestal: single central column
- Flat base: solid rectangular or circular base

CURVED PARTS (armrests, arched backs, curved legs):
Use "curved" ONLY for parts with a visible, pronounced bend. A flat panel that merely
looks angled is NOT curved - give it a "rotation" instead. A wrongly-curved part is far
more damaging than a wrongly-flat one.
- curved: true
- curveDirection: which plane the part bows in. The arc stays CENTERED on "position".
  - "y" = the part spans its WIDTH (x) and bows forward/back in z.
          Use for a backrest or seat that wraps around the sitter. THIS IS THE COMMON ONE.
  - "x" = the part spans its WIDTH (x) and bows up/down in y.
          Use for an arched rail or a bowed crossbar.
  - "z" = the part spans its DEPTH (z) and bows up/down in y.
          Use for an armrest curving down from front to back, or a dished seat.
- curveAngle: total bend angle in radians. Keep it SMALL for gentle curves:
  0.3 = a subtle bow, 0.785 = 45°, 1.57 = a quarter circle. A plywood chair back is
  usually 0.3-0.6, never more than 1.0.
- segments: optional, defaults to 4

EXAMPLE curved armrest (spans depth, curving down front to back):
{ "name": "armrest", "shape": "box", "proportions": { "width": 0.06, "height": 0.04, "depth": 0.35 },
  "position": { "x": 0.45, "y": 0.55, "z": 0.05 }, "curved": true, "curveDirection": "z",
  "curveAngle": 0.6, "segments": 4, "count": 2, "mirror": "x" }

EXAMPLE - side chair with a gently curved back panel and thin metal legs.
Note the back posts: they physically bridge the seat and the backrest, so nothing floats.
{
  "furnitureType": "side chair with curved wood back",
  "parts": [
    { "name": "seat", "shape": "box", "proportions": { "width": 0.9, "height": 0.06, "depth": 0.85 }, "position": { "x": 0, "y": 0.45, "z": 0.05 } },
    { "name": "front leg", "shape": "cylinder", "proportions": { "width": 0.05, "height": 0.45, "depth": 0.05 }, "position": { "x": 0.4, "y": 0.225, "z": 0.4 }, "count": 2, "mirror": "x" },
    { "name": "rear leg", "shape": "cylinder", "proportions": { "width": 0.05, "height": 0.45, "depth": 0.05 }, "position": { "x": 0.4, "y": 0.225, "z": -0.35 }, "count": 2, "mirror": "x" },
    { "name": "back post", "shape": "box", "proportions": { "width": 0.04, "height": 0.5, "depth": 0.05 }, "position": { "x": 0.4, "y": 0.7, "z": -0.35 }, "count": 2, "mirror": "x" },
    { "name": "back panel", "shape": "box", "proportions": { "width": 0.82, "height": 0.34, "depth": 0.04 }, "position": { "x": 0, "y": 0.82, "z": -0.33 }, "curved": true, "curveDirection": "y", "curveAngle": 0.4, "segments": 5 }
  ]
}

EXAMPLE for a table with X-shaped cross base:
{
  "furnitureType": "round pedestal table with cross base",
  "parts": [
    { "name": "tabletop", "shape": "cylinder", "proportions": { "width": 1, "height": 0.04, "depth": 1 }, "position": { "x": 0, "y": 0.95, "z": 0 } },
    { "name": "central column", "shape": "cylinder", "proportions": { "width": 0.08, "height": 0.7, "depth": 0.08 }, "position": { "x": 0, "y": 0.5, "z": 0 } },
    { "name": "cross base leg", "shape": "box", "proportions": { "width": 0.6, "height": 0.03, "depth": 0.06 }, "position": { "x": 0, "y": 0.02, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 } },
    { "name": "cross base leg perpendicular", "shape": "box", "proportions": { "width": 0.06, "height": 0.03, "depth": 0.6 }, "position": { "x": 0, "y": 0.02, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 } }
  ]
}

${userPrompt ? `User's description: "${userPrompt}"` : ""}`;
}

// ===========================================
// STEP 2: Deterministic Code Generation (JSON -> Code)
// ===========================================

// Generate a single mesh JSX string
function generateMeshCode(
  shape: string,
  geoArgs: string,
  position: string,
  rotation: string,
  keyStr: string
): string {
  const geometryTag = shape === 'cylinder' ? 'cylinderGeometry' : 
                      shape === 'sphere' ? 'sphereGeometry' : 'boxGeometry';
  
  return `      <mesh key="${keyStr}" position={[${position}]} rotation={[${rotation}]}>
        <${geometryTag} args={[${geoArgs}]} />
        <meshStandardMaterial color={color} />
      </mesh>`;
}

// Generate code for a single part. Curves have already been reduced to straight
// segments by normalizeParts, so every part reaching here is a plain rotated box.
function generatePartCode(part: PlacedPart, index: number): string {
  const { width: pw, height: ph, depth: pd } = part.proportions;
  const { x: px, y: py, z: pz } = part.position;
  const rot = part.rotation;
  const partName = part.name.replace(/\s+/g, '_');

  const position = `${px.toFixed(3)} * width, ${py.toFixed(3)} * height, ${pz.toFixed(3)} * depth`;
  const rotation = `${rot.x.toFixed(3)}, ${rot.y.toFixed(3)}, ${rot.z.toFixed(3)}`;

  let geoArgs: string;
  if (part.shape === 'cylinder') {
    // cylinderGeometry: radiusTop, radiusBottom, height, radialSegments
    geoArgs = `${(pw / 2).toFixed(3)} * width, ${(pw / 2).toFixed(3)} * width, ${ph.toFixed(3)} * height, 16`;
  } else if (part.shape === 'sphere') {
    geoArgs = `${(pw / 2).toFixed(3)} * width, 16, 16`;
  } else {
    geoArgs = `${pw.toFixed(3)} * width, ${ph.toFixed(3)} * height, ${pd.toFixed(3)} * depth`;
  }
  
  return generateMeshCode(part.shape, geoArgs, position, rotation, `${partName}-${index}`);
}

// Main function: Generate complete React component code from analysis
function generateCodeFromAnalysis(analysis: FurnitureAnalysis): string {
  const parts = normalizeParts(analysis.parts);

  if (parts.length === 0) {
    throw new Error('Analysis contained no usable furniture parts');
  }

  const meshCode = parts.map(generatePartCode);

  const componentName = analysis.furnitureType
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
  
  return `export default function ${componentName || 'GeneratedFurniture'}({ width, height, depth, color }) {
  return (
    <group>
${meshCode.join('\n')}
    </group>
  );
}`;
}

// Clean up response if wrapped in markdown or JSON blocks
function cleanupResponse(text: string): string {
  return text
    .replace(/```json/g, '')
    .replace(/```jsx/g, '')
    .replace(/```tsx/g, '')
    .replace(/```javascript/g, '')
    .replace(/```/g, '')
    .trim();
}

// ===========================================
// STEP 1: Analyze Image Functions
// ===========================================

// Analyze with Google Gemini
async function analyzeWithGemini(image: string, userPrompt?: string): Promise<FurnitureAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: getAnalysisPrompt(userPrompt) },
    {
      inline_data: {
        mime_type: "image/png",
        data: image
      }
    }
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini API Error');
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No analysis returned from Gemini");
  }

  const cleanedText = cleanupResponse(text);
  try {
    return JSON.parse(cleanedText) as FurnitureAnalysis;
  } catch {
    console.error('Failed to parse Gemini analysis. Raw response:', cleanedText);
    throw new Error('Gemini returned invalid JSON. Check server logs for details.');
  }
}

// Analyze with OpenAI GPT-4o
async function analyzeWithOpenAI(image: string, userPrompt?: string): Promise<FurnitureAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const url = 'https://api.openai.com/v1/chat/completions';

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: getAnalysisPrompt(userPrompt) },
    { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } }
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 2048,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API Error');
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("No analysis returned from OpenAI");
  }

  const cleanedText = cleanupResponse(text);
  try {
    return JSON.parse(cleanedText) as FurnitureAnalysis;
  } catch {
    console.error('Failed to parse OpenAI analysis. Raw response:', cleanedText);
    throw new Error('OpenAI returned invalid JSON. Check server logs for details.');
  }
}


// ===========================================
// Helper to select provider
// ===========================================
function getActiveProvider(): { provider: Provider; hasKey: boolean } {
  const configuredProvider: Provider = (process.env.AI_PROVIDER as Provider) || 'gemini';
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

  // Use configured provider if key exists, otherwise fallback
  if (configuredProvider === 'openai' && hasOpenAIKey) {
    return { provider: 'openai', hasKey: true };
  } else if (configuredProvider === 'gemini' && hasGeminiKey) {
    return { provider: 'gemini', hasKey: true };
  } else if (hasOpenAIKey) {
    return { provider: 'openai', hasKey: true };
  } else if (hasGeminiKey) {
    return { provider: 'gemini', hasKey: true };
  }
  return { provider: configuredProvider, hasKey: false };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'Image is required for 3D model generation' }, { status: 400 });
    }

    const { provider, hasKey } = getActiveProvider();

    // Mock response if no API keys
    if (!hasKey) {
      console.warn("No API keys found, using mock response.");
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
}`;
      return NextResponse.json({ code: mockCode });
    }

    console.log(`Using ${provider.toUpperCase()} for image analysis`);

    // ===========================================
    // STEP 1: Analyze the image
    // ===========================================
    console.log('Step 1: Analyzing image...');
    let analysis: FurnitureAnalysis;

    if (provider === 'openai') {
      analysis = await analyzeWithOpenAI(image, prompt);
    } else {
      analysis = await analyzeWithGemini(image, prompt);
    }

    // Log analysis for debugging
    console.log('Analysis result:', JSON.stringify(analysis, null, 2));

    // Validate analysis has parts
    if (!analysis.parts || analysis.parts.length === 0) {
      throw new Error('Analysis returned no furniture parts');
    }

    // ===========================================
    // STEP 2: Generate code from analysis (deterministic)
    // ===========================================
    console.log('Step 2: Generating code from analysis...');
    const code = generateCodeFromAnalysis(analysis);
    console.log('Generated code:', code);

    return NextResponse.json({ code, analysis });

  } catch (error: unknown) {
    console.error('AI Generation Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate model';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
