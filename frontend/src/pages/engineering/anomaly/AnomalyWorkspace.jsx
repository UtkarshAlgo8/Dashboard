import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import useAnomalyNavigation from "@/hooks/useAnomalyNavigation.js";
import { AnomalyContext } from "@/hooks/useAnomaly.js";
import { DEFAULT_TREND_TAGS, NAV_ITEMS } from "@/lib/anomaly/constants.js";
import { equipmentAt, formatTime } from "@/lib/anomaly/model.js";
import AnomalyTimeline from "./AnomalyTimeline.jsx";
import AnomalyHome from "./AnomalyHome.jsx";
import SensorHealth from "./SensorHealth.jsx";
import AnomalyTrends from "./AnomalyTrends.jsx";
import FailureGraph from "./FailureGraph.jsx";
import Diagnoses from "./Diagnoses.jsx";
import HierarchyCoverage from "./HierarchyCoverage.jsx";
import SubEquipment from "./SubEquipment.jsx";
import AnomalyDrawer from "./AnomalyDrawer.jsx";

function WorkspaceSidebar({ model, nav, mode, onToggleTheme, close }) {
  const counts = {
    sensors: model.tagIds.length,
    graph: Object.keys(model.modes).length,
    diagnoses: model.episodes.length,
    hierarchy: model.hierarchy.length,
  };
  const go = (view, id) => {
    nav.go(view, id);
    close?.();
  };
  return (
    <Stack
      sx={{
        height: "100%",
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 2, py: 1.75 }}
      >
        <Box>
          <Typography
            fontWeight={700}
            sx={{ fontSize: 14, letterSpacing: "0.12em" }}
          >
            NERVE
          </Typography>
          <Typography
            sx={{
              font: "10px 'Geist Mono', monospace",
              color: "text.secondary",
            }}
          >
            PLANTBRAIN · ALGO8
          </Typography>
        </Box>
        {close && (
          <IconButton onClick={close} aria-label="Close workspace navigation">
            <CloseIcon />
          </IconButton>
        )}
      </Stack>
      <Divider />
      <List
        component="nav"
        aria-label="Anomaly workspace navigation"
        disablePadding
        sx={{ flex: 1, overflowY: "auto", py: 1 }}
      >
        {NAV_ITEMS.map(([id, label]) => (
          <ListItemButton
            key={id}
            selected={nav.view === id}
            onClick={() => go(id)}
            aria-current={nav.view === id ? "page" : undefined}
            sx={{
              px: 2,
              py: 0.75,
              "&.Mui-selected": {
                bgcolor: (t) => t.custom.anomaly.accentWash,
                boxShadow: (t) => `inset 2px 0 ${t.palette.primary.main}`,
              },
            }}
          >
            <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
              {label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {counts[id]}
            </Typography>
          </ListItemButton>
        ))}
        <Typography
          sx={{
            px: 2,
            pt: 2,
            pb: 0.5,
            fontSize: 10,
            color: "text.secondary",
            fontWeight: 600,
          }}
        >
          Sub-equipment
        </Typography>
        {model.equipmentIds.map((id) => {
          const now = equipmentAt(model, id, nav.time);
          return (
            <ListItemButton
              key={id}
              selected={nav.view === "sub" && nav.sub === id}
              onClick={() => go("sub", id)}
              aria-label={`${id} ${model.equipment[id].short}`}
              aria-current={
                nav.view === "sub" && nav.sub === id ? "page" : undefined
              }
              sx={{
                px: 2,
                py: 0.6,
                gap: 0.75,
                "&.Mui-selected": {
                  bgcolor: (t) => t.custom.anomaly.accentWash,
                },
              }}
            >
              <Typography sx={{ font: "10px 'Geist Mono', monospace" }}>
                {id}
              </Typography>
              <Typography
                sx={{
                  flex: 1,
                  fontSize: 11,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
                title={model.equipment[id].name}
              >
                {model.equipment[id].short}
              </Typography>
              <CircleOutlinedIcon
                titleAccess={now.band}
                sx={{ fontSize: 11, color: (t) => t.custom.anomaly[now.band] }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Button variant="outlined" fullWidth onClick={onToggleTheme}>
          {mode === "dark" ? "Slate theme" : "Control room theme"}
        </Button>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1, fontSize: 10 }}
        >
          Read-only demo · PLC export
          <br />
          L: latest available · Esc: close detail
        </Typography>
      </Box>
    </Stack>
  );
}

export default function AnomalyWorkspace({ model, mode, onToggleTheme }) {
  const nav = useAnomalyNavigation(model);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trendTags, setTrendTags] = useState(() =>
    DEFAULT_TREND_TAGS.filter((tag) => model.tags[tag]),
  );
  const title =
    nav.view === "sub"
      ? `${nav.sub} · ${model.equipment[nav.sub].name}`
      : (NAV_ITEMS.find(([id]) => id === nav.view)?.[1] ?? "Home");
  return (
    <AnomalyContext.Provider value={{ model, nav, trendTags, setTrendTags }}>
      <Box
        className="anomaly-workspace"
        role="region"
        aria-label="CTP Anomaly Detection workspace"
        onKeyDown={(event) => {
          if (
            event.target.closest(
              "input,textarea,select,[role=combobox],[contenteditable=true]",
            )
          )
            return;
          if (event.key === "l" || event.key === "L") {
            event.preventDefault();
            nav.latest();
          }
          if (event.key === "Escape" && !nav.modeId && !nav.tagId && nav.custom)
            nav.setPreset("all");
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "208px minmax(0, 1fr)",
          },
          bgcolor: "background.default",
          color: "text.primary",
          fontFamily: "Geist, system-ui, sans-serif",
        }}
      >
        <Box
          component="aside"
          sx={{ display: { xs: "none", md: "block" }, minHeight: 0 }}
        >
          <WorkspaceSidebar
            model={model}
            nav={nav}
            mode={mode}
            onToggleTheme={onToggleTheme}
          />
        </Box>
        <Box
          component="main"
          id="anomaly-main"
          sx={{ overflowY: "auto", minWidth: 0 }}
          key={nav.view === "sub" ? nav.sub : nav.view}
        >
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              bgcolor: "background.default",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              gap={1.5}
              sx={{
                px: { xs: 2, md: 3 },
                minHeight: 48,
                py: 1,
                flexWrap: "wrap",
              }}
            >
              <IconButton
                onClick={() => setMobileOpen(true)}
                aria-label="Open workspace navigation"
                sx={{ display: { md: "none" } }}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                component="h2"
                sx={{
                  fontSize: 20,
                  fontWeight: 600,
                  minWidth: 0,
                  flex: { xs: 1, lg: "none" },
                }}
              >
                {title}
              </Typography>
              <Typography
                sx={{
                  display: { xs: "none", lg: "block" },
                  font: "10px 'Geist Mono', monospace",
                  color: "text.secondary",
                }}
              >
                {model.source.asset}
              </Typography>
              <Chip
                label={model.source.label}
                size="small"
                variant="outlined"
                sx={{ ml: { md: "auto" }, borderStyle: "dashed" }}
              />
            </Stack>
            <AnomalyTimeline />
          </Box>
          <Box sx={{ p: { xs: 2, md: 3 }, pt: 2, maxWidth: 1920, pb: 8 }}>
            {model.source.stale && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Data may be stale. Latest source update:{" "}
                {formatTime(model.source.asOf)} IST.
              </Alert>
            )}
            {nav.view === "home" && <AnomalyHome />}
            {nav.view === "sub" && <SubEquipment key={nav.sub} />}
            {nav.view === "sensors" && <SensorHealth />}
            {nav.view === "trends" && <AnomalyTrends />}
            {nav.view === "graph" && <FailureGraph />}
            {nav.view === "diagnoses" && <Diagnoses />}
            {nav.view === "hierarchy" && <HierarchyCoverage />}
          </Box>
        </Box>
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          slotProps={{ paper: { sx: { width: 250, maxWidth: "90vw" } } }}
        >
          <WorkspaceSidebar
            model={model}
            nav={nav}
            mode={mode}
            onToggleTheme={onToggleTheme}
            close={() => setMobileOpen(false)}
          />
        </Drawer>
        <AnomalyDrawer />
      </Box>
    </AnomalyContext.Provider>
  );
}
