/**
 * The export service's request body: `record` as JSON (photos replaced by
 * their file names) plus the `before` / `after` photo files.
 */
export function toPdfFormData(record) {
  const fd = new FormData();
  const { evidence, ...rest } = record;
  fd.append(
    "record",
    JSON.stringify({
      ...rest,
      evidence: {
        before: evidence.before ? evidence.before.name || "before" : null,
        after: evidence.after ? evidence.after.name || "after" : null,
      },
    }),
  );
  if (evidence.before instanceof Blob)
    fd.append("before", evidence.before, evidence.before.name || "before.jpg");
  if (evidence.after instanceof Blob)
    fd.append("after", evidence.after, evidence.after.name || "after.jpg");
  return fd;
}
