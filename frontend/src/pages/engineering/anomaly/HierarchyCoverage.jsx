import { useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  List,
  ListItemButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import useAnomaly from "@/hooks/useAnomaly.js";
import { VISIBILITY } from "@/lib/anomaly/constants.js";
import { equipmentAt } from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  EvidenceCallout,
  HealthBadge,
  TagLink,
} from "./AnomalyParts.jsx";

export default function HierarchyCoverage() {
  const { model, nav } = useAnomaly();
  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState(null);
  const detailRef = useRef(null);
  const all = model.hierarchy.flatMap((assembly) =>
    assembly.subs.map((sub) => ({
      ...sub,
      assembly: assembly.name,
      section: assembly.section,
    })),
  );
  const counts = {};
  all.forEach((sub) => {
    counts[sub.status] = (counts[sub.status] ?? 0) + 1;
  });
  const chosen = selection
    ? all.find(
        (sub) => sub.assembly === selection[0] && sub.name === selection[1],
      )
    : null;
  const gaps = all.filter(
    (sub) =>
      sub.status !== "plc_iu" ||
      sub.review.length ||
      sub.plc.some((tag) => tag.dead),
  );
  const choose = (sub, scroll = false) => {
    setSelection([sub.assembly, sub.name]);
    if (scroll)
      detailRef.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
  };
  const why = (sub) =>
    sub.status === "none"
      ? "No PLC tag and no vibration point"
      : sub.status === "dead"
        ? "All PLC tags stopped streaming"
        : sub.status === "iu"
          ? "Vibration only: no process (PLC) signal"
          : sub.status === "plc"
            ? "Process only: no vibration signal"
            : "Partly seen; review required";
  return (
    <>
      <EvidenceCallout>
        Quintoplex plant hierarchy: {model.hierarchy.length} assemblies →{" "}
        {all.length} sub-assemblies →{" "}
        {all.reduce((sum, sub) => sum + sub.components.length, 0)} components,
        from {model.plantRows.toLocaleString()} plant-list rows. Blind equipment
        is Unknown, never Normal.
      </EvidenceCallout>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        {Object.entries(VISIBILITY).map(([id, label]) => (
          <AnomalyPanel key={id} sx={{ mb: 0 }}>
            <Chip size="small" label={label} variant="outlined" />
            <Typography
              sx={{ my: 0.5, font: "600 28px 'Geist Mono', monospace" }}
            >
              {counts[id] ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              sub-assemblies
            </Typography>
          </AnomalyPanel>
        ))}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(420px, 1.05fr) 1fr" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <AnomalyPanel
          title="Tree"
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filter}
              onChange={(_, value) => {
                if (value) setFilter(value);
              }}
              aria-label="Hierarchy visibility filter"
            >
              {[
                ["all", "All"],
                ["seen", "With signal"],
                ["gap", "Gaps only"],
              ].map(([id, label]) => (
                <ToggleButton
                  key={id}
                  value={id}
                  sx={{ fontSize: 10, py: 0.25 }}
                >
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          }
        >
          <Box sx={{ maxHeight: "70vh", overflowY: "auto" }}>
            {model.hierarchy.map((assembly) => {
              const subs = assembly.subs.filter(
                (sub) =>
                  filter === "all" ||
                  (filter === "seen"
                    ? sub.status !== "none"
                    : gaps.some(
                        (gap) =>
                          gap.assembly === assembly.name &&
                          gap.name === sub.name,
                      )),
              );
              if (!subs.length) return null;
              return (
                <Accordion
                  key={`${filter}-${assembly.name}`}
                  defaultExpanded={filter !== "all"}
                  disableGutters
                  elevation={0}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    mb: 0.75,
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ minHeight: 38, px: 1.25 }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      gap={1}
                      alignItems="center"
                      sx={{ width: "100%", pr: 1 }}
                    >
                      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                        {assembly.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {
                          assembly.subs.filter((sub) => sub.status !== "none")
                            .length
                        }
                        /{assembly.subs.length} seen
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    <List disablePadding>
                      {subs.map((sub) => (
                        <ListItemButton
                          key={sub.name}
                          selected={
                            chosen?.assembly === assembly.name &&
                            chosen?.name === sub.name
                          }
                          onClick={() =>
                            choose({ ...sub, assembly: assembly.name })
                          }
                          sx={{ px: 1.5, py: 0.75, gap: 1 }}
                        >
                          <Typography sx={{ flex: 1, fontSize: 12 }}>
                            {sub.name}
                            {sub.review.length ? " · review" : ""}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={VISIBILITY[sub.status]}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        </AnomalyPanel>
        <Box ref={detailRef} sx={{ position: { lg: "sticky" }, top: 16 }}>
          <AnomalyPanel title="Detail">
            {!chosen ? (
              <Typography variant="body2" color="text.secondary">
                Select a sub-assembly.
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary">
                  {chosen.section} › {chosen.assembly}
                </Typography>
                <Typography
                  component="h3"
                  fontWeight={600}
                  sx={{ fontSize: 18, mb: 1 }}
                >
                  {chosen.name}
                </Typography>
                <Chip
                  label={VISIBILITY[chosen.status]}
                  size="small"
                  variant="outlined"
                />
                {chosen.review.length > 0 && (
                  <EvidenceCallout>
                    <b>Confirm with plant.</b> {chosen.review.join("; ")}
                  </EvidenceCallout>
                )}
                <Typography
                  component="h4"
                  sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}
                >
                  Health
                </Typography>
                {chosen.scored_se.length ? (
                  chosen.scored_se.map((id) => (
                    <Stack
                      key={id}
                      direction="row"
                      alignItems="center"
                      gap={1}
                      flexWrap="wrap"
                      sx={{ mt: 0.5 }}
                    >
                      <Button onClick={() => nav.go("sub", id)}>
                        {id} · {model.equipment[id]?.short}
                      </Button>
                      <HealthBadge
                        band={equipmentAt(model, id, nav.time).band}
                      />
                    </Stack>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Not scored: Unknown
                  </Typography>
                )}
                <Typography
                  component="h4"
                  sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}
                >
                  PLC tags ({chosen.plc.length})
                </Typography>
                {chosen.plc.map((tag) => (
                  <Box key={tag.tag} sx={{ my: 0.5 }}>
                    {model.tags[tag.tag] ? (
                      <TagLink tag={tag.tag} />
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {tag.tag}
                      </Typography>
                    )}
                    {tag.dead && (
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label="Dead"
                      />
                    )}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {tag.desc}
                    </Typography>
                  </Box>
                ))}
                {!chosen.plc.length && (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                )}
                <Typography
                  component="h4"
                  sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}
                >
                  Infinite Uptime vibration points ({chosen.iu.length})
                </Typography>
                {chosen.iu.map((tag) => (
                  <Typography key={tag.tag} variant="caption" display="block">
                    {tag.tag}
                  </Typography>
                ))}
                {!chosen.iu.length && (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                )}
                <Typography
                  component="h4"
                  sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}
                >
                  Components ({chosen.components.length})
                </Typography>
                <Box sx={{ columns: 2 }}>
                  {chosen.components.map((component, index) => (
                    <Typography key={index} variant="caption" display="block">
                      {component.name} · {component.dept.join(", ")}
                    </Typography>
                  ))}
                </Box>
                <Typography
                  component="h4"
                  sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}
                >
                  Source rows in plant list
                </Typography>
                {chosen.sources.map((source, index) => (
                  <Typography
                    key={index}
                    variant="caption"
                    display="block"
                    color="text.secondary"
                  >
                    {source}
                  </Typography>
                ))}
              </>
            )}
          </AnomalyPanel>
        </Box>
      </Box>
      <AnomalyPanel
        title="Visibility gaps · equipment we cannot fully see"
        flush
      >
        <AnomalyTable
          rows={gaps}
          onRowClick={(sub) => choose(sub, true)}
          columns={[
            { id: "assembly", label: "Assembly" },
            {
              id: "name",
              label: "Sub-assembly",
              render: (sub) => (
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    choose(sub, true);
                  }}
                >
                  {sub.name}
                </Button>
              ),
            },
            {
              id: "status",
              label: "Visibility",
              render: (sub) => VISIBILITY[sub.status],
            },
            { id: "why", label: "What is missing", render: why },
            {
              id: "live",
              label: "Live PLC",
              mono: true,
              render: (sub) => sub.plc.filter((tag) => !tag.dead).length,
            },
            {
              id: "dead",
              label: "Dead PLC",
              mono: true,
              render: (sub) => sub.plc.filter((tag) => tag.dead).length,
            },
            {
              id: "iu",
              label: "IU points",
              mono: true,
              render: (sub) => sub.iu.length,
            },
            {
              id: "review",
              label: "To confirm",
              minWidth: 200,
              render: (sub) => sub.review.join("; ") || "—",
            },
          ]}
        />
      </AnomalyPanel>
      <AnomalyPanel
        title="Failure modes not detectable with current signals · FMEA review"
        flush
      >
        <AnomalyTable
          rows={model.undetectable}
          maxHeight={420}
          columns={[
            { id: "fmea_ref", label: "FMEA", mono: true },
            { id: "component", label: "Component" },
            { id: "failure_mode", label: "Failure mode" },
            { id: "severity_10", label: "Severity", mono: true },
            { id: "rpn", label: "RPN", mono: true },
            {
              id: "why_not_detectable",
              label: "Why not detectable",
              minWidth: 240,
            },
          ]}
        />
      </AnomalyPanel>
    </>
  );
}
