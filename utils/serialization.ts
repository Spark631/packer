import { LayoutState } from "../types";
import pako from "pako";

function uint8ToBase64(u8Arr: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32768
  let index = 0;
  let length = u8Arr.length;
  let result = '';
  let slice;
  while (index < length) {
    slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length));
    result += String.fromCharCode.apply(null, slice as unknown as number[]);
    index += CHUNK_SIZE;
  }
  return btoa(result);
}

function base64ToUint8(b64: string): Uint8Array {
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

export function serializeLayout(layout: LayoutState): string {
  // We only save room and items, not selection state
  const data = {
    id: layout.id,
    name: layout.name,
    lastModified: layout.lastModified,
    room: layout.room,
    items: layout.items.map(item => ({
        id: item.id,
        type: item.type,
        width: item.width,
        height: item.height,
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        color: item.color,
        imageUrl: item.imageUrl,
        proceduralCode: item.proceduralCode,
        depth: item.depth
    })),
    attachments: layout.attachments
  };

  try {
      const json = JSON.stringify(data);
      
      // Use pako (gzip) compression
      const compressed = pako.deflate(json);
      const base64 = uint8ToBase64(compressed);
      return "gz:" + base64;

  } catch (e) {
      console.error("Failed to serialize layout", e);
      return "";
  }
}

export function deserializeLayout(encoded: string): LayoutState | null {
  try {
    let json = "";

    // Check for compressed format
    if (encoded.startsWith("gz:")) {
        const base64 = encoded.substring(3);
        const compressed = base64ToUint8(base64);
        json = pako.inflate(compressed, { to: 'string' });
    } else {
        // Try safe decoding (Unicode support)
        try {
            const binStr = atob(encoded);
            json = decodeURIComponent(binStr.split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) {
            // Fallback: legacy decoding
            const binStr = atob(encoded);
            json = binStr;
        }
    }

    const data = JSON.parse(json);
    
    // Basic validation (optional but good practice)
    if (!data.room || !data.items) return null;

    return {
        id: data.id,
        name: data.name,
        lastModified: data.lastModified,
        room: data.room,
        items: data.items,
        attachments: data.attachments || [],
        selectedItemId: null
    };
  } catch (e) {
    console.error("Failed to parse layout from URL", e);
    return null;
  }
}

