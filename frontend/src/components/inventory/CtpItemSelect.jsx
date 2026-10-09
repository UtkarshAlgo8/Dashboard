import { useState } from "react";
import {
  Box,
  ButtonBase,
  Checkbox,
  FormControlLabel,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

/**
 * Item_Code multi-select: (All) · single · multiple, with search.
 * An empty `value` means "All".
 *
 * @param {object} props
 * @param {string[]} props.options
 * @param {string[]} props.value
 * @param {(next: string[]) => void} props.onChange
 */
function CtpItemSelect({ options, value, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const [query, setQuery] = useState("");
  const hasValue = value.length > 0;
  const shown = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );
  const label = !hasValue
    ? "(All)"
    : value.length <= 3
      ? value.join(", ")
      : `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  const handleToggle = (o) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        title={value.join(", ") || "All item codes"}
        sx={{
          px: 1.25,
          py: 0.6,
          minWidth: 170,
          maxWidth: 280,
          justifyContent: "space-between",
          gap: 1,
          borderRadius: 1,
          border: 1,
          borderColor: hasValue ? "primary.main" : "divider",
          backgroundColor: hasValue ? "primary.light" : "background.paper",
          color: "text.primary",
          fontFamily: "inherit",
          fontSize: 12.5,
          fontWeight: hasValue ? 700 : 500,
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
          {`Item_Code: ${label}`}
        </Box>
        <ArrowDropDownIcon sx={{ fontSize: 18, color: "text.disabled" }} />
      </ButtonBase>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 250, p: 0.75, mt: 0.5 } } }}
      >
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item code…"
          sx={{ mb: 0.5, "& input": { fontSize: 12.5, py: 0.75 } }}
        />
        <Box sx={{ maxHeight: 240, overflowY: "auto" }}>
          <ItemOption
            label="(All)"
            isChecked={!hasValue}
            onToggle={() => onChange([])}
            isBold
          />
          {shown.map((o) => (
            <ItemOption
              key={o}
              label={o}
              isChecked={value.includes(o)}
              onToggle={() => handleToggle(o)}
            />
          ))}
          {!shown.length && (
            <Typography sx={{ p: 1, fontSize: 12, color: "text.disabled" }}>
              No match
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
}

function ItemOption({ label, isChecked, onToggle, isBold }) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={isChecked}
          onChange={onToggle}
          sx={{ p: 0.5 }}
        />
      }
      label={label}
      sx={{
        display: "flex",
        mx: 0,
        px: 0.5,
        "& .MuiFormControlLabel-label": {
          fontSize: 12.5,
          fontWeight: isBold ? 700 : 500,
          fontFamily: isBold ? "inherit" : "ui-monospace, Menlo, monospace",
        },
      }}
    />
  );
}

export default CtpItemSelect;
