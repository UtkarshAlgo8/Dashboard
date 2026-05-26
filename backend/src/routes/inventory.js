import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { inventoryQuery } from "../queries.js";
import { toInventory } from "../transformers.js";

export const router = Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/inventory`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = inventoryQuery({
        plant: "Banmore",
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      return toInventory(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
