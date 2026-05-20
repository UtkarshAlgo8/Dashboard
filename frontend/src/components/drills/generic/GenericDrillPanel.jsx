import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";

/**
 * Renders a KPI's embedded drill payload. Mirrors the artifact's two
 * generic drill types (artifact.jsx:1229–1253):
 *
 *   { type: "table", title, cols, rows }
 *   { type: "budget", allocated, spent, consumedPct, unit }
 */
function GenericDrillPanel({ kpi }) {
  const drill = kpi?.drill;
  if (!drill) {
    return (
      <Box sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No drill configured for {kpi?.name ?? "this KPI"}.
        </Typography>
      </Box>
    );
  }
  if (drill.type === "table") return <TableDrill drill={drill} />;
  if (drill.type === "budget") return <BudgetDrill drill={drill} />;
  return (
    <Box sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
      <Typography sx={{ fontSize: 13 }}>
        Unsupported drill type: {drill.type}
      </Typography>
    </Box>
  );
}

function TableDrill({ drill }) {
  const { title, cols, rows } = drill;
  return (
    <Stack spacing={1.25}>
      {title && (
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{title}</Typography>
      )}
      <TableContainer
        sx={{
          maxHeight: 340,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {cols.map((c, i) => (
                <TableCell
                  key={c}
                  align={i === 0 ? "left" : "right"}
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "text.disabled",
                    backgroundColor: "background.paper",
                    borderBottom: 1,
                    borderColor: "divider",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={cols.length}
                  align="center"
                  sx={{ fontSize: 12, color: "text.disabled", py: 3 }}
                >
                  No detail rows
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, ri) => (
                <TableRow key={ri} hover>
                  {row.map((cell, ci) => (
                    <TableCell
                      key={ci}
                      align={ci === 0 ? "left" : "right"}
                      sx={{
                        fontSize: 13,
                        fontWeight: ci === 0 ? 600 : 400,
                      }}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function BudgetDrill({ drill }) {
  const { allocated, spent, consumedPct, unit = "₹ L" } = drill;
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
        Budget Utilization
      </Typography>
      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        sx={{
          p: 2,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Donut value={consumedPct} />
        <Stack spacing={1}>
          <Stat label="Allocated Consumables" value={`${unit} ${allocated}`} />
          <Stat
            label="Spent Consumables"
            value={`${unit} ${spent}`}
            accent="amber"
          />
        </Stack>
      </Stack>
    </Stack>
  );
}

function Donut({ value }) {
  const theme = useTheme();
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const trackColor = theme.palette.action.disabledBackground;
  const arcColor = theme.custom.brand.amber;
  return (
    <svg width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={arcColor}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        style={{ fontSize: 18, fontWeight: 700, fill: "currentColor" }}
      >
        {value}%
      </text>
    </svg>
  );
}

function Stat({ label, value, accent }) {
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 19,
          fontWeight: 700,
          color: accent === "amber" ? "warning.main" : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export default GenericDrillPanel;
