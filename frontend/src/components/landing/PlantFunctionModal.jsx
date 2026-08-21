import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

/**
 * Plant + function selector dialog. Opens when a plant card is
 * clicked, or when the corresponding India-map marker is clicked.
 *
 * Phase 1: only Production navigates (Banmore only). Quality and
 * Engineering render in the active style but click → toast
 * "Phase 2" (the existing handler in LandingPage). Plant Head and
 * Technical render in the "SOON" style per BRD FR-L15.
 */
function PlantFunctionModal({
  open,
  onClose,
  plant,
  functions,
  activeFunctionIds,
  onSelectFunction,
}) {
  const theme = useTheme();
  if (!plant) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          p: 1,
          backgroundColor: alpha(theme.palette.background.paper, 0.75),
          backdropFilter: "blur(24px) saturate(190%)",
          WebkitBackdropFilter: "blur(24px) saturate(190%)",
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
        },
      }}
    >
      <DialogContent sx={{ pb: 2 }}>
        {/* Header row: bullet + name + close */}
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          sx={{ mb: 0.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: "primary.main",
              }}
            />
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
              {plant.name}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Typography
          sx={{ fontSize: 13, color: "text.disabled", mb: 2, ml: 2.5 }}
        >
          {plant.sub}
        </Typography>

        {/* KPI strip */}
        <Box
          sx={{
            backgroundColor: alpha(theme.custom.surface.soft, 0.6),
            border: 1,
            borderColor: alpha(theme.palette.divider, 0.4),
            borderRadius: 1.25,
            px: 2.5,
            py: 1.5,
            mb: 2.5,
            backdropFilter: "blur(12px)",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-around"
            alignItems="flex-end"
          >
            <KpiPill label="OEE" value={plant.oee ?? plant.oe} />
            <KpiPill label="OTIF" value={plant.otif} />
            <KpiPill label="YIELD" value={plant.yield} />
          </Stack>
        </Box>

        <Typography
          sx={{
            fontSize: 11,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
            mb: 1,
          }}
        >
          Select Function
        </Typography>

        <Stack spacing={1}>
          {functions.map((fn) => {
            const active = activeFunctionIds.has(fn.id);
            return (
              <FunctionRow
                key={fn.id}
                fn={fn}
                active={active}
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
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
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
            fontSize: 26,
            fontWeight: 700,
            color: hasValue ? "success.main" : "text.disabled",
            lineHeight: 1,
          }}
        >
          {hasValue ? displayValue : "—"}
        </Typography>
        {hasValue && (
          <Typography sx={{ fontSize: 12, color: "success.main" }}>%</Typography>
        )}
      </Stack>
    </Box>
  );
}

function FunctionRow({ fn, active, onClick }) {
  const theme = useTheme();
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: 1.25,
        cursor: active ? "pointer" : "default",
        backgroundColor: active
          ? theme.custom.brand.orangeSoft
          : "transparent",
        border: 1,
        borderColor: active ? "transparent" : "divider",
        opacity: active ? 1 : 0.65,
        transition: "all 0.2s ease",
        "&:hover": active
          ? {
              backgroundColor: theme.custom.brand.orangeRing,
              transform: "translateX(3px)",
            }
          : undefined,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active
            ? theme.custom.brand.orangeRing
            : theme.custom.surface.soft,
          color: active ? "primary.main" : "text.disabled",
          fontSize: 18,
        }}
      >
        {fn.icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: active ? "text.primary" : "text.disabled",
          }}
        >
          {fn.name}
        </Typography>
        {!active && (
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            Coming Soon
          </Typography>
        )}
      </Box>
      {active ? (
        <ChevronRightIcon sx={{ color: "primary.main", fontSize: 22 }} />
      ) : (
        <Box
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: "text.disabled",
            backgroundColor: theme.custom.surface.soft,
            border: 1,
            borderColor: "divider",
            borderRadius: 999,
            px: 1,
            py: 0.25,
          }}
        >
          SOON
        </Box>
      )}
    </Box>
  );
}

export default PlantFunctionModal;
