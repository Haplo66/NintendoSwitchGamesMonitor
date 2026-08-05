export interface BlacklistEntry {
  title: string;
  reason?: string;
}

export interface Blacklist {
  entries: BlacklistEntry[];
}
