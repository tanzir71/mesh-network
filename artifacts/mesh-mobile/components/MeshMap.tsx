import React, { useMemo } from "react";
import { View } from "react-native";
import WebView from "react-native-webview";
import type { Post } from "@/context/MeshContext";
import type { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #0a0a0f; }
    .leaflet-tile-pane {
      filter: invert(1) hue-rotate(200deg) brightness(0.8) contrast(0.85) saturate(0.7);
    }
    .leaflet-control-attribution { font-size: 9px; background: rgba(10,10,15,0.7) !important; color: #555 !important; }
    .leaflet-control-attribution a { color: #555 !important; }
    .leaflet-popup-content-wrapper {
      background: #12121e;
      color: #e0e0f0;
      border: 1px solid rgba(0,200,255,0.25);
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.7);
      padding: 0;
    }
    .leaflet-popup-content { margin: 12px 14px; }
    .leaflet-popup-tip { background: #12121e; }
    .leaflet-popup-close-button { color: #555 !important; top: 8px !important; right: 10px !important; }
    .pu-author { font-weight: 700; color: #00c8ff; font-size: 12px; margin-bottom: 5px; font-family: system-ui; }
    .pu-own { color: #22c55e; }
    .pu-text { font-size: 14px; line-height: 1.5; color: #e0e0f0; font-family: system-ui; word-break: break-word; }
    .pu-time { font-size: 11px; color: #555; margin-top: 6px; font-family: system-ui; }
    .pu-coords { font-size: 10px; color: #00c8ff55; margin-top: 2px; font-family: monospace; }
    .you-label { font-weight: 700; color: #22c55e; font-family: system-ui; font-size: 13px; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
(function() {
  var posts = __POSTS__;
  var myId = '__MY_ID__';

  function rel(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d/60000) + 'm ago';
    if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
    if (d < 604800000) return Math.floor(d/86400000) + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var geotagged = posts.filter(function(p){ return p.lat !== null && p.lng !== null; });

  var center = [37.7749, -122.4194];
  var zoom = 12;
  if (geotagged.length > 0) {
    center = [geotagged[0].lat, geotagged[0].lng];
    zoom = 14;
  }

  var map = L.map('map', { zoomControl: true }).setView(center, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  geotagged.forEach(function(post) {
    var isMe = post.authorId === myId;
    var color = isMe ? '#22c55e' : '#00c8ff';
    var marker = L.circleMarker([post.lat, post.lng], {
      radius: 10,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map);

    marker.bindPopup(
      '<div class="pu-author' + (isMe ? ' pu-own' : '') + '">' + esc(isMe ? 'You ('+post.authorName+')' : post.authorName) + '</div>' +
      '<div class="pu-text">' + esc(post.text) + '</div>' +
      '<div class="pu-time">' + rel(post.timestamp) + '</div>' +
      '<div class="pu-coords">' + post.lat.toFixed(5) + ', ' + post.lng.toFixed(5) + '</div>',
      { maxWidth: 240, minWidth: 160 }
    );
  });

  if (geotagged.length > 1) {
    try {
      var bounds = L.latLngBounds(geotagged.map(function(p){ return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    } catch(e) {}
  }

  map.locate({ watch: false });
  map.on('locationfound', function(e) {
    L.circleMarker(e.latlng, {
      radius: 7,
      fillColor: '#22c55e',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.95
    }).addTo(map).bindPopup('<div class="you-label">You are here</div>', { maxWidth: 120 });
  });
})();
</script>
</body>
</html>`;

export default function MeshMap({
  posts,
  colors,
  myId,
}: {
  posts: Post[];
  colors: Colors;
  myId: string;
}) {
  const html = useMemo(() => {
    const safe = JSON.stringify(posts);
    return LEAFLET_HTML.replace("__POSTS__", safe).replace("__MY_ID__", myId);
  }, [posts, myId]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0f" }}>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: "#0a0a0f" }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        originWhitelist={["*"]}
      />
    </View>
  );
}
