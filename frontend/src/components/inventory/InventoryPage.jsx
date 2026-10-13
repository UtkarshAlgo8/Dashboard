import { useState } from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

import { getCtpInventoryMaster } from "@/api/inventory.js";
import CtpDrillCard from "@/components/inventory/CtpDrillCard.jsx";
import CtpFilterChip from "@/components/inventory/CtpFilterChip.jsx";
import CtpInsightCard from "@/components/inventory/CtpInsightCard.jsx";
import CtpRowLabel from "@/components/inventory/CtpRowLabel.jsx";
import CtpSectionPanel from "@/components/inventory/CtpSectionPanel.jsx";
import CtpSummaryTile from "@/components/inventory/CtpSummaryTile.jsx";
import InventoryPageSkeleton from "@/components/inventory/InventoryPageSkeleton.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  buildCtpInventoryModel,
  computeInsightCard,
  ctpTokenColor,
  emptyCtpFilter,
  qtyBy,
  qtyByStatus,
  selectCtpLots,
  summarizeCtpLots,
  sumCtpMheCounts,
  sumCtpUnassignedMheCounts,
} from "@/lib/ctpInventory.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";

const fmt = (v) => formatIndianNumber(v == null ? null : Math.round(v));

const SHIFT_LABELS = { all: "All", a: "A", b: "B", c: "C" };

/**
 * Production · Inventory. Only CTP (Chennai) has an inventory master;
 * every other plant shows "not configured".
 *
 * @param {object} props
 * @param {string} props.plantId
 * @param {string} [props.tyreType] - header PCR/TBR/All picker
 * @param {string} [props.shift] - header shift key (all/a/b/c)
 * @param {string|null} [props.granularity] - header grain (DAY / MONTH / SHIFT A-C)
 * @param {string|null} [props.from] - header window start (ISO)
 * @param {string|null} [props.to] - header window end (ISO)
 */
function InventoryPage({ plantId, tyreType, shift, granularity, from, to }) {
  const isCtp = plantId === "chennai";
  // Held here, not in the body, so the page's filters survive the
  // skeleton shown while a period change refetches.
  const [filter, setFilter] = useState(() => emptyCtpFilter());
  const { data, error, isLoading } = usePolledQuery(
    () => getCtpInventoryMaster({ plantId, granularity, from, to }),
    {
      interval: 0,
      deps: [plantId, granularity, from, to],
      enabled: isCtp,
    },
  );

  if (!isCtp) return <InventoryMessage text="Inventory not configured." />;
  if (error && !isLoading) {
    return (
      <InventoryMessage text="Inventory master data is missing or invalid." />
    );
  }
  if (isLoading || !data) return <InventoryPageSkeleton />;
  return (
    <CtpInventoryBody
      m={buildCtpInventoryModel(data)}
      tyreType={tyreType}
      shift={shift}
      filter={filter}
      setFilter={setFilter}
    />
  );
}

function InventoryMessage({ text }) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "text.disabled",
      }}
    >
      <Typography sx={{ fontSize: 13 }}>{text}</Typography>
    </Box>
  );
}

function CtpInventoryBody({ m, tyreType, shift, filter, setFilter }) {
  const theme = useTheme();
  const [drillId, setDrillId] = useState(null);
  // Tyre type is owned by the header; merge it in rather than mirroring it.
  const f = { ...filter, tt: tyreType || "All" };
  const primary = theme.palette.primary.main;

  const update = (o) => setFilter((p) => ({ ...p, ...o }));
  const handleProductTypesChange = (s, v) =>
    setFilter((p) => {
      // Drop item codes that no longer belong to the selected product types.
      const keep = (p.item[s] || []).filter(
        (code) =>
          !v.length ||
          m.itemList.some((it) => it.item === code && v.includes(it.pt)),
      );
      return {
        ...p,
        pt: { ...p.pt, [s]: v },
        item: { ...p.item, [s]: keep },
      };
    });
  const handleItemsChange = (s, v) =>
    setFilter((p) => ({ ...p, item: { ...p.item, [s]: v } }));
  const handleStatusToggle = (k) =>
    update({
      st: f.st.includes(k) ? f.st.filter((x) => x !== k) : [...f.st, k],
    });

  // One filtered row set feeds summary + cards; option counts skip their own dimension.
  const rows = selectCtpLots(m, f);
  const sum = summarizeCtpLots(rows);
  const mheSum = sumCtpMheCounts(m, f);
  const unassignedMheSum = sumCtpUnassignedMheCounts(m, f);
  const stQty = qtyByStatus(m, selectCtpLots(m, f, { st: true }));
  const secQty = qtyBy(selectCtpLots(m, f, { sec: true }), "sec");
  const allSecQty = Object.values(secQty).reduce((a, b) => a + b, 0);
  const mix = qtyByStatus(m, rows);
  const cards = m.cards
    .map((cfg) => ({ cfg, r: computeInsightCard(m, f, rows, cfg) }))
    .filter((x) => x.r);
  const openCard = drillId && cards.find((x) => x.cfg.id === drillId);
  const cardColor = ({ cfg, r }) =>
    r.isBad ? ctpTokenColor(theme, cfg.color) : theme.custom.brand.green;

  const active = [];
  if (f.st.length) {
    active.push({
      label: `Status: ${f.st.map((k) => m.stByKey[k].label).join(", ")}`,
      onClear: () => update({ st: [] }),
    });
  }
  if (f.sec !== "All") {
    active.push({
      label: `Section: ${f.sec}`,
      onClear: () => update({ sec: "All" }),
    });
  }
  m.sections.forEach((s) => {
    if ((f.pt[s.name] || []).length) {
      active.push({
        label: `${s.name} product: ${f.pt[s.name].join(", ")}`,
        onClear: () => handleProductTypesChange(s.name, []),
      });
    }
    if ((f.item[s.name] || []).length) {
      active.push({
        label: `${s.name} items: ${f.item[s.name].join(", ")}`,
        onClear: () => handleItemsChange(s.name, []),
      });
    }
  });

  const isDefault = !active.length && f.tt === "All";
  const scope = isDefault
    ? "All product types · all sections · all statuses"
    : [
        f.tt !== "All" ? f.tt : null,
        f.sec !== "All" ? f.sec : "All sections",
        f.st.length
          ? f.st.map((k) => m.stByKey[k].label).join(" + ")
          : "all statuses",
      ]
        .filter(Boolean)
        .join(" · ");
  const shownSecs = m.sections.filter(
    (s) => f.sec === "All" || f.sec === s.name,
  );

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        backgroundColor: "background.default",
        px: { xs: 1.5, md: 2.5 },
        py: 2,
      }}
    >
      <Stack spacing={1.75}>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ flexWrap: "wrap", gap: 1 }}
        >
          <CtpRowLabel>Status</CtpRowLabel>
          <CtpFilterChip
            isOn={!f.st.length}
            color={primary}
            onClick={() => update({ st: [] })}
          >
            All
          </CtpFilterChip>
          {m.statuses.map((s) => (
            <CtpFilterChip
              key={s.key}
              isOn={f.st.includes(s.key)}
              color={ctpTokenColor(theme, s.color)}
              title={`Source: ${s.source_field} = '${s.source_value}' · click to add/remove`}
              badge={fmt(stQty[s.key])}
              onClick={() => handleStatusToggle(s.key)}
            >
              {s.label}
            </CtpFilterChip>
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {`Chennai · Shift: ${SHIFT_LABELS[shift] || "All"} · Tyre: ${f.tt} · As of ${String(m.raw.as_of).slice(0, 10)}`}
          </Typography>
        </Stack>

        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5 }}>
          <CtpSummaryTile
            label="Total Inventory"
            value={fmt(sum.qty)}
            sub={`${scope} · ${sum.lots} lots`}
            color={primary}
          >
            {sum.qty > 0 && (
              <Stack
                direction="row"
                sx={{
                  height: 6,
                  borderRadius: 0.5,
                  overflow: "hidden",
                  mt: 1,
                  backgroundColor: "background.default",
                }}
              >
                {m.statuses
                  .filter((s) => mix[s.key])
                  .map((s) => (
                    <Box
                      key={s.key}
                      title={`${s.label}: ${fmt(mix[s.key])}`}
                      sx={{
                        width: `${(mix[s.key] / sum.qty) * 100}%`,
                        backgroundColor: ctpTokenColor(theme, s.color),
                      }}
                    />
                  ))}
              </Stack>
            )}
          </CtpSummaryTile>
          <CtpSummaryTile
            label="MHE"
            value={fmt(mheSum)}
            sub={
              unassignedMheSum > 0
                ? `${fmt(unassignedMheSum)} without item mapping · all statuses`
                : "Gold MHE_Count · all statuses"
            }
            color={theme.custom.brand.teal}
          />
        </Stack>

        {active.length > 0 && (
          <Stack
            direction="row"
            alignItems="center"
            sx={{ flexWrap: "wrap", gap: 0.75 }}
          >
            <CtpRowLabel>Filters</CtpRowLabel>
            {active.map((a) => (
              <Stack
                key={a.label}
                direction="row"
                alignItems="center"
                sx={{
                  fontSize: 12,
                  pl: 1.1,
                  pr: 0.5,
                  py: 0.35,
                  borderRadius: 3,
                  backgroundColor: "primary.light",
                  border: 1,
                  borderColor: "primary.dark",
                  maxWidth: 420,
                  gap: 0.5,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.label}
                </Box>
                <ButtonBase
                  onClick={a.onClear}
                  title="Remove filter"
                  sx={{ borderRadius: "50%", color: "text.disabled" }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </ButtonBase>
              </Stack>
            ))}
            <ButtonBase
              onClick={() => setFilter(emptyCtpFilter())}
              sx={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
                color: "primary.main",
                px: 0.5,
              }}
            >
              Clear all
            </ButtonBase>
          </Stack>
        )}

        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.25 }}>
          {cards.map((c) => {
            const isOpen = drillId === c.cfg.id;
            const value =
              c.cfg.type === "oldest_blocked"
                ? c.r.value == null
                  ? "—"
                  : `${c.r.value.toFixed(1)} days`
                : fmt(c.r.value);
            return (
              <CtpInsightCard
                key={c.cfg.id}
                title={c.cfg.title}
                value={value}
                sub={c.r.sub}
                color={cardColor(c)}
                isOpen={isOpen}
                onToggle={() => setDrillId(isOpen ? null : c.cfg.id)}
              />
            );
          })}
        </Stack>

        {openCard && (
          <CtpDrillCard
            cfg={openCard.cfg}
            result={openCard.r}
            color={ctpTokenColor(theme, openCard.cfg.color)}
          />
        )}

        <Stack
          direction="row"
          alignItems="center"
          sx={{ flexWrap: "wrap", gap: 1, pt: 0.25 }}
        >
          <CtpRowLabel>Section</CtpRowLabel>
          <CtpFilterChip
            isOn={f.sec === "All"}
            color={primary}
            badge={fmt(allSecQty)}
            onClick={() => update({ sec: "All" })}
          >
            All Sections
          </CtpFilterChip>
          {m.sections.map((s) => (
            <CtpFilterChip
              key={s.name}
              isOn={f.sec === s.name}
              color={ctpTokenColor(theme, s.accent)}
              badge={fmt(secQty[s.name] || 0)}
              onClick={() => update({ sec: f.sec === s.name ? "All" : s.name })}
            >
              {s.name}
            </CtpFilterChip>
          ))}
        </Stack>

        {shownSecs.map((s) => (
          <CtpSectionPanel
            key={s.name}
            m={m}
            f={f}
            sec={s}
            onProductTypesChange={handleProductTypesChange}
            onItemsChange={handleItemsChange}
          />
        ))}

        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
          Total Inventory = SUM(quantity) · MHE = Gold MHE_Count (status-independent;
          headline may include counts without item mapping). Status,
          section, product type, item code and the header PCR/TBR filter all
          combine; Days cover ignores the status filter because Expired and On
          Hold stock cannot be issued.
        </Typography>
      </Stack>
    </Box>
  );
}

export default InventoryPage;
