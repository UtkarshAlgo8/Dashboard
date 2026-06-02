/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
}
