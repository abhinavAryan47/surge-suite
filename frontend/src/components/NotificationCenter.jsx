import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  AlertCircle, 
  ShieldAlert, 
  Clock, 
  FileText, 
  CheckCircle2, 
  XCircle,
  Inbox
} from 'lucide-react';
import { notificationServices } from '../services/requestServices';

export default function NotificationCenter({ workspaceId, onSelectRequest }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchUnreadCount = async () => {
    if (!workspaceId) return;
    try {
      const res = await notificationServices.unreadCount(workspaceId);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  };

  const fetchNotifications = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await notificationServices.list({ workspace_id: workspaceId });
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, workspaceId]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationServices.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!workspaceId) return;
    try {
      await notificationServices.markAllRead(workspaceId);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleItemClick = (notif) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    if (notif.request && onSelectRequest) {
      onSelectRequest(notif.request, notif.notification_type);
      setOpen(false);
    }
  };

  const getIconForType = (type) => {
    switch (type) {
      case 'REQUEST_APPROVED':
      case 'REQUEST_COMPLETED':
        return <CheckCircle2 size={16} style={{ color: 'var(--status-success)', flexShrink: 0 }} />;
      case 'REQUEST_REJECTED':
      case 'REQUEST_FAILED':
        return <XCircle size={16} style={{ color: 'var(--status-error)', flexShrink: 0 }} />;
      case 'REQUEST_ESCALATED':
        return <ShieldAlert size={16} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />;
      case 'NEW_REQUEST':
        return <FileText size={16} style={{ color: 'var(--status-info)', flexShrink: 0 }} />;
      default:
        return <Bell size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Header Notification Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: open ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid var(--border-medium)',
          borderRadius: '8px',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          position: 'relative',
          transition: 'all 0.15s ease',
        }}
        title="Workspace Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--status-error, #ef4444)',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: '700',
            borderRadius: '10px',
            minWidth: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '46px',
          right: '0',
          width: '380px',
          maxWidth: '90vw',
          maxHeight: '480px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: '12px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Panel Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: 'var(--status-info-bg, rgba(59,130,246,0.1))',
                  color: 'var(--status-info, #3b82f6)',
                }}>
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Inbox size={28} strokeWidth={1.5} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <p style={{ fontSize: '13px', margin: 0, fontWeight: '500' }}>No notifications</p>
                <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.8 }}>You are all caught up in this workspace.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: n.request ? 'pointer' : 'default',
                    background: n.is_read ? 'transparent' : 'rgba(59,130,246,0.04)',
                    transition: 'background 0.15s ease',
                  }}
                  className="notification-item"
                >
                  <div style={{ marginTop: '2px' }}>
                    {getIconForType(n.notification_type)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: n.is_read ? '500' : '600',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <button
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: '2px',
                          }}
                          title="Mark as read"
                        >
                          <span style={{
                            display: 'inline-block',
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: 'var(--status-info, #3b82f6)',
                          }} />
                        </button>
                      )}
                    </div>

                    <p style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      margin: '4px 0 0',
                      lineHeight: '1.4',
                      wordBreak: 'break-word',
                    }}>
                      {n.message}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      {n.request_display_id && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '600',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'var(--bg-hover)',
                          color: 'var(--text-primary)',
                          fontFamily: 'monospace',
                        }}>
                          {n.request_display_id}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={11} />
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
