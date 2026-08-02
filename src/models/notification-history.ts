export type NotificationType = 'deal' | 'free' | 'wishlist';

export interface NotificationRecord {
  gameId: string;
  title: string;
  notificationType: NotificationType;
  score: number;
  price: number;
  notifiedAt: string;
}

export interface NotificationHistory {
  records: NotificationRecord[];
}
