import client from "./client.js";

/** Live BTP calibration snapshot; dashboard period/shift filters never enter this request. */
export async function getCalibration() {
  const data = await client.get("/engineering/calibration");
  if (
    data?.context?.plant !== "BTP" ||
    data.context.plantCode !== "1300" ||
    data.context.timeZone !== "Asia/Kolkata" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.context.asOfDate) ||
    !Array.isArray(data.machines) ||
    !["dueThisWeek", "overdue", "ok"].every(
      (key) =>
        Number.isSafeInteger(data.summary?.[key]) && data.summary[key] >= 0,
    ) ||
    data.summary.dueThisWeek + data.summary.overdue + data.summary.ok !==
      data.machines.length
  )
    throw new Error("Calibration Due returned an incomplete BTP snapshot.");
  return data;
}
