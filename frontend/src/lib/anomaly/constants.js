export const CTP_PLANT = {
  id: "chennai",
  name: "Chennai Tyre Plant",
  code: "CTP",
};
export const ANOMALY_ROUTE = "/chennai/engineering/anomaly-detection";
export const MINUTE = 60000;
export const DAY = 86400000;
export const NAV_ITEMS = [
  ["home", "Home"],
  ["sensors", "Sensor health"],
  ["graph", "Failure graph"],
  ["trends", "Trends"],
  ["diagnoses", "Diagnoses & alerts"],
  ["hierarchy", "Hierarchy & coverage"],
];
export const SECTIONS = [
  "Extrusion",
  "Cooling line",
  "Skiver",
  "After skiver",
  "Drive trains",
  "Utilities",
];
export const VISIBILITY = {
  plc_iu: "PLC + vibration",
  plc: "PLC only",
  iu: "Vibration only (IU)",
  dead: "Tags dead",
  none: "No signal",
};
export const ANOMALY_STATES = ["Normal", "Watch", "Anomaly", "Unscored"];
export const DEFAULT_TREND_TAGS = [
  "3120_011_Take_off_roll_Speed_Actual",
  "1220_Extruder_GE200_Stock_Pressure",
];
