// An error with an HTTP status and a stable machine-readable code, so the
// frontend can react to specific failures (e.g. show "wrong PIN, 2 tries left").
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new AppError(400, 'VALIDATION_ERROR', message, extra);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
