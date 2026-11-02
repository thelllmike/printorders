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
  paid: boolean;
  printedCopies: number;
  createdAt: string;
  updatedAt: string;
  files: OrderFile[];
  photos: OrderFile[];
  unreadMessages: number;
};

export type Presence = {
  online: boolean;
  lastSeen: string | null;
};

export type Message = {
  id: number;
  sender: "customer" | "shop";
  text: string;
  createdAt: string;
};

export type OrderChanges = {
  status?: Status;
  paid?: boolean;
  printedCopies?: number;
};

export const MAX_FILE_MB = 50;
export const MAX_TOTAL_MB = 200;
export const MAX_FILES = 20;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_QUANTITY = 9999;
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_MB = 20;
export const MAX_MESSAGE_LENGTH = 1000;
