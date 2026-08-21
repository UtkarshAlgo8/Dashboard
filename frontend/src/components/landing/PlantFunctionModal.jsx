import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

/**
 * Plant + function selector dialog with True Glassmorphism
 * Styled to seamlessly match the modern landing page plant cards:
 * - 28px frosted glass blur with specular edge highlights
 * - Frosted KPI tiles with inset depth
 * - Interactive glass function buttons with hover lift
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
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(11, 19, 43, 0.55)",
            backdropFilter: "blur(8px)",
          },
        },
      }}
      PaperProps={{
        sx: {
          borderRadius: "20px",
          p: 1.5,
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(240, 246, 255, 0.92) 100%)",
          backdropFilter: "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          border: "1px solid rgba(255, 255, 255, 0.85)",
          boxShadow:
            "0 25px 60px -15px rgba(0, 30, 80, 0.35), 0 0 30px rgba(0, 150, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.95)",
          /* Specular Glass Top-Edge Shine */
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: "5%",
            right: "5%",
            height: "1px",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(0,180,255,0.8) 50%, rgba(255,255,255,0) 100%)",
            pointerEvents: "none",
          },
        },
      }}
    >
      <DialogContent sx={{ p: 1.5 }}>
        {/* Header row: badge + name + close */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              sx={{
                px: 1.2,
                py: 0.3,
                borderRadius: "7px",
                background: "linear-gradient(135deg, #FFF2EC 0%, #FFE5D6 100%)",
                border: "1px solid #FFD0B8",
                color: "#E65100",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.5,
                boxShadow: "0 2px 6px rgba(230, 81, 0, 0.12)",
              }}
            >
              {plant.code || plant.id.toUpperCase()}
            </Box>
            <Typography
              sx={{
                fontSize: 19,
                fontWeight: 700,
                color: "#0F172A",
                letterSpacing: "-0.2px",
              }}
            >
              {plant.name}
            </Typography>
          </Stack>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{
              backgroundColor: "rgba(0, 0, 0, 0.04)",
              "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.08)" },
            }}
          >
            <CloseIcon fontSize="small" sx={{ color: "#64748B" }} />
          </IconButton>
        </Stack>

        <Typography
          sx={{
            fontSize: 13,
            color: "#64748B",
            fontWeight: 500,
            mb: 2,
            ml: 0.5,
          }}
        >
          {plant.sub}
        </Typography>

        {/* KPI strip (Glassmorphic Container) */}
        <Box
          sx={{
            backgroundColor: "rgba(255, 255, 255, 0.75)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            borderRadius: "14px",
            px: 2.5,
            py: 1.6,
            mb: 2.5,
            boxShadow:
              "0 4px 12px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-around"
            alignItems="flex-end"
          >
            <KpiPill label="OEE" value={plant.oee} />
            <KpiPill label="OTIF" value={plant.otif} />
            <KpiPill label="YIELD" value={plant.yield} />
          </Stack>
        </Box>

        <Typography
          sx={{
            fontSize: 11,
            color: "#94A3B8",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
            mb: 1.2,
            ml: 0.5,
          }}
        >
          Select Function
        </Typography>

        <Stack spacing={1.2}>
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
          mb: 0.2,
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
            fontSize: 24,
            fontWeight: 800,
            color: hasValue ? "#16A34A" : "#94A3B8",
            lineHeight: 1,
          }}
        >
          {hasValue ? displayValue : "NA"}
        </Typography>
        {hasValue && (
          <Typography
            sx={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}
          >
            %
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function numericPercent(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function FunctionRow({ fn, active, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.8,
        py: 1.4,
        borderRadius: "13px",
        cursor: active ? "pointer" : "default",
        background: active
          ? "linear-gradient(135deg, rgba(255, 242, 236, 0.9) 0%, rgba(255, 229, 214, 0.9) 100%)"
          : "rgba(241, 245, 249, 0.6)",
        border: "1px solid",
        borderColor: active
          ? "rgba(255, 208, 184, 0.95)"
          : "rgba(226, 232, 240, 0.75)",
        opacity: active ? 1 : 0.65,
        boxShadow: active
          ? "0 4px 14px rgba(230, 81, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)"
          : "none",
        transition: "all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "&:hover": active
          ? {
              transform: "translateX(4px)",
              background:
                "linear-gradient(135deg, rgba(255, 235, 224, 0.95) 0%, rgba(255, 220, 200, 0.95) 100%)",
              boxShadow:
                "0 6px 18px rgba(230, 81, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
            }
          : undefined,
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "9px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? "rgba(230, 81, 0, 0.12)" : "rgba(100, 116, 139, 0.08)",
          color: active ? "#E65100" : "#94A3B8",
          fontSize: 18,
          boxShadow: active ? "0 2px 6px rgba(230, 81, 0, 0.15)" : "none",
        }}
      >
        {fn.icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 700,
            color: active ? "#0F172A" : "#94A3B8",
          }}
        >
          {fn.name}
        </Typography>
        {!active && (
          <Typography sx={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
            Coming Soon
          </Typography>
        )}
      </Box>
      {active ? (
        <ChevronRightIcon sx={{ color: "#E65100", fontSize: 22, fontWeight: 700 }} />
      ) : (
        <Box
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: "#64748B",
            backgroundColor: "#F1F5F9",
            border: "1px solid #E2E8F0",
            borderRadius: "6px",
            px: 1,
            py: 0.3,
          }}
        >
          SOON
        </Box>
      )}
    </Box>
  );
}

export default PlantFunctionModal;
