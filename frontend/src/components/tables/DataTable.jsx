import { useMemo, useState } from "react";
import {
  Box,
  Checkbox,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import FilterListIcon from "@mui/icons-material/FilterList";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

/**
 * Reusable data table with a search bar, click-to-sort column headers and a
 * per-column dropdown of distinct values to filter by. Presentation-only —
 * the caller supplies columns + rows and (optionally) per-column renderers.
 *
 * Column shape:
 *   {
 *     key,                         // unique key; also the default row accessor
 *     label,                       // header text
 *     align = "center",
 *     render?: (row) => node,      // custom cell content
 *     value?: (row) => primitive,  // filter/search value (defaults to row[key])
 *     sortValue?: (row) => primitive, // sort key when it differs from `value`
 *     sortable = true,
 *     filterable = true,
 *     minWidth?,
 *   }
 *
 * Props:
 *   columns, rows            — the data
 *   getRowKey?(row, i)       — react key (defaults to index)
 *   onRowClick?(row)         — makes rows clickable
 *   rowSx?(row)              — extra sx per row
 *   search = true            — show the search bar
 *   searchPlaceholder
 *   emptyMessage
 *   stickyHeader = true, maxHeight
 *   toolbarRight             — extra node rendered on the right of the search row
 */
function DataTable({
  columns,
  rows,
  getRowKey,
  onRowClick,
  rowSx,
  search = true,
  searchPlaceholder = "Search…",
  emptyMessage = "No data.",
  stickyHeader = true,
  maxHeight = 380,
  toolbarRight = null,
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  // { [colKey]: Set<string> } — selected distinct values per column.
  const [colFilters, setColFilters] = useState({});

  const valueOf = (col, row) => {
    const raw = col.value ? col.value(row) : row?.[col.key];
    return raw;
  };
  // Sort key, which is not always the displayed/filtered value. A date column
  // shows dd-mm-yyyy but must order chronologically, and toNum() would read
  // "2026-08-01" as the number 2026 — tying every date within a year. Such a
  // column supplies sortValue (e.g. 20260801) and keeps `value` for the
  // filter dropdown and search text.
  const sortValueOf = (col, row) =>
    col.sortValue ? col.sortValue(row) : valueOf(col, row);
  const textOf = (col, row) => {
    const v = valueOf(col, row);
    return v == null ? "" : String(v);
  };

  // Distinct values per filterable column (for the dropdowns).
  const distinctByCol = useMemo(() => {
    const out = {};
    for (const col of columns) {
      if (col.filterable === false) continue;
      const set = new Set();
      for (const row of rows ?? []) {
        const t = textOf(col, row).trim();
        if (t !== "") set.add(t);
      }
      out[col.key] = [...set].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rows]);

  const processed = useMemo(() => {
    let out = Array.isArray(rows) ? [...rows] : [];

    // Global search — any column's text contains the query.
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((row) =>
        columns.some((col) => textOf(col, row).toLowerCase().includes(q)),
      );
    }

    // Per-column value filters.
    for (const [key, selected] of Object.entries(colFilters)) {
      if (!selected || selected.size === 0) continue;
      const col = columns.find((c) => c.key === key);
      if (!col) continue;
      out = out.filter((row) => selected.has(textOf(col, row).trim()));
    }

    // Sort.
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.dir === "desc" ? -1 : 1;
        out.sort((a, b) => {
          const av = sortValueOf(col, a);
          const bv = sortValueOf(col, b);
          const an = toNum(av);
          const bn = toNum(bv);
          if (an != null && bn != null) return (an - bn) * dir;
          return (
            String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
              numeric: true,
            }) * dir
          );
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, query, colFilters, sort]);

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    setSort((prev) =>
      prev.key !== col.key
        ? { key: col.key, dir: "asc" }
        : prev.dir === "asc"
          ? { key: col.key, dir: "desc" }
          : { key: null, dir: "asc" },
    );
  };

  const setColSelected = (key, selected) =>
    setColFilters((prev) => ({ ...prev, [key]: selected }));

  const activeFilterCount =
    Object.values(colFilters).filter((s) => s && s.size > 0).length +
    (query.trim() ? 1 : 0);

  return (
    <Stack spacing={1}>
      {search && (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            sx={{ maxWidth: 320, "& .MuiOutlinedInput-root": { fontSize: 13 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setQuery("")}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {activeFilterCount > 0 && (
            <Typography
              onClick={() => {
                setQuery("");
                setColFilters({});
              }}
              sx={{
                fontSize: 12,
                color: "primary.main",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Clear filters
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          {toolbarRight}
        </Stack>
      )}

      <TableContainer
        sx={{
          maxHeight,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
        }}
      >
        <Table
          size="small"
          stickyHeader={stickyHeader}
          sx={(t) => ({
            "& .MuiTableCell-root": {
              borderBottom: "1px solid",
              borderColor: t.palette.divider,
            },
            "& thead .MuiTableCell-root": {
              backgroundColor: t.custom?.surface?.soft ?? t.palette.action.hover,
            },
          })}
        >
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <HeaderCell
                  key={col.key}
                  col={col}
                  sort={sort}
                  onSort={() => toggleSort(col)}
                  distinct={distinctByCol[col.key] ?? []}
                  selected={colFilters[col.key] ?? new Set()}
                  onSelectedChange={(s) => setColSelected(col.key, s)}
                  theme={theme}
                />
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {processed.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  align="center"
                  sx={{ fontSize: 13, color: "text.disabled", py: 3 }}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              processed.map((row, i) => (
                <TableRow
                  key={getRowKey ? getRowKey(row, i) : i}
                  hover
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  sx={{
                    cursor: onRowClick ? "pointer" : "default",
                    backgroundColor: (t) =>
                      i % 2 === 0
                        ? "background.paper"
                        : (t.custom?.table?.alternateRow ?? "rgba(0, 119, 182, 0.04)"),
                    "&:hover": {
                      backgroundColor: (t) => t.palette.action.hover,
                    },
                    ...(rowSx ? rowSx(row) : {}),
                  }}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? "center"}
                      sx={{ fontSize: 13, minWidth: col.minWidth }}
                    >
                      {col.render ? col.render(row) : row[col.key]}
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

function HeaderCell({
  col,
  sort,
  onSort,
  distinct,
  selected,
  onSelectedChange,
  theme,
}) {
  const [anchor, setAnchor] = useState(null);
  const sortable = col.sortable !== false;
  const filterable = col.filterable !== false && distinct.length > 0;
  const isSorted = sort.key === col.key;
  const hasFilter = selected && selected.size > 0;

  const toggleValue = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onSelectedChange(next);
  };

  return (
    <TableCell
      align={col.align ?? "center"}
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
        minWidth: col.minWidth,
      }}
    >
      <Stack
        direction="row"
        spacing={0.25}
        alignItems="center"
        justifyContent={
          (col.align ?? "center") === "left" ? "flex-start" : "center"
        }
      >
        <Box
          component="span"
          onClick={sortable ? onSort : undefined}
          sx={{
            cursor: sortable ? "pointer" : "default",
            userSelect: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
          }}
        >
          {col.label}
          {sortable &&
            (isSorted ? (
              sort.dir === "asc" ? (
                <ArrowUpwardIcon sx={{ fontSize: 13 }} />
              ) : (
                <ArrowDownwardIcon sx={{ fontSize: 13 }} />
              )
            ) : (
              <ArrowUpwardIcon sx={{ fontSize: 13, opacity: 0.2 }} />
            ))}
        </Box>
        {filterable && (
          <IconButton
            size="small"
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ p: 0.25 }}
          >
            <FilterListIcon
              sx={{
                fontSize: 14,
                color: hasFilter ? theme.palette.primary.main : "text.disabled",
              }}
            />
          </IconButton>
        )}
      </Stack>

      {filterable && (
        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 320 } } }}
        >
          {hasFilter && (
            <MenuItem
              onClick={() => {
                onSelectedChange(new Set());
                setAnchor(null);
              }}
              sx={{ fontSize: 12, color: "primary.main" }}
            >
              Clear
            </MenuItem>
          )}
          {distinct.map((v) => (
            <MenuItem
              key={v}
              onClick={() => toggleValue(v)}
              sx={{ fontSize: 12, py: 0.25 }}
            >
              <Checkbox size="small" checked={selected.has(v)} sx={{ p: 0.5 }} />
              <ListItemText
                primary={v}
                primaryTypographyProps={{ fontSize: 12 }}
              />
            </MenuItem>
          ))}
        </Menu>
      )}
    </TableCell>
  );
}

/** Numeric value of a cell (strips commas/%); null when not numeric. */
function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = Number.parseFloat(v.replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default DataTable;
