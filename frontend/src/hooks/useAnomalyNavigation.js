import { useSearchParams } from "react-router-dom";
import { DAY, NAV_ITEMS } from "@/lib/anomaly/constants.js";
import { clamp, formatTime, parseTime } from "@/lib/anomaly/model.js";

/** URL-backed screen, timeline, and drawer state: refresh/back/share all work. */
export default function useAnomalyNavigation(model) {
  const [params, setParams] = useSearchParams();
  const rawTime = parseTime(params.get("t"));
  const time = Number.isFinite(rawTime)
    ? clamp(rawTime, model.start, model.end)
    : model.end;
  const requestedView = params.get("view") ?? "home";
  const sub = params.get("sub");
  const view =
    requestedView === "sub" && model.equipment[sub]
      ? "sub"
      : NAV_ITEMS.some(([id]) => id === requestedView)
        ? requestedView
        : "home";
  const preset = ["1", "3", "7", "all"].includes(params.get("r"))
    ? params.get("r")
    : "all";
  const rawFrom = parseTime(params.get("from"));
  const rawTo = parseTime(params.get("to"));
  const custom =
    Number.isFinite(rawFrom) &&
    Number.isFinite(rawTo) &&
    rawFrom < rawTo &&
    rawTo >= model.start &&
    rawFrom <= model.end;
  const from = custom
    ? clamp(rawFrom, model.start, model.end)
    : preset === "all"
      ? model.start
      : Math.max(model.start, time - Number(preset) * DAY);
  const to = custom
    ? clamp(rawTo, model.start, model.end)
    : preset === "all"
      ? model.end
      : time;
  const update = (patch, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(patch).forEach(([key, value]) => {
          if (value == null || value === "") next.delete(key);
          else next.set(key, String(value));
        });
        return next;
      },
      { replace },
    );
  return {
    time,
    view,
    sub,
    preset,
    from,
    to,
    custom,
    action: ["USE", "DOWNWEIGHT", "EXCLUDE", "NO DATA"].includes(
      params.get("action"),
    )
      ? params.get("action")
      : null,
    status: ["GOOD", "SUSPECT", "BAD", "NO DATA"].includes(params.get("status"))
      ? params.get("status")
      : null,
    tab: params.get("tab"),
    modeId: params.get("fm"),
    episodeId: params.get("ep"),
    tagId: params.get("tag"),
    hideStops: params.get("stops") !== "show",
    update,
    go: (nextView, id = null, extras = {}) =>
      update({
        view: nextView === "home" ? null : nextView,
        sub: id,
        fm: null,
        ep: null,
        tag: null,
        tab: null,
        status: null,
        action: null,
        ...extras,
      }),
    setTime: (value) => {
      if (!Number.isFinite(value)) return;
      const next = clamp(value, model.start, model.end);
      update(
        {
          t: next >= model.end ? null : formatTime(next),
          ...(custom && (next < from || next > to)
            ? { from: null, to: null }
            : {}),
        },
        true,
      );
    },
    latest: () => update({ t: null, from: null, to: null }, true),
    setPreset: (value) =>
      update({ r: value === "all" ? null : value, from: null, to: null }, true),
    setWindow: (a, b) => {
      const left = clamp(Math.min(a, b), model.start, model.end);
      const right = clamp(Math.max(a, b), model.start, model.end);
      if (right > left)
        update(
          {
            from: formatTime(left),
            to: formatTime(right),
            t:
              time < left || time > right ? formatTime(right) : params.get("t"),
          },
          true,
        );
    },
    openMode: (id, episode = null) =>
      update({ fm: id, ep: episode, tag: null }),
    openTag: (id) => update({ tag: id, fm: null, ep: null }),
    closeDrawer: () => update({ fm: null, tag: null, ep: null }),
  };
}
