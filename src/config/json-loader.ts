import * as fs from 'node:fs';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadJsonFile<T>(filePath: string): T {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ConfigError(`Failed to read config file "${filePath}": ${(error as Error).message}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new ConfigError(`Malformed JSON in config file "${filePath}": ${(error as Error).message}`);
  }
}
