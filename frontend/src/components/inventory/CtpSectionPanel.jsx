import { useRef, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import CtpFilterChip from "@/components/inventory/CtpFilterChip.jsx";
import CtpItemSelect from "@/components/inventory/CtpItemSelect.jsx";
import CtpRowLabel from "@/components/inventory/CtpRowLabel.jsx";
import {
  aggregateByItem,
  coverTone,
  ctpTokenColor,
  daysCover,
  passesCtpFilter,
  qtyBy,
  sectionHasNoStock,
  selectCtpLots,
  zeroStockItemRows,
} from "@/lib/ctpInventory.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";

const fmt = (v) => formatIndianNumber(v == null ? null : Math.round(v));

function sortValue(r, k) {
  if (k === "mhe") return r.mhe;
  if (k === "uom") return r.qty;
  if (k === "cover") return r.cover == null ? -1 : r.cover;
  return r.st[k] || 0;
}

/**
 * One inventory section: product-type chips, item-code filter + search,
 * and a sortable, scrollable item-code table (top N by default).
 *
 * @param {object} props
 * @param {object} props.m - model from buildCtpInventoryModel
 * @param {object} props.f - page filter
 * @param {{ name: string, accent: string, pts: string[] }} props.sec
 * @param {(sec: string, pts: string[]) => void} props.onProductTypesChange
 * @param {(sec: string, items: string[]) => void} props.onItemsChange
 */
function CtpSectionPanel({ m, f, sec, onProductTypesChange, onItemsChange }) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const acc = ctpTokenColor(theme, sec.accent);
  const defSort = m.table.default_sort || {
    key: m.statuses[0].key,
    dir: "desc",
  };
  const topN = m.table.top_n || 10;
  const [sort, setSort] = useState({
    k: defSort.key,
    d: defSort.dir === "asc" ? 1 : -1,
  });
  const [query, setQuery] = useState("");
  const [isShowingAll, setIsShowingAll] = useState(false);

  const fs = { ...f, sec: sec.name };
  const selPt = f.pt[sec.name] || [];
  const selIt = f.item[sec.name] || [];
  // Product-type chip counts ignore the product-type filter itself.
  const ptQty = qtyBy(selectCtpLots(m, fs, { pt: true, item: true }), "pt");
  const itemOpts = m.itemList
    .filter((it) => passesCtpFilter(fs, it, { st: true, item: true }))
    .map((it) => it.item);
  const cv = daysCover(m, fs, "item");
  // No stock in gold for the whole section: list its items at 0 rather
  // than an empty table that reads like a filter problem.
  const noStock = sectionHasNoStock(m, sec.name);
  const itemRows = noStock
    ? zeroStockItemRows(m, fs)
    : aggregateByItem(m, selectCtpLots(m, fs));
  let rows = itemRows.map((a) => ({
    ...a,
    cover: cv[a.item] ? cv[a.item].days : null,
  }));
  if (query) {
    rows = rows.filter((r) =>
      r.item.toLowerCase().includes(query.toLowerCase()),
    );
  }
  rows.sort((a, b) =>
    sort.k === "item"
      ? sort.d * a.item.localeCompare(b.item)
      : sort.d * (sortValue(a, sort.k) - sortValue(b, sort.k)) ||
        a.item.localeCompare(b.item),
  );
  const total = rows.length;
  const vis = isShowingAll ? rows : rows.slice(0, topN);

  const handleSort = (key) =>
    setSort({
      k: key,
      d: sort.k === key ? -sort.d : key === "item" ? 1 : -1,
    });
  const handlePtToggle = (p) =>
    onProductTypesChange(
      sec.name,
      selPt.includes(p) ? selPt.filter((x) => x !== p) : [...selPt, p],
    );
  const ptTitle = (p) => {
    const meta = m.ptMeta[`${sec.name}|${p}`];
    return meta.sub ? `Sub-section: ${meta.sub} · ${meta.tt}` : meta.tt;
  };
  const coverColor = (d) => theme.custom.brand[coverTone(d)];

  const columns = [
    { key: "item", label: "Item_code", align: "left" },
    ...m.statuses.map((s) => ({ key: s.key, label: s.column })),
    { key: "uom", label: "UOM" },
    { key: "mhe", label: "MHE_COUNT" },
    { key: "cover", label: "Days Cover" },
  ];
  const excelRows = rows.map((r) => ({
    Item_code: r.item,
    ...Object.fromEntries(m.statuses.map((s) => [s.column, r.st[s.key]])),
    UOM: `${Math.round(r.qty)} ${m.uomShort(r.uom)}`,
    MHE_COUNT: r.mhe,
    "Days Cover": r.cover == null ? "—" : `${r.cover.toFixed(1)} d`,
  }));
  const usableLabels = m.statuses
    .filter((s) => s.usable)
    .map((s) => s.label)
    .join(" + ");

  return (
    <Box
      ref={cardRef}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderTop: `3px solid ${acc}`,
        borderRadius: 1.25,
        px: { xs: 1.25, md: 2 },
        pt: 1.6,
        pb: 1.35,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.25 }}
      >
        <Typography
          sx={{
            color: "text.secondary",
            fontSize: 15,
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          {`${sec.name} Inventory`}
        </Typography>
        <CardDownloadButton
          cardRef={cardRef}
          rows={excelRows}
          headers={columns.map((c) => c.label)}
          filename={`ctp-${sec.name.toLowerCase().replace(/\s+/g, "-")}-inventory`}
          sheetName={`${sec.name} Inventory`}
          sx={{ width: 28, height: 28, color: "text.disabled" }}
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="baseline"
        spacing={0.75}
        sx={{ mb: 1.25 }}
      >
        <CtpRowLabel>Product type</CtpRowLabel>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, flex: 1 }}>
          <CtpFilterChip
            isSmall
            isOn={!selPt.length}
            color={acc}
            onClick={() => onProductTypesChange(sec.name, [])}
          >
            All
          </CtpFilterChip>
          {sec.pts.map((p) => (
            <CtpFilterChip
              key={p}
              isSmall
              isOn={selPt.includes(p)}
              color={acc}
              title={ptTitle(p)}
              badge={fmt(ptQty[p] || 0)}
              onClick={() => handlePtToggle(p)}
            >
              {p}
            </CtpFilterChip>
          ))}
        </Stack>
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        sx={{ flexWrap: "wrap", gap: 1, mb: 1 }}
      >
        <CtpRowLabel>Item code</CtpRowLabel>
        <CtpItemSelect
          options={itemOpts}
          value={selIt}
          onChange={(v) => onItemsChange(sec.name, v)}
        />
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search table…"
          sx={{ width: 170, "& input": { fontSize: 12.5, py: 0.7 } }}
        />
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
          {noStock
            ? "No stock recorded in gold for this section"
            : total
              ? `Showing ${vis.length} of ${total} item codes`
              : "No stock for the current filters"}
        </Typography>
        {total > topN && (
          <CtpFilterChip
            isSmall
            isOn={isShowingAll}
            color={acc}
            onClick={() => setIsShowingAll(!isShowingAll)}
          >
            {isShowingAll ? `Top ${topN}` : `Show all ${total}`}
          </CtpFilterChip>
        )}
      </Stack>

      <TableContainer
        sx={{
          maxHeight: 420,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            minWidth: 900,
            "& .MuiTableCell-root": {
              borderRight: "none",
              px: 1.1,
              py: 0.8,
              whiteSpace: "nowrap",
            },
          }}
        >
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.align || "right"}
                  onClick={() => handleSort(c.key)}
                  title="Click to sort"
                  sx={{
                    cursor: "pointer",
                    userSelect: "none",
                    backgroundColor: "background.paper",
                    color: sort.k === c.key ? "primary.main" : "text.disabled",
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                  }}
                >
                  {c.label}
                  {sort.k === c.key && (sort.d > 0 ? " ↑" : " ↓")}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {vis.map((r) => (
              <TableRow
                key={r.item}
                hover
                sx={{
                  backgroundColor:
                    r.cover != null && r.cover < 1
                      ? alpha(theme.custom.brand.red, 0.04)
                      : "transparent",
                }}
              >
                <TableCell title={`${r.pt} · ${r.uom}`}>
                  <Box
                    component="span"
                    sx={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontWeight: 600,
                      fontSize: 12.5,
                    }}
                  >
                    {r.item}
                  </Box>
                </TableCell>
                {m.statuses.map((s) => {
                  const q = r.st[s.key];
                  const isDefault = s.key === defSort.key;
                  return (
                    <BodyCell
                      key={s.key}
                      color={
                        !q
                          ? "text.disabled"
                          : isDefault
                            ? "text.primary"
                            : ctpTokenColor(theme, s.color)
                      }
                      isStrong={isDefault && Boolean(q)}
                    >
                      {q ? fmt(q) : "—"}
                    </BodyCell>
                  );
                })}
                <BodyCell color="text.disabled" title={`Total in ${r.uom}`}>
                  {`${fmt(r.qty)} ${m.uomShort(r.uom)}`}
                </BodyCell>
                <BodyCell color="text.secondary">{String(r.mhe)}</BodyCell>
                <BodyCell
                  color={
                    r.cover == null ? "text.disabled" : coverColor(r.cover)
                  }
                  isStrong
                >
                  {r.cover == null ? "—" : `${r.cover.toFixed(1)} d`}
                </BodyCell>
              </TableRow>
            ))}
            {!vis.length && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  align="center"
                  sx={{ py: 2, fontSize: 12.5, color: "text.disabled" }}
                >
                  No item codes match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.75 }}>
        {`Quantities in each item's UOM (hover the item code) · click a column head to sort · Days cover = usable stock (${usableLabels}) ÷ daily consumption`}
      </Typography>
    </Box>
  );
}

function BodyCell({ children, color, isStrong, title }) {
  return (
    <TableCell
      align="right"
      title={title}
      sx={{ color, fontSize: 12.5, fontWeight: isStrong ? 800 : 400 }}
    >
      {children}
    </TableCell>
  );
}

export default CtpSectionPanel;
