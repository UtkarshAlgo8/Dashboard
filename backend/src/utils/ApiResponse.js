/**
 * Uniform success-envelope class used by the auth slice.
 * Shape: { statusCode, data, message, success }.
 */
export class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}
