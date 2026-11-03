import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import DomainRoundedIcon from "@mui/icons-material/DomainRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";

/**
 * Modern icon map for functions matching the enterprise design system
 */
const FUNCTION_ICONS = {
  ph: <DomainRoundedIcon sx={{ fontSize: 20 }} />,
  prod: <PrecisionManufacturingRoundedIcon sx={{ fontSize: 20 }} />,
  qual: <VerifiedRoundedIcon sx={{ fontSize: 20 }} />,
  tech: <BuildRoundedIcon sx={{ fontSize: 20 }} />,
  eng: <EngineeringRoundedIcon sx={{ fontSize: 20 }} />,
};

/**
 * Plant + function selector dialog. Opens when a plant card is
 * clicked, or when the corresponding India-map marker is clicked.
 *
 * Designed with a solid, high-contrast, clean aesthetic matching
 * ModernPlantCard (no glassy blurs or translucent see-through masks).
 *
 * `functionsStatus` is "loading" or "error" while the function list has not
 * arrived: every row is then disabled and the header says why.
 */
function PlantFunctionModal({
  open,
  onClose,
  plant,
  functions = [],
  activeFunctionIds = new Set(),
  onSelectFunction,
  functionsStatus = "ready",
  onRetryFunctions,
}) {
  if (!plant) return null;

  const isLive = plant.enabled !== false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "18px",
          p: 0.5,
          backgroundColor: "#FFFFFF",
          border: "1px solid rgba(226, 232, 240, 0.95)",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          overflow: "hidden",
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        {/* Header row: Status badge + Plant Name + Close Button */}
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Stack spacing={0.5} sx={{ minWidth: 0, pr: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography
                sx={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#0F172A",
                  lineHeight: 1.2,
                }}
              >
                {plant.name || `${plant.id?.toUpperCase()} Tyre Plant`}
              </Typography>

              {/* Status Badge */}
              {isLive ? (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: "999px",
                    backgroundColor: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.2)",
                    flexShrink: 0,
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "#DC2626",
                      boxShadow: "0 0 5px rgba(220, 38, 38, 0.6)",
                    }}
                  />
                  <Typography
                    sx={{ fontSize: 11, fontWeight: 700, color: "#DC2626" }}
                  >
                    Live
                  </Typography>
                </Stack>
              ) : (
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748B",
                    backgroundColor: "#F1F5F9",
                    px: 1,
                    py: 0.25,
                    borderRadius: "6px",
                    flexShrink: 0,
                  }}
                >
                  Phase 2
                </Typography>
              )}
            </Stack>

            <Typography
              sx={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}
            >
              {plant.sub || `${plant.location}, ${plant.state}`}
            </Typography>
          </Stack>

          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{
              color: "#64748B",
              backgroundColor: "#F1F5F9",
              "&:hover": { backgroundColor: "#E2E8F0", color: "#0F172A" },
            }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Solid KPI Summary Strip */}
        <Box
          sx={{
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "14px",
            px: 2,
            py: 1.5,
            mb: 2.5,
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-around"
            alignItems="center"
          >
            <KpiPill label="OEE" value={plant.oee ?? plant.oe} />
            <Divider
              orientation="vertical"
              flexItem
              sx={{ borderColor: "#E2E8F0", my: 0.5 }}
            />
            <KpiPill label="OTIF" value={plant.otif} />
            <Divider
              orientation="vertical"
              flexItem
              sx={{ borderColor: "#E2E8F0", my: 0.5 }}
            />
            <KpiPill label="YIELD" value={plant.yield} />
          </Stack>
        </Box>

        {/* Function Selection List Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.25, minHeight: 22 }}
        >
          <Typography
            sx={{
              fontSize: 11,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 700,
            }}
          >
            Select Function
          </Typography>
          {functionsStatus === "loading" && (
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <CircularProgress size={12} thickness={5} />
              <Typography
                sx={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}
              >
                Loading functions…
              </Typography>
            </Stack>
          )}
          {functionsStatus === "error" && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography
                sx={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}
              >
                Couldn't load functions
              </Typography>
              <Button
                size="small"
                onClick={onRetryFunctions}
                sx={{ minWidth: 0, fontSize: 11, fontWeight: 700, py: 0 }}
              >
                Retry
              </Button>
            </Stack>
          )}
        </Stack>

        <Stack spacing={1}>
          {functions.map((fn) => {
            const active =
              functionsStatus === "ready" && activeFunctionIds.has(fn.id);
            return (
              <FunctionRow
                key={fn.id}
                fn={fn}
                active={active}
                pending={functionsStatus !== "ready"}
                onClick={active ? () => onSelectFunction(fn) : undefined}
              />
            );
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function numericPercent(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function KpiPill({ label, value }) {
  const displayValue = numericPercent(value);
  const hasValue = displayValue != null;
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography
        sx={{
          fontSize: 11,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
          mb: 0.25,
        }}
      >
        {label}
      </Typography>
      <Stack
        direction="row"
        alignItems="baseline"
        spacing={0.25}
        justifyContent="center"
      >
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 800,
            color: hasValue ? "#16A34A" : "#94A3B8",
            lineHeight: 1,
          }}
        >
          {hasValue ? displayValue : "—"}
        </Typography>
        {hasValue && (
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>
            %
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function FunctionRow({ fn, active, pending = false, onClick }) {
  const icon = FUNCTION_ICONS[fn.id] || (
    <span style={{ fontSize: 18 }}>{fn.icon || "⚙"}</span>
  );

  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.75,
        py: 1.25,
        borderRadius: "12px",
        cursor: active ? "pointer" : "default",
        backgroundColor: active ? "#FFFFFF" : "#F8FAFC",
        border: "1.5px solid",
        borderColor: active ? "#E2E8F0" : "rgba(226, 232, 240, 0.6)",
        opacity: active ? 1 : 0.65,
        transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
        "&:hover": active
          ? {
              borderColor: "#2563EB",
              backgroundColor: "#F8FAFC",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.08)",
              transform: "translateX(4px)",
            }
          : undefined,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? "#EFF6FF" : "#F1F5F9",
          color: active ? "#2563EB" : "#94A3B8",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 700,
            color: active ? "#0F172A" : "#64748B",
          }}
        >
          {fn.name}
        </Typography>
        {!active && !pending && (
          <Typography sx={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
            Under Phase 2
          </Typography>
        )}
      </Box>

      {active ? (
        <ChevronRightRoundedIcon sx={{ color: "#2563EB", fontSize: 22 }} />
      ) : pending ? null : (
        <Box
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: "#64748B",
            backgroundColor: "#E2E8F0",
            borderRadius: "6px",
            px: 1,
            py: 0.35,
          }}
        >
          SOON
        </Box>
      )}
    </Box>
  );
}

export default PlantFunctionModal;
