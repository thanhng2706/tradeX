import api from './client'

export interface NotificationItem {
  id: number
  deployment_id: number
  portfolio_id: number
  strategy_id: number
  strategy_name: string
  ticker: string
  type: string
  message: string
  created_at: string
  read: boolean
}

export interface NotificationsResponse {
  unread_count: number
  items: NotificationItem[]
}

export const notificationsApi = {
  list: (limit = 20) =>
    api.get<NotificationsResponse>('/notifications', { params: { limit } }).then((r) => r.data),

  markRead: () =>
    api.post<NotificationsResponse>('/notifications/mark-read').then((r) => r.data),
}
