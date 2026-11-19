import test from "node:test";
import assert from "node:assert/strict";

test("telemetry export removes SQL literals, URL secrets and exception messages", async () => {
  const { sanitizeAttributes, sanitizeSpan } =
    await import("./telemetry-sanitize.js");
  assert.deepEqual(
    sanitizeAttributes({
      "http.url":
        "https://api.example/auth/reset-password/private-token?key=secret#fragment",
      "db.statement": "SELECT * FROM users WHERE email='private@example.com'",
      "http.request.header.authorization": "Bearer secret",
      "http.status_code": 500,
    }),
    {
      "http.url": "https://api.example/auth/reset-password/[redacted]",
      "http.status_code": 500,
      "db.statement": "SELECT * FROM users WHERE email=?",
    },
  );
  const original = {
    attributes: { "db.query.text": "SELECT 1", "db.system": "mysql" },
    events: [
      {
        name: "exception",
        time: [1, 0],
        attributes: {
          "exception.type": "Error",
          "exception.message": "secret",
          "exception.stacktrace": "secret",
        },
      },
    ],
    status: { code: 2, message: "secret" },
    name: "GET /auth/reset-password/private-token?key=secret",
  };
  const clean = sanitizeSpan(original);
  assert.deepEqual(clean.attributes, {
    "db.system": "mysql",
    "db.query.text": "SELECT ?",
  });
  assert.deepEqual(clean.events[0].attributes, { "exception.type": "Error" });
  assert.deepEqual(clean.status, { code: 2 });
  assert.equal(clean.name, "GET /auth/reset-password/[redacted]");
  assert.equal(original.attributes["db.query.text"], "SELECT 1");
});
