"use client";

import dynamic from "next/dynamic";
import { LayoutState } from "../../types";

const LayoutEditor = dynamic(() => import("../../components/LayoutEditor"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Editor...</div>,
});

const defaultLayout: LayoutState = {
  room: { width: 120, height: 144 }, // Default 10x12
  items: [],
  attachments: [],
  selectedItemId: null,
};

export default function EditorPage() {
  return (
    <main className="min-h-screen bg-white">
      <LayoutEditor initialState={defaultLayout} />
    </main>
  );
}

