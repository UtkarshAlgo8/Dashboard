import { Box, Breadcrumbs, Button, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import DrillCloseButton from "@/components/drills/shared/DrillCloseButton.jsx";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";

/**
 * Technical dashboard drill shell — the prototype's drill card: title with
 * accent, breadcrumb, summary tiles, "View by" chip rows, one table and a
 * footnote (docs/plant_operations_dashboard__33_ (1).html → TechStockDrill).
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.accent theme.custom.brand colour value
 * @param {string[]} props.breadcrumb
 * @param {[string, string][]} [props.tiles] label / value pairs
 * @param {{ label: string, options: string[], value: string,
 *           onChange: (v: string) => void }[]} [props.chipRows]
 * @param {string[]} props.cols
 * @param {(string | number | import("react").ReactNode)[][]} props.rows
 * @param {string} [props.footnote]
 * @param {string} [props.downloadFilename]
 * @param {boolean} [props.isLoading]
 * @param {import("react").ReactNode} [props.actions] Header navigation/refresh controls
 * @param {() => void} props.onClose
 */
function TechDrillCard({
  title,
  accent,
  breadcrumb,
  tiles = [],
  chipRows = [],
  cols,
  rows,
  footnote,
  downloadFilename,
  isLoading = false,
  onClose,
  onRowClick,
  emptyMessage,
  actions,
}) {
  const theme = useTheme();
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        p: 2,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${accent}`,
        borderRadius: 2,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mb: 0.5 }}
      >
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 750,
            color: accent,
            minWidth: 0,
            overflowWrap: "anywhere",
            flex: "1 1 240px",
          }}
        >
          {title}
        </Typography>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
        >
          {actions}
          <DrillCloseButton onClose={onClose} />
        </Stack>
      </Stack>
      <Breadcrumbs
        separator="›"
        sx={{ mb: 1.5, fontSize: 12, color: "text.secondary" }}
      >
        {breadcrumb.map((part) => (
          <Typography key={part} sx={{ fontSize: 12 }}>
            {part}
          </Typography>
        ))}
      </Breadcrumbs>

      {isLoading ? (
        <DrillSkeleton />
      ) : (
        <>
          {tiles.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              flexWrap="wrap"
              sx={{ mb: 1.5 }}
            >
              {tiles.map(([label, value]) => (
                <Box
                  key={label}
                  sx={{
                    px: 1.5,
                    py: 0.875,
                    borderRadius: 2,
                    border: 1,
                    borderColor: "divider",
                    backgroundColor: theme.custom.surface.soft,
                    minWidth: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "text.secondary",
                      textTransform: "uppercase",
                    }}
                  >
                    {label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 15,
                      fontWeight: 800,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}

          {chipRows
            .filter((row) => row.options.length > 1)
            .map((row) => (
              <ChipRow key={row.label} accent={accent} {...row} />
            ))}

          <DrillTable
            cols={cols}
            rows={rows}
            downloadFilename={downloadFilename}
            legend={false}
            onRowClick={onRowClick}
            emptyMessage={emptyMessage}
          />

          {footnote && (
            <Typography sx={{ mt: 1, fontSize: 11.5, color: "text.secondary" }}>
              {footnote}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

function ChipRow({ label, options, value, onChange, accent }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      useFlexGap
      flexWrap="wrap"
      sx={{ mb: 1.25 }}
    >
      <Typography
        sx={{
          mr: 0.5,
          fontSize: 11,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Typography>
      {options.map((option) => {
        const active = option === value;
        return (
          <Button
            key={option}
            size="small"
            variant={active ? "contained" : "outlined"}
            disableElevation
            onClick={() => onChange(option)}
            sx={{
              minHeight: 28,
              borderRadius: 999,
              px: 1.25,
              textTransform: "none",
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              ...(active
                ? {
                    backgroundColor: accent,
                    "&:hover": { backgroundColor: accent },
                  }
                : { color: "text.primary", borderColor: "divider" }),
            }}
          >
            {option}
          </Button>
        );
      })}
    </Stack>
  );
}

export default TechDrillCard;
