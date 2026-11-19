// Export-time defense: instrumentation must never export payloads or credentials.
export function sanitizeUrl(value) {
  return String(value)
    .split(/[?#]/, 1)[0]
    .replace(/(\/reset-password\/)[^/\s]+/gi, "$1[redacted]")
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1");
}

export function maskSql(value) {
  return String(value)
    .replace(/(['"])(?:\\[\s\S]|(?!\1)[^\\])*?\1/g, "?")
    .replace(/\/\*[\s\S]*?\*\/|--[^\n]*|#[^\n]*/g, "")
    .replace(/\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi, "?");
}

export function sanitizeAttributes(attributes = {}) {
  return Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      if (
        /^(url\.(query|fragment)|exception\.(message|stacktrace))$/.test(key) ||
        /header|password|token|cookie|body|db\.redis\.args/i.test(key)
      )
        return [];
      if (/^db\.(statement|query\.text)$/.test(key))
        return [[key, maskSql(value)]];
      return [
        [
          key,
          /url|target|route/i.test(key) && typeof value === "string"
            ? sanitizeUrl(value)
            : value,
        ],
      ];
    }),
  );
}

export function sanitizeSpan(span) {
  // Keep ReadableSpan's prototype/getters (spanContext, duration, etc.).
  const clean = Object.create(span);
  Object.defineProperties(clean, {
    name: { value: sanitizeUrl(span.name) },
    attributes: { value: sanitizeAttributes(span.attributes) },
    events: {
      value: span.events.map((event) => ({
        ...event,
        attributes: sanitizeAttributes(event.attributes),
      })),
    },
    status: { value: { code: span.status.code } },
  });
  return clean;
}

export function sanitizingExporter(exporter) {
  return {
    export(spans, callback) {
      exporter.export(spans.map(sanitizeSpan), callback);
    },
    shutdown() {
      return exporter.shutdown();
    },
    forceFlush() {
      return exporter.forceFlush?.() ?? Promise.resolve();
    },
  };
}
