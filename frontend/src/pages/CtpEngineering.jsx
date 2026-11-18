import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import TroubleshootOutlinedIcon from "@mui/icons-material/TroubleshootOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import { ENGINEERING_TABS } from "@/lib/mockData.js";
import { CTP_PLANT, ANOMALY_ROUTE } from "@/lib/anomaly/constants.js";

const SECTIONS = [
  ...ENGINEERING_TABS.map((tab) => ({
    id: tab.id,
    label: tab.name,
    disabled: true,
    disabledTooltip: "Not available for CTP yet",
  })),
  { id: "anomaly", label: "Anomaly Detection" },
];

export default function CtpEngineering() {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <ProductionHeader plant={CTP_PLANT} showSecondaryNav={false} />
      <Box component="main" sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ overflowX: "auto", mb: 3 }}>
          <Tabs
            value={false}
            onChange={() => navigate(ANOMALY_ROUTE)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="CTP Engineering sections"
            sx={{
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 999,
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            {SECTIONS.map((section) => (
              <Tab
                key={section.id}
                value={section.id}
                label={section.label}
                disabled={section.disabled}
                sx={{ textTransform: "none", fontSize: 14, minHeight: 44 }}
              />
            ))}
          </Tabs>
        </Box>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, maxWidth: 760 }}>
          <Stack spacing={2} alignItems="flex-start">
            <TroubleshootOutlinedIcon color="primary" sx={{ fontSize: 36 }} />
            <Typography variant="h5" component="h2" fontWeight={700}>
              Anomaly Detection
            </Typography>
            <Typography color="text.secondary">
              Explore Quintoplex equipment health, sensor trust, failure-mode
              evidence, and historical diagnoses.
            </Typography>
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate(ANOMALY_ROUTE)}
            >
              Open Anomaly Detection
            </Button>
            <Typography variant="caption" color="text.secondary">
              Other Engineering sections are not available for CTP yet.
            </Typography>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
