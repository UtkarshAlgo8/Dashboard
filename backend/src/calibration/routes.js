import { Router } from "express";
import { runQuery, UpstreamError } from "../utils/upstream.js";
import { cached } from "../utils/cache.js";
import {
  calibrationToday,
  calibrationQuery,
  calibrationResult,
} from "./queries.js";

/** Fixed BTP snapshot: header dates, shifts and plant overrides are not supported. */
export function createCalibrationRouter(
  query = runQuery,
  clock = () => new Date(),
) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    if (Object.keys(req.query).length)
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Calibration Due accepts no filters; it uses today in IST for BTP.",
        },
      });
    try {
      const asOfDate = calibrationToday(clock());
      const data = await cached(
        `calibration:v1:BTP:${asOfDate}`,
        async () =>
          calibrationResult(
            await query(calibrationQuery(asOfDate), {
              engine: "athena",
              tables: [],
            }),
            asOfDate,
          ),
        60000,
      );
      res.json({ data });
    } catch (error) {
      if (/TABLE_NOT_FOUND/i.test(error.message))
        return next(
          new UpstreamError(
            "Calibration source unavailable. The BTP calibration Silver table must be provisioned in Athena.",
            { type: "CALIBRATION_SOURCE_UNAVAILABLE", status: 502 },
          ),
        );
      next(error);
    }
  });
  return router;
}

export const router = createCalibrationRouter();
