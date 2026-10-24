"use client";

import { useEffect, useRef } from "react";
import { mountGame } from "@/lib/game/engine";

// Hosts the canvas game. The engine owns its DOM inside this element.
export function RoadsterGame() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    return mountGame(root.current);
  }, []);
  return <div ref={root} className="rg-root" />;
}
