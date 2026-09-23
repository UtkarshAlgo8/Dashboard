/**
 * CTP (Chennai) Production · Inventory — data layer. No React.
 *
 * Source: the Inventory master payload (src/lib/ctpInventoryMaster.json,
 * served by getCtpInventoryMaster). Ported from the CtpInv layer in
 * docs/plant_operations_dashboard_CTP_Technical_Amended_Inventory 1.html.
 *
 * Filter model: { tt, st:[statusKey], sec:"All"|section, pt:{sec:[..]}, item:{sec:[..]} }
 * An empty list means "no restriction". Every figure on the page is
 * derived from the same filtered lot rows, so summary, insight cards,
 * drill and section tables reconcile.
 */

/**
 * Flatten the master payload into lot facts + item rows. Item and lot
 * rows share field names so one predicate filters both.
 *
 * @param {object} raw - Inventory master payload
 * @returns {object} indexed model
 */
export function buildCtpInventoryModel(raw) {
  const statuses = raw.status_master;
  const stByKey = {};
  statuses.forEach((s) => {
    stByKey[s.key] = s;
  });
  const facts = [];
  const itemList = [];
  const ptMeta = {};
  raw.sections.forEach((s) =>
    s.product_types.forEach((pt) => {
      ptMeta[`${s.name}|${pt.name}`] = {
        sec: s.name,
        pt: pt.name,
        uom: pt.uom,
        tt: pt.tyre_type,
        sub: pt.sub_section,
      };
      pt.items.forEach((it) => {
        itemList.push({
          sec: s.name,
          pt: pt.name,
          item: it.item_code,
          tt: it.tyre_type,
          uom: it.uom,
          cons: Number(it.daily_consumption) || 0,
        });
        it.lots.forEach((l) =>
          facts.push({
            sec: s.name,
            pt: pt.name,
            item: it.item_code,
            tt: it.tyre_type,
            uom: it.uom,
            qty: Number(l.quantity) || 0,
            st: l.status,
            mhe: l.mhe_code,
            age: Number(l.age_days) || 0,
            lot: l.lot_id,
          }),
        );
      });
    }),
  );
  const uomDisplay = raw.uom_display || {};
  return {
    raw,
    statuses,
    stByKey,
    usable: new Set(statuses.filter((s) => s.usable).map((s) => s.key)),
    blocked: new Set(statuses.filter((s) => s.blocked).map((s) => s.key)),
    sections: raw.sections.map((s) => ({
      name: s.name,
      accent: s.accent,
      pts: s.product_types.map((p) => p.name),
    })),
    cards: raw.insight_cards || [],
    table: raw.table || {},
    uomShort: (u) => uomDisplay[u] || String(u || "").toLowerCase(),
    facts,
    itemList,
    ptMeta,
  };
}

/**
 * @param {string} [tyreType]
 * @returns {object} filter with no restrictions beyond tyre type
 */
export function emptyCtpFilter(tyreType) {
  return { tt: tyreType || "All", st: [], sec: "All", pt: {}, item: {} };
}

/**
 * Sections where the user narrowed product type / item code. With
 * "All Sections" selected, those picks focus the page on their sections.
 */
function focusedSections(f) {
  return Object.keys(f.pt)
    .filter((s) => f.pt[s].length)
    .concat(Object.keys(f.item).filter((s) => f.item[s].length));
}

/**
 * Row predicate. `skip` ignores a dimension ({ st, sec, pt, item }) —
 * used for option counts and days cover.
 *
 * @param {object} f - filter
 * @param {object} r - lot fact or item row
 * @param {object} [skip]
 * @param {string[]} [foc] - precomputed focused sections
 * @returns {boolean}
 */
export function passesCtpFilter(f, r, skip = {}, foc = focusedSections(f)) {
  if (f.tt && f.tt !== "All" && r.tt !== f.tt) return false;
  if (!skip.st && r.st !== undefined && f.st.length && !f.st.includes(r.st))
    return false;
  if (!skip.sec && f.sec !== "All" && r.sec !== f.sec) return false;
  if (!skip.sec && f.sec === "All" && foc.length && !foc.includes(r.sec))
    return false;
  const p = f.pt[r.sec];
  if (!skip.pt && p && p.length && !p.includes(r.pt)) return false;
  const i = f.item[r.sec];
  if (!skip.item && i && i.length && !i.includes(r.item)) return false;
  return true;
}

/**
 * @returns {object[]} lot facts that pass the filter
 */
export function selectCtpLots(m, f, skip) {
  const foc = focusedSections(f);
  return m.facts.filter((r) => passesCtpFilter(f, r, skip, foc));
}

/**
 * Total_Inventory = SUM(quantity) · MHE_Count = COUNT(DISTINCT mhe_code).
 *
 * @returns {{ qty: number, mhe: number, lots: number }}
 */
export function summarizeCtpLots(rows) {
  let qty = 0;
  const mhe = new Set();
  rows.forEach((r) => {
    qty += r.qty;
    if (r.mhe) mhe.add(r.mhe);
  });
  return { qty, mhe: mhe.size, lots: rows.length };
}

/**
 * @returns {Record<string, number>} quantity per status key
 */
export function qtyByStatus(m, rows) {
  const o = {};
  m.statuses.forEach((s) => {
    o[s.key] = 0;
  });
  rows.forEach((r) => {
    o[r.st] = (o[r.st] || 0) + r.qty;
  });
  return o;
}

/**
 * @param {object[]} rows
 * @param {string} key - field to group by
 * @returns {Record<string, number>} quantity per key value
 */
export function qtyBy(rows, key) {
  const o = {};
  rows.forEach((r) => {
    o[r[key]] = (o[r[key]] || 0) + r.qty;
  });
  return o;
}

/**
 * Days cover = usable qty ÷ daily consumption, per item or per
 * section|product type. The status filter is ignored on purpose:
 * cover measures what can be issued, which Hold / Expired never can.
 *
 * @param {object} m
 * @param {object} f
 * @param {"item"|"pt"} level
 * @returns {Record<string, { usable: number, cons: number, days: number|null }>}
 */
export function daysCover(m, f, level) {
  const key = (r) => (level === "item" ? r.item : `${r.sec}|${r.pt}`);
  const usable = {};
  const cons = {};
  m.itemList.forEach((it) => {
    if (!passesCtpFilter(f, it, { st: true })) return;
    cons[key(it)] = (cons[key(it)] || 0) + it.cons;
  });
  m.facts.forEach((r) => {
    if (!m.usable.has(r.st) || !passesCtpFilter(f, r, { st: true })) return;
    usable[key(r)] = (usable[key(r)] || 0) + r.qty;
  });
  const o = {};
  Object.keys(cons).forEach((k) => {
    o[k] = {
      usable: usable[k] || 0,
      cons: cons[k],
      days: cons[k] ? (usable[k] || 0) / cons[k] : null,
    };
  });
  return o;
}

/**
 * @param {number} days
 * @returns {"red"|"amber"|"green"} tone for a days-cover value
 */
export function coverTone(days) {
  if (days < 1) return "red";
  if (days < 2) return "amber";
  return "green";
}

/**
 * One row per item: qty per status, distinct MHE, oldest lot age.
 *
 * @returns {object[]}
 */
export function aggregateByItem(m, rows) {
  const o = {};
  rows.forEach((r) => {
    let a = o[r.item];
    if (!a) {
      a = {
        item: r.item,
        sec: r.sec,
        pt: r.pt,
        uom: r.uom,
        qty: 0,
        st: {},
        mheSet: new Set(),
        maxAge: 0,
        lots: 0,
      };
      m.statuses.forEach((s) => {
        a.st[s.key] = 0;
      });
      o[r.item] = a;
    }
    a.qty += r.qty;
    a.st[r.st] += r.qty;
    if (r.mhe) a.mheSet.add(r.mhe);
    a.maxAge = Math.max(a.maxAge, r.age);
    a.lots += 1;
  });
  return Object.values(o).map((a) => ({ ...a, mhe: a.mheSet.size }));
}

function coverBelowCard(m, f, cfg) {
  const cv = daysCover(m, f, "pt");
  const short = Object.keys(cv)
    .filter((k) => cv[k].days != null && cv[k].days < cfg.threshold_days)
    .sort((a, b) => cv[a].days - cv[b].days);
  const ci = daysCover(m, f, "item");
  const drill = m.itemList
    .filter(
      (it) =>
        short.includes(`${it.sec}|${it.pt}`) &&
        passesCtpFilter(f, it, { st: true }),
    )
    .map((it) => ({
      item: it.item,
      qty: ci[it.item] ? ci[it.item].usable : 0,
      uom: it.uom,
    }));
  return {
    value: short.length,
    sub: `of ${Object.keys(cv).length} product types`,
    isBad: short.length > 0,
    drill,
    chips: short.map((k) => ({ k: k.split("|")[1], d: cv[k].days })),
  };
}

function statusQtyCard(m, rows, cfg) {
  const r = rows.filter((x) => x.st === cfg.status);
  const s = summarizeCtpLots(r);
  return {
    value: s.qty,
    sub: `${s.lots} lots · ${s.mhe} MHE`,
    isBad: s.qty > 0,
    drill: aggregateByItem(m, r).map((a) => ({
      item: a.item,
      qty: a.qty,
      uom: a.uom,
    })),
  };
}

function oldestBlockedCard(m, rows, cfg) {
  const r = rows.filter((x) => m.blocked.has(x.st));
  const top = r.reduce((a, x) => (!a || x.age > a.age ? x : a), null);
  return {
    value: top ? top.age : null,
    sub: top ? `${top.item} · ${m.stByKey[top.st].label}` : "no blocked lots",
    isBad: Boolean(top) && top.age > cfg.warn_days,
    drill: aggregateByItem(m, r)
      .sort((a, b) => b.maxAge - a.maxAge)
      .map((a) => ({ item: a.item, qty: a.qty, uom: a.uom, age: a.maxAge })),
  };
}

/**
 * Insight card value + drill rows, driven by insight_cards[].type.
 *
 * @returns {object|null} null for an unknown card type
 */
export function computeInsightCard(m, f, rows, cfg) {
  if (cfg.type === "cover_below") return coverBelowCard(m, f, cfg);
  if (cfg.type === "status_qty") return statusQtyCard(m, rows, cfg);
  if (cfg.type === "oldest_blocked") return oldestBlockedCard(m, rows, cfg);
  return null;
}

// Master payload colour tokens (status_master[].color, sections[].accent,
// insight_cards[].color) → keys of theme.custom.brand.
const TOKEN_TO_BRAND = {
  ac: "orange",
  tl: "teal",
  bl: "blue",
  rd: "red",
  am: "amber",
  gn: "green",
  pp: "purple",
  cy: "ocean",
};

/**
 * @param {object} theme - MUI theme (with theme.custom.brand)
 * @param {string} token - master payload colour token
 * @returns {string} colour from the theme; the primary accent if unknown
 */
export function ctpTokenColor(theme, token) {
  const brand = theme.custom.brand;
  return brand[TOKEN_TO_BRAND[token]] || brand.orange;
}
