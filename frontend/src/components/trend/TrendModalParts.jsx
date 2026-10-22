import {
  Autocomplete,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import JKLoader from "@/components/JKLoader.jsx";

/**
 * The trend modal's building blocks — frame, chart panel, pill and filter
 * rows — shared by the Production TrendModal and the Quality Uniformity
 * trend modal so both read as one product.
 */

/* =========================================================================
 * Frame: title + close + TimeRangeSelect + body. Shared by both paths so
 * the visual shell is identical regardless of which trend view is open.
 * ========================================================================= */

export function ModalFrame({ open, onClose, kpi, headerExtras, children }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: "95vw", sm: "85vw", md: "75vw" },
          maxWidth: "75vw",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Typography
          sx={{
            fontSize: 11,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
          }}
        >
          KPI Trend Analysis
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
            {kpi.name}
          </Typography>
          {kpi.unit && (
            <Typography sx={{ fontSize: 14, color: "text.disabled" }}>
              ({kpi.unit})
            </Typography>
          )}
        </Stack>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {headerExtras}
        {children}
      </DialogContent>
    </Dialog>
  );
}

// A bordered panel that hosts one chart, with title + skeleton/empty states.
// Reused by the OEE modal for the main chart and every overlay chart.
export function ChartPanel({
  theme,
  title,
  loading,
  empty,
  emptyMessage,
  children,
}) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          backgroundColor: theme.custom.surface.soft,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 2,
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && empty ? (
          <ChartSkeleton />
        ) : empty ? (
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
            {emptyMessage}
          </Typography>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}

// Local single-select pill row — mirrors the legacy modal's exclusive
// ToggleButtonGroup look without dragging the Production-drill helper
// across folders. Inline here because TrendModal is the only consumer.
export function SingleSelectRow({ label, value, onChange, options }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
        }}
      >
        {label}
      </Typography>
      <ToggleButtonGroup
        size="small"
        value={value}
        exclusive
        onChange={(_, next) => {
          if (next) onChange(next);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 600,
            border: "1.25px solid",
            borderColor: "divider",
          },
          "& .Mui-selected": {
            borderColor: `${"primary.main"} !important`,
            color: "primary.main",
          },
        }}
      >
        {options.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

export function ChartSkeleton() {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 260,
      }}
    >
      <JKLoader />
    </Box>
  );
}

// Local multi-select dropdown filter — MUI `Autocomplete multiple` in
// the same row shape as `SingleSelectRow` / `MultiSelectPills`. Used
// for the Machines + SKU scopes on the OEE and Production trend
// modals. Inline here because TrendModal is the only consumer for
// now; promote to common/ if a second consumer appears (per
// conventions.md "Shared component library").
export function FilterRow({ label, options, value, onChange, placeholder }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
        }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        size="small"
        sx={{ minWidth: 240, maxWidth: 360 }}
        options={options}
        value={value}
        onChange={(_, next) => onChange(next)}
        disableCloseOnSelect
        disabled={options.length === 0}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={value.length === 0 ? placeholder : ""}
            variant="outlined"
          />
        )}
      />
    </Stack>
  );
}
