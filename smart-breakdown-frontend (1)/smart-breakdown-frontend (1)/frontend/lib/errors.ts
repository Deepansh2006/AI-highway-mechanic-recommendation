export class ApiError extends Error {
  constructor(message: string, public status = 400, public detail?: unknown) {
    super(message);
  }
}
