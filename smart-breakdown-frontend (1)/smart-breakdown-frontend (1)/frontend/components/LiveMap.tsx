"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "you" | "mech" | "incident" | "small";
  color?: string;
  label?: string;
  title?: string;
  selected?: boolean;
  onClick?: () => void;
}

export interface LiveMapProps {
  markers: MapMarker[];
  route?: [number, number][];
  accuracy?: { lat: number; lng: number; radius: number };
  lines?: { id: string; positions: [number, number][]; color: string; weight?: number; dash?: string; label?: string }[];
  circles?: { id: string; lat: number; lng: number; radius: number; color: string; label?: string }[];
  fitTo?: { lat: number; lng: number }[];
  interactive?: boolean;
  padding?: number;
  ariaLabel: string;
}

const Inner = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ width: "100%", height: "100%", borderRadius: 0 }} />,
});

/** OpenStreetMap via Leaflet. `height` is the box height; overlays go in `children`. */
export function LiveMap({ height, radius = 18, children, className, ...props }: LiveMapProps & { height: number | string; radius?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={`map ${className ?? ""}`} style={{ height, borderRadius: radius }} role="region" aria-label={props.ariaLabel}>
      <Inner {...props} />
      {children}
    </div>
  );
}
