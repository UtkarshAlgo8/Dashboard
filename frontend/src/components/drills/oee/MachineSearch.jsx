import { IconButton, InputAdornment, TextField } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Free-text search input for the machine table (BRD FR-P28, FR-P29).
 * Parent owns the value; this component is purely controlled.
 */
function MachineSearch({ value, onChange }) {
  return (
    <TextField
      size="small"
      placeholder="Search machine…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ width: 240 }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={() => onChange("")}
              aria-label="Clear search"
            >
              <ClearIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </InputAdornment>
        ) : null,
        sx: { fontSize: 13 },
      }}
    />
  );
}

export default MachineSearch;
