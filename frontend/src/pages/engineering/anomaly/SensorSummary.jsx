import { Button, Stack, Typography, Box } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { tagAt } from "@/lib/anomaly/model.js";
import { RuleChips } from "./AnomalyParts.jsx";

export default function SensorSummary() {
  const { model, nav } = useAnomaly();
  const counts = { GOOD: 0, SUSPECT: 0, BAD: 0, "NO DATA": 0, EXCLUDE: 0 },
    hits = {};
  model.tagIds.forEach((tag) => {
    const value = tagAt(model, tag, nav.time);
    counts[value.status]++;
    if (value.action === "EXCLUDE") counts.EXCLUDE++;
    if (value.rule && value.health < 100)
      hits[value.rule] = (hits[value.rule] ?? 0) + 1;
  });
  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
          gap: 1,
        }}
      >
        {["GOOD", "SUSPECT", "BAD", "EXCLUDE"].map((status) => (
          <Button
            key={status}
            variant="outlined"
            onClick={() =>
              nav.go("sensors", null, {
                status: status === "EXCLUDE" ? null : status,
                action: status === "EXCLUDE" ? "EXCLUDE" : null,
              })
            }
            sx={{
              display: "block",
              textAlign: "left",
              px: 1.25,
              py: 1,
              borderColor: "divider",
              color: "text.primary",
            }}
          >
            <Typography
              variant="caption"
              color={
                status === "BAD" || status === "EXCLUDE"
                  ? "error.main"
                  : "text.secondary"
              }
            >
              {status}
            </Typography>
            <Typography sx={{ font: "600 28px 'Geist Mono', monospace" }}>
              {counts[status]}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              of {model.tagIds.length} tags
            </Typography>
          </Button>
        ))}
      </Box>
      <Stack
        direction="row"
        gap={1}
        alignItems="center"
        flexWrap="wrap"
        sx={{ mt: 1 }}
      >
        <RuleChips hits={hits} />
        <Typography variant="caption" color="text.secondary">
          {counts["NO DATA"]} tags have no data at this instant.
        </Typography>
      </Stack>
    </Box>
  );
}
