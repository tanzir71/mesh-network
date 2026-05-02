/**
 * Web-only map component.
 * Metro resolves MeshMap.native.tsx for iOS/Android and this file for web.
 * Since this only ever runs in a browser we can use DOM APIs freely.
 */
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { Post } from "@/context/MeshContext";
import type { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

// ---------- Leaflet lazy-loader ----------
let _loaded = false;
let _loading = false;
const _queue: Array<() => void> = [];

function loadLeaflet(cb: () => void): void {
  if (_loaded) { cb(); return; }
  _queue.push(cb);
  if (_loading) return;
  _loading = true;

  // Leaflet CSS
  const link = (document as any).createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  (document as any).head.appendChild(link);

  // Dark-theme overrides
  const style = (document as any).createElement("style");
  style.textContent = [
    ".leaflet-tile-pane{filter:invert(1) hue-rotate(200deg) brightness(.8) contrast(.85)}",
    ".leaflet-popup-content-wrapper{background:#12121e;color:#e0e0f0;border:1px solid rgba(0,200,255,.22);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.7)}",
    ".leaflet-popup-content{margin:12px 14px}",
    ".leaflet-popup-tip{background:#12121e}",
    ".leaflet-popup-close-button{color:#666!important;top:8px!important;right:10px!important}",
    ".leaflet-control-attribution{font-size:9px!important;background:rgba(10,10,15,.6)!important;color:#555!important}",
    ".leaflet-control-attribution a{color:#555!important}",
    ".leaflet-zoom-box{background:rgba(0,200,255,.08);border:1px solid #00c8ff}",
  ].join("");
  (document as any).head.appendChild(style);

  // Leaflet JS
  const script = (document as any).createElement("script");
  script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  script.onload = () => {
    _loaded = true;
    _loading = false;
    _queue.forEach((fn) => fn());
    _queue.length = 0;
  };
  (document as any).head.appendChild(script);
}

// ---------- helpers ----------
function rel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- component ----------
export default function MeshMap({
  posts,
  myId,
}: {
  posts: Post[];
  colors: Colors; // kept in signature for compat with native
  myId: string;
}) {
  const viewRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    loadLeaflet(() => {
      const L = (window as any).L;
      // React Native Web exposes the real DOM node via ref on <View>
      const el = viewRef.current;
      if (!el || mapRef.current) return;

      const geo = posts.filter((p) => p.lat !== null && p.lng !== null);
      const lat = geo.length > 0 ? geo[0].lat! : 37.7749;
      const lng = geo.length > 0 ? geo[0].lng! : -122.4194;

      const map = L.map(el).setView([lat, lng], geo.length > 0 ? 14 : 12);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      geo.forEach((post) => {
        const isMe = post.authorId === myId;
        const color = isMe ? "#22c55e" : "#00c8ff";
        const marker = L.circleMarker([post.lat, post.lng], {
          radius: 10,
          fillColor: color,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        const name = esc(isMe ? `You (${post.authorName})` : post.authorName);
        marker.bindPopup(
          `<div style="font-weight:700;color:${color};font-size:12px;font-family:system-ui;margin-bottom:5px">${name}</div>` +
            `<div style="font-size:14px;line-height:1.5;color:#e0e0f0;font-family:system-ui">${esc(post.text)}</div>` +
            `<div style="font-size:11px;color:#555;margin-top:5px;font-family:system-ui">${rel(post.timestamp)}</div>` +
            `<div style="font-size:10px;color:rgba(0,200,255,.4);font-family:monospace;margin-top:2px">${post.lat!.toFixed(5)}, ${post.lng!.toFixed(5)}</div>`,
          { maxWidth: 240, minWidth: 150 }
        );
      });

      if (geo.length > 1) {
        try {
          map.fitBounds(
            L.latLngBounds(geo.map((p: Post) => [p.lat, p.lng])),
            { padding: [48, 48], maxZoom: 15 }
          );
        } catch {}
      }

      // Locate user
      map.locate({ watch: false, enableHighAccuracy: true });
      map.on("locationfound", (e: any) => {
        L.circleMarker(e.latlng, {
          radius: 8,
          fillColor: "#22c55e",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindPopup(
            `<div style="font-weight:700;color:#22c55e;font-family:system-ui">You are here</div>`,
            { maxWidth: 120 }
          );
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // intentionally only runs on mount — map handles its own post updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View ref={viewRef} style={StyleSheet.absoluteFill} />;
}
