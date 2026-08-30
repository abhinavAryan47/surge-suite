import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  ArrowUpRight, 
  Eye, 
  Building2, 
  Wrench, 
  Award, 
  FileText,
  X,
  AlertCircle,
  Check,
  ChevronRight,
  User,
  Shield,
  Layers,
  Sparkles,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { reviewCenterServices, requestServices } from '../services/requestServices';

const REQUEST_TYPE_ICONS = {
  CERTIFICATE: Award,
  GRIEVANCE: ShieldAlert,
  MAINTENANCE: Wrench,
  LAB_BOOKING: Building2,
  GENERAL: FileText,
};

const DECISION_STATUS_STYLES = {
  SUBMITTED: { bg: 'rgba(234, 179, 8, 0.1)', color: 'var(--status-warning, #eab308)', label: 'Submitted' },
  UNDER_REVIEW: { bg: 'rgba(59, 130, 246, 0.1)', color: 'var(--status-info, #3b82f6)', label: 'Under Review' },
  ESCALATED: { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', label: 'Escalated to Owner' },
  APPROVED: { bg: 'rgba(34, 197, 94, 0.1)', color: 'var(--status-success, #22c55e)', label: 'Approved' },
  REJECTED: { bg: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-error, #ef4444)', label: 'Rejected' },
};

export default function ReviewCenterTab({ workspace, userRole = 'ADMIN', initialRequestId = null }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter queues
  const [activeQueue, setActiveQueue] = useState('pending'); // pending | escalated | history
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Action Modals
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionType, setActionType] = useState(null); // 'escalate' | 'approve' | 'reject' | 'detail'
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const isOwner = userRole === 'OWNER';

  const fetchQueueRequests = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        workspace_id: workspace.id,
        queue: activeQueue,
      };
      if (selectedType !== 'ALL') {
        params.request_type = selectedType;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await reviewCenterServices.list(params);
      setRequests(res.data || []);

      if (initialRequestId && !selectedRequest) {
        const found = (res.data || []).find(r => r.id === initialRequestId || r.display_id === initialRequestId);
        if (found) {
          setSelectedRequest(found);
          setActionType('detail');
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to load review queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueRequests();
  }, [workspace?.id, activeQueue, selectedType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchQueueRequests();
  };

  const handleStartReview = async (reqId) => {
    try {
      await reviewCenterServices.startReview(reqId);
      fetchQueueRequests();
    } catch (err) {
      console.error("Failed to start review:", err);
    }
  };

  const handleExecuteAction = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !actionType) return;

    if ((actionType === 'escalate' || actionType === 'reject') && !actionReason.trim()) {
      setActionError(`A reason is required to ${actionType} this request.`);
      return;
    }

    setActionLoading(true);
    setActionError('');

    try {
      if (actionType === 'escalate') {
        await reviewCenterServices.escalate(selectedRequest.id, { reason: actionReason.trim() });
      } else if (actionType === 'approve') {
        await reviewCenterServices.approve(selectedRequest.id, { reason: actionReason.trim() });
      } else if (actionType === 'reject') {
        await reviewCenterServices.reject(selectedRequest.id, { reason: actionReason.trim() });
      }

      // Close modal and refresh
      setActionType(null);
      setSelectedRequest(null);
      setActionReason('');
      fetchQueueRequests();
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.error || `Failed to ${actionType} request.`);
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (req, type) => {
    setSelectedRequest(req);
    setActionType(type);
    setActionReason('');
    setActionError('');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header section */}
      <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Institutional Review Center
            </h1>
            <span style={{
              fontSize: '11px',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '6px',
              background: isOwner ? 'rgba(168,85,247,0.12)' : 'var(--bg-hover)',
              color: isOwner ? '#a855f7' : 'var(--text-primary)',
              textTransform: 'uppercase',
            }}>
              {isOwner ? "Workspace Owner" : "Admin Reviewer"}
            </span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Review, escalate, authorize, or reject institutional cases with verified execution proofs and audit logs.
          </p>
        </div>
      </header>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '8px',
          color: 'var(--status-error)',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Queue Selection & Filters Bar */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-medium)',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Queue Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px' }}>
          {[
            { key: 'pending', label: 'Pending Review' },
            { key: 'escalated', label: 'Escalated to Owner' },
            { key: 'history', label: 'Decision History' },
          ].map(queue => {
            const isActive = activeQueue === queue.key;
            return (
              <button
                key={queue.key}
                onClick={() => setActiveQueue(queue.key)}
                style={{
                  background: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? '600' : '500',
                  border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {queue.label}
              </button>
            );
          })}
        </div>

        {/* Right Search & Filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px', justifyContent: 'flex-end' }}>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">All Categories</option>
            <option value="CERTIFICATE">Certificates</option>
            <option value="GRIEVANCE">Grievances</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="LAB_BOOKING">Lab Bookings</option>
            <option value="GENERAL">General</option>
          </select>

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search ID, title, user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '6px 10px 6px 30px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none',
                width: '190px',
              }}
            />
          </form>

          <button
            onClick={fetchQueueRequests}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Refresh Queue"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Cases List */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', margin: 0 }}>Loading review queue...</p>
        </div>
      ) : requests.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: '12px',
          padding: '60px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <ShieldCheck size={36} strokeWidth={1.25} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
            No requests in this queue
          </h3>
          <p style={{ fontSize: '13px', marginTop: '6px', maxWidth: '400px', margin: '6px auto 0' }}>
            {activeQueue === 'pending' 
              ? "All submitted requests have been reviewed and resolved." 
              : activeQueue === 'escalated'
              ? "No escalated requests requiring Owner authorization."
              : "No historical decisions recorded yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {requests.map(req => {
            const Icon = REQUEST_TYPE_ICONS[req.request_type] || FileText;
            const statusConfig = DECISION_STATUS_STYLES[req.decision_status] || DECISION_STATUS_STYLES.SUBMITTED;
            const isEscalated = req.decision_status === 'ESCALATED';

            return (
              <div
                key={req.id}
                style={{
                  background: 'var(--bg-card)',
                  border: isEscalated ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--border-medium)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: isEscalated ? '0 4px 16px rgba(168,85,247,0.06)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Case Card Top Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                      }}>
                        {req.display_id}
                      </span>

                      <span style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <Icon size={12} />
                        {req.request_type.replace('_', ' ')}
                      </span>

                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>•</span>

                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={11} />
                        Requester: <strong>{req.requester_username}</strong>
                      </span>
                    </div>

                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px' }}>
                      {req.title}
                    </h3>

                    {req.description && (
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                        {req.description}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: statusConfig.bg,
                    color: statusConfig.color,
                    flexShrink: 0,
                  }}>
                    {statusConfig.label}
                  </span>
                </div>

                {/* Escalation Notes Banner if escalated */}
                {isEscalated && req.escalation_reason && (
                  <div style={{
                    background: 'rgba(168,85,247,0.06)',
                    border: '1px solid rgba(168,85,247,0.25)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}>
                    <AlertTriangle size={16} style={{ color: '#a855f7', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#a855f7', textTransform: 'uppercase' }}>
                        Escalated by {req.escalated_by_username || 'Admin'}
                      </span>
                      <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: '2px 0 0' }}>
                        {req.escalation_reason}
                      </p>
                    </div>
                  </div>
                )}

                {/* Decision Notes if resolved */}
                {req.decision_reason && (
                  <div style={{
                    background: req.decision_status === 'REJECTED' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                    border: `1px solid ${req.decision_status === 'REJECTED' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                  }}>
                    <strong>Decision Note:</strong> {req.decision_reason}
                  </div>
                )}

                {/* Card Action Controls */}
                <div style={{
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    Submitted: {new Date(req.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* View Details button */}
                    <button
                      onClick={() => openActionModal(req, 'detail')}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Eye size={13} />
                      Timeline
                    </button>

                    {/* Active Queue Actions */}
                    {activeQueue !== 'history' && (
                      <>
                        {req.decision_status === 'SUBMITTED' && (
                          <button
                            onClick={() => handleStartReview(req.id)}
                            style={{
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-medium)',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            Start Review
                          </button>
                        )}

                        {!isEscalated && (
                          <button
                            onClick={() => openActionModal(req, 'escalate')}
                            style={{
                              background: 'rgba(168,85,247,0.1)',
                              border: '1px solid rgba(168,85,247,0.3)',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              color: '#a855f7',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <ShieldAlert size={13} />
                            Escalate to Owner
                          </button>
                        )}

                        <button
                          onClick={() => openActionModal(req, 'reject')}
                          style={{
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            color: 'var(--status-error)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <XCircle size={13} />
                          Reject
                        </button>

                        <button
                          onClick={() => openActionModal(req, 'approve')}
                          style={{
                            background: 'var(--btn-primary-bg)',
                            color: 'var(--btn-primary-text)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckCircle2 size={13} />
                          Authorize & Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ACTION & DETAIL MODALS */}
      {actionType && selectedRequest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            width: actionType === 'detail' ? '640px' : '500px',
            maxWidth: '95vw',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                }}>
                  {selectedRequest.display_id}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {actionType === 'escalate' && "Escalate Case to Owner"}
                  {actionType === 'approve' && "Authorize & Approve Request"}
                  {actionType === 'reject' && "Reject Request"}
                  {actionType === 'detail' && "Case History & Timeline"}
                </span>
              </div>

              <button
                onClick={() => setActionType(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form / Body */}
            {actionType === 'detail' ? (
              <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  {selectedRequest.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  {selectedRequest.description}
                </p>

                {/* Audit events */}
                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>
                    Audit Trail Events
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '2px solid var(--border-medium)', paddingLeft: '14px' }}>
                    {(selectedRequest.timeline_events || []).map(ev => (
                      <div key={ev.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {ev.event_type.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                            {ev.actor_role} ({ev.actor_username || 'System'})
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {ev.message && (
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                            {ev.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteAction} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {actionError && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '6px',
                      color: 'var(--status-error)',
                      fontSize: '12px',
                    }}>
                      {actionError}
                    </div>
                  )}

                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    <strong>Case:</strong> {selectedRequest.title} (by {selectedRequest.requester_username})
                  </div>

                  {actionType === 'escalate' && (
                    <div style={{
                      background: 'rgba(168,85,247,0.06)',
                      border: '1px solid rgba(168,85,247,0.2)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}>
                      Escalating transfers this case directly to the <strong>Workspace Owner</strong> for final authorization. Please detail the policy or financial reason.
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      {actionType === 'approve' ? "Approval Notes (Optional)" : "Reason / Feedback *"}
                    </label>
                    <textarea
                      rows={4}
                      required={actionType !== 'approve'}
                      placeholder={
                        actionType === 'escalate' 
                          ? "Explain why this case requires Owner authorization..."
                          : actionType === 'reject'
                          ? "Provide reason for rejection (this will be sent to the requester)..."
                          : "Optional note or conditions for approval..."
                      }
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  background: 'var(--bg-secondary)',
                }}>
                  <button
                    type="button"
                    onClick={() => setActionType(null)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={actionLoading}
                    style={{
                      background: actionType === 'reject' ? 'var(--status-error)' : actionType === 'escalate' ? '#a855f7' : 'var(--btn-primary-bg)',
                      color: actionType === 'approve' ? 'var(--btn-primary-text)' : '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 18px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {actionLoading ? "Processing..." : `Confirm ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
