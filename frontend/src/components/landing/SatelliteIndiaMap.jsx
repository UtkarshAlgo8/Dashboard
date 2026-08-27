import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Box, Button } from "@mui/material";
import MapPlantMarker from "./MapPlantMarker.jsx";

// Explicitly register the worker URL so Vite production bundles emit and load the worker script
setWorkerUrl(maplibreWorkerUrl);

// Initial India view coordinates
const INITIAL_CENTER = [78.5, 21.8];
const INITIAL_ZOOM = 4.1;

/**
 * Satellite Earth Map of India using MapLibre GL
 * Features:
 * - Real satellite tile layer (Esri World Imagery)
 * - 3D Cinematic camera with dynamic pitch & bearing on plant zoom
 * - Atmospheric dark vignette overlay for command-center depth
 * - Scalable MUI Location Pin icons via React Component MapPlantMarker
 * - Smooth GPU-accelerated flyTo camera movements
 * - Jitter-free hover interaction using container-level mouse tracking
 * - Padded viewport so India remains fully visible on the left side
 */
function SatelliteIndiaMap({
  plants = [],
  hov = null,
  sel = null,
  onHover,
  onLeave,
  onSelect,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerEntriesRef = useRef([]); // stores { plant, root, marker }
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapZoom, setMapZoom] = useState(INITIAL_ZOOM);

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Esri Satellite",
            maxzoom: 19,
          },
          "india-boundary": {
            type: "geojson",
            data: "/india-boundary.geojson",
          },
        },
        layers: [
          {
            id: "satellite-layer",
            type: "raster",
            source: "esri-satellite",
            minzoom: 0,
            maxzoom: 19,
          },
          // Ambient Outer Cyan/White Glow (Subtle and slim)
          {
            id: "india-border-glow-outer",
            type: "line",
            source: "india-boundary",
            paint: {
              "line-color": "#38BDF8",
              "line-width": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 8],
              "line-opacity": 0.4,
              "line-blur": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 6, 5],
            },
          },
          // Mid Glow Halo
          {
            id: "india-border-glow-mid",
            type: "line",
            source: "india-boundary",
            paint: {
              "line-color": "#F0F9FF",
              "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.2, 6, 4],
              "line-opacity": 0.75,
              "line-blur": 1.0,
            },
          },
          // Crisp Core White National Boundary (Slim & sharp)
          {
            id: "india-border-core",
            type: "line",
            source: "india-boundary",
            paint: {
              "line-color": "#FFFFFF",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                1.2,
                6,
                2.0,
              ],
              "line-opacity": 0.95,
            },
          },
        ],
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      maxPitch: 70,
      minZoom: 3.2,
      maxZoom: 16,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.on("load", () => {
      setMapLoaded(true);
      map.resize();
    });

    map.on("zoom", () => {
      setMapZoom(map.getZoom());
    });

    // Reset view if user clicks empty map background
    map.on("click", () => {
      if (onLeave) onLeave();
    });

    mapRef.current = map;

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      markerEntriesRef.current.forEach(({ root, marker }) => {
        if (marker) marker.remove();
        if (root) root.unmount();
      });
      markerEntriesRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [onLeave]);

  // 2. Initialize markers when map loads or plant data changes. Hover state
  // is applied by the next effect so marker roots are not rebuilt on hover.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !Array.isArray(plants) || plants.length === 0)
      return;

    // Remove previous markers and roots
    markerEntriesRef.current.forEach(({ root, marker }) => {
      if (marker) marker.remove();
      if (root) root.unmount();
    });
    markerEntriesRef.current = [];

    const newEntries = [];

    plants.forEach((plant) => {
      if (!plant.lng || !plant.lat) return;

      const isFocused = hov === plant.id || sel === plant.id;
      const isCardVisible = isFocused || mapZoom >= 5.8;

      const el = document.createElement("div");
      const root = createRoot(el);
      // Render content immediately on initial creation
      root.render(
        <MapPlantMarker
          plant={plant}
          isFocused={isFocused}
          isCardVisible={isCardVisible}
          onClick={() => onSelect && onSelect(plant.id)}
          onMouseEnter={() => onHover && onHover(plant.id)}
        />,
      );

      const marker = new MapLibreMarker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([plant.lng, plant.lat])
        .addTo(map);

      newEntries.push({ plant, root, marker });
    });

    markerEntriesRef.current = newEntries;
  }, [mapLoaded, plants, onHover, onSelect]);

  // 3. Update Marker Props (isFocused, isCardVisible) without re-creating roots
  useEffect(() => {
    markerEntriesRef.current.forEach(({ plant, root, marker }) => {
      const isFocused = hov === plant.id || sel === plant.id;
      const isCardVisible = isFocused || mapZoom >= 5.8;
      if (marker && marker.getElement()) {
        marker.getElement().style.zIndex = isFocused
          ? "50"
          : isCardVisible
            ? "10"
            : "1";
      }
      root.render(
        <MapPlantMarker
          plant={plant}
          isFocused={isFocused}
          isCardVisible={isCardVisible}
          onClick={() => onSelect && onSelect(plant.id)}
          onMouseEnter={() => onHover && onHover(plant.id)}
        />,
      );
    });
  }, [hov, sel, mapZoom, onHover, onSelect]);

  // 4. Zoom around the hovered plant instead of centering it. Keeping the
  // geographic point under its current screen position prevents the marker
  // from leaving the pointer during the camera animation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const isDesktop = window.innerWidth >= 900;
    const padding = isDesktop
      ? { right: 540, left: 40, top: 40, bottom: 40 }
      : { right: 20, left: 20, top: 20, bottom: 20 };

    const targetId = sel || hov;
    if (targetId) {
      const plant = plants.find((p) => p.id === targetId);
      if (plant && plant.lng && plant.lat) {
        map.stop();
        map.easeTo({
          around: [plant.lng, plant.lat],
          zoom: 8.2,
          pitch: 28,
          bearing: -8,
          duration: 900,
          essential: true,
        });
        return;
      }
    }

    // Default overview centered on India (flat 2D nationwide view)
    map.flyTo({
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      speed: 1.0,
      curve: 1.25,
      padding: padding,
      essential: true,
    });
  }, [hov, sel, mapLoaded, plants]);

  return (
    <Box
      onMouseLeave={() => {
        if (onLeave) onLeave();
      }}
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        borderRadius: "inherit",
        overflow: "hidden",
        "& .maplibregl-canvas": {
          outline: "none",
        },
      }}
    >
      {/* WebGL Satellite Map Container */}
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Atmospheric Vignette & Depth Glow (Deep space border shading) */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          background:
            "radial-gradient(ellipse at 35% 50%, rgba(11, 19, 43, 0) 30%, rgba(11, 19, 43, 0.45) 75%, rgba(11, 19, 43, 0.85) 100%)",
          boxShadow: "inset 0 0 80px rgba(5, 10, 25, 0.8)",
        }}
      />

      {/* Floating Overview Reset Button on Map */}
      {(hov || sel) && (
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            if (onLeave) onLeave();
          }}
          sx={{
            position: "absolute",
            bottom: 24,
            left: 24,
            zIndex: 10,
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: 600,
            textTransform: "none",
            borderRadius: "8px",
            px: 1.6,
            py: 0.7,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            "&:hover": {
              backgroundColor: "rgba(30, 41, 59, 0.95)",
            },
          }}
        >
          ↺ Reset to India View
        </Button>
      )}
    </Box>
  );
}

export default SatelliteIndiaMap;
