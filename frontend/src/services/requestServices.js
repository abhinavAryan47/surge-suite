import api from './api';

export const requestServices = {
  list: (params = {}) => api.get('/requests/', { params }),
  retrieve: (id) => api.get(`/requests/${id}/`),
  create: (data) => api.post('/requests/', data),
  archive: (id) => api.post(`/requests/${id}/archive/`),
};

export const reviewCenterServices = {
  list: (params = {}) => api.get('/review-center/', { params }),
  startReview: (id) => api.post(`/review-center/${id}/start-review/`),
  escalate: (id, data) => api.post(`/review-center/${id}/escalate/`, data),
  approve: (id, data) => api.post(`/review-center/${id}/approve/`, data),
  reject: (id, data) => api.post(`/review-center/${id}/reject/`, data),
};

export const notificationServices = {
  list: (params = {}) => api.get('/notifications/', { params }),
  unreadCount: (workspace_id) => api.get('/notifications/unread-count/', { params: { workspace_id } }),
  markRead: (id) => api.post(`/notifications/${id}/read/`),
  markAllRead: (workspace_id) => api.post('/notifications/mark-all-read/', { workspace_id }),
};
