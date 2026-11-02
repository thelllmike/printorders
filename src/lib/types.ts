export const STATUSES = ["pending", "ongoing", "ready"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  ongoing: "Ongoing",
  ready: "Ready",
};

export type OrderFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type Order = {
  id: number;
  quantity: number;
  note: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  files: OrderFile[];
};

export const MAX_FILE_MB = 50;
export const MAX_TOTAL_MB = 200;
export const MAX_FILES = 20;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_QUANTITY = 9999;
