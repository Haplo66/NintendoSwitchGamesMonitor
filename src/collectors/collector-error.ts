export class CollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectorError';
  }
}
