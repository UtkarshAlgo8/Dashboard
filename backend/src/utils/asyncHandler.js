/**
 * Wraps an async route handler so thrown errors / rejections
 * flow into the Express error middleware.
 */
export const asyncHandler = (requestHandler) => (req, res, next) => {
  Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
};
