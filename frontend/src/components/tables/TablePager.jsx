import { Button, MenuItem, Select, Stack, Typography } from "@mui/material";

/**
 * Page sizes offered by default.
 *
 * Capped at 100 because that is the tightest server-side clamp in play —
 * /plants/:id/production/drills/scrap-traceability clamps `limit` to [1, 100]
 * and silently truncates anything larger, which would make a "250" page look
 * full at 100 rows and strand the pager one page short. Surfaces backed by
 * /dashboard/kpi-data (limit <= 10000) may pass a longer list explicitly.
 */
const DEFAULT_PAGE_SIZES = [25, 50, 100];

/**
 * Shared pager for the server-paginated drill tables.
 *
 * The raw LIMIT/OFFSET model carries no total row count, so there is no last
 * page to jump to: `hasMore` (the last page came back full) is the only signal
 * that another page exists. The page dropdown therefore lists the pages walked
 * so far plus the next one when `hasMore`.
 *
 * @param {object} props
 * @param {number} props.page - current page, 0-indexed
 * @param {number} props.pageSize - rows requested per page
 * @param {boolean} props.hasMore - the current page came back full
 * @param {(page: number) => void} props.onPageChange
 * @param {(size: number) => void} props.onPageSizeChange - must also reset the
 *   page to 0: OFFSET is expressed in rows, so an unchanged page index points
 *   at a different slice once the size changes.
 * @param {number[]} [props.pageSizeOptions]
 * @param {boolean} [props.disabled] - a fetch is in flight
 */
export default function TablePager({
  page,
  pageSize,
  hasMore,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  disabled = false,
}) {
  const selectSx = {
    minWidth: 76,
    "& .MuiSelect-select": { py: 0.55, fontSize: 12 },
  };
  const labelSx = { fontSize: 12, color: "text.secondary" };
  // Sizes walked past still need to be selectable, so a caller-supplied
  // pageSize outside the option list is folded in rather than dropped (an
  // unlisted value would render the Select blank).
  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="flex-end"
      spacing={1.5}
      useFlexGap
      flexWrap="wrap"
      sx={{ pt: 0.5 }}
    >
      <Typography component="span" sx={labelSx}>
        Rows per page
      </Typography>
      <Select
        size="small"
        value={pageSize}
        disabled={disabled}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        sx={selectSx}
      >
        {sizes.map((n) => (
          <MenuItem key={n} value={n}>
            {n}
          </MenuItem>
        ))}
      </Select>

      <Button
        size="small"
        variant="outlined"
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={disabled || page <= 0}
      >
        Prev
      </Button>
      <Typography component="span" sx={labelSx}>
        Page
      </Typography>
      <Select
        size="small"
        value={page}
        disabled={disabled}
        onChange={(e) => onPageChange(Number(e.target.value))}
        sx={selectSx}
      >
        {Array.from({ length: page + (hasMore ? 2 : 1) }, (_, i) => (
          <MenuItem key={i} value={i}>
            {i + 1}
          </MenuItem>
        ))}
      </Select>
      <Button
        size="small"
        variant="outlined"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || !hasMore}
      >
        Next
      </Button>
    </Stack>
  );
}
