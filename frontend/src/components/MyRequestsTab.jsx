import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  ArrowUpRight, 
  Eye, 
  Calendar, 
  Building2, 
  Wrench, 
  Award, 
  HelpCircle,
  X,
  AlertCircle,
  Check,
  ChevronRight,
  User,
  Shield,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { requestServices } from '../services/requestServices';

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

export default function MyRequestsTab({ workspace, isViewer = false, initialRequestId = null }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Filter states
  const [activeStatusTab, setActiveStatusTab] = useState('ongoing'); // ongoing | approved | rejected | all
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create Form state
  const [createType, setCreateType] = useState('CERTIFICATE');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPayload, setCreatePayload] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchRequests = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        workspace_id: workspace.id,
        mine: 'true',
      };
      if (activeStatusTab !== 'all') {
        params.status_tab = activeStatusTab;
      }
      if (selectedType !== 'ALL') {
        params.request_type = selectedType;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await requestServices.list(params);
      setRequests(res.data || []);

      // If an initialRequestId is requested to open
      if (initialRequestId && !detailModalOpen) {
        const found = (res.data || []).find(r => r.id === initialRequestId || r.display_id === initialRequestId);
        if (found) {
          setSelectedRequest(found);
          setDetailModalOpen(true);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [workspace?.id, activeStatusTab, selectedType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchRequests();
  };

  const handleOpenDetail = async (req) => {
    setSelectedRequest(req);
    setDetailModalOpen(true);
    // Refresh full details with timeline
    try {
      const res = await requestServices.retrieve(req.id);
      setSelectedRequest(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      setCreateError("Title is required.");
      return;
    }
    setCreateSubmitting(true);
    setCreateError('');
    try {
      await requestServices.create({
        workspace_id: workspace.id,
        request_type: createType,
        title: createTitle.trim(),
        description: createDescription.trim(),
        payload: createPayload,
      });
      setCreateModalOpen(false);
      // Reset form
      setCreateTitle('');
      setCreateDescription('');
      setCreatePayload({});
      // Refresh list
      setActiveStatusTab('ongoing');
      fetchRequests();
    } catch (err) {
      console.error(err);
      setCreateError(err.response?.data?.error || "Failed to submit request.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header section */}
      <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
            My Requests & Inquiries
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Track your institutional requests, reviewer decisions, authorized execution results, and verified proofs.
          </p>
        </div>

        {!isViewer && (
          <button
            onClick={() => {
              setCreateError('');
              setCreateModalOpen(true);
            }}
            style={{
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 16px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={15} />
            New Request
          </button>
        )}
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

      {/* Tabs & Filters Bar */}
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
        {/* Status Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px' }}>
          {[
            { key: 'ongoing', label: 'Ongoing' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'all', label: 'All Requests' },
          ].map(tab => {
            const isActive = activeStatusTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStatusTab(tab.key)}
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
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right Search & Filter dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px', justifyContent: 'flex-end' }}>
          {/* Type dropdown */}
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

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by ID or title..."
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
            onClick={fetchRequests}
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
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', margin: 0 }}>Loading requests...</p>
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
          <FileText size={36} strokeWidth={1.25} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
            No requests found
          </h3>
          <p style={{ fontSize: '13px', marginTop: '6px', maxWidth: '400px', margin: '6px auto 0' }}>
            {activeStatusTab === 'ongoing' 
              ? "You don't have any ongoing requests. Click 'New Request' above or use the AI Agent to submit one."
              : "No requests match the selected filters."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {requests.map(req => {
            const Icon = REQUEST_TYPE_ICONS[req.request_type] || FileText;
            const statusConfig = DECISION_STATUS_STYLES[req.decision_status] || DECISION_STATUS_STYLES.SUBMITTED;

            return (
              <div
                key={req.id}
                onClick={() => handleOpenDetail(req)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                }}
                className="request-card hover:border-[var(--text-primary)]"
              >
                {/* Card Top */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                    </div>

                    {/* Status Pill */}
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: statusConfig.bg,
                      color: statusConfig.color,
                    }}>
                      {statusConfig.label}
                    </span>
                  </div>

                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    margin: '0 0 6px',
                    lineHeight: '1.3',
                  }}>
                    {req.title}
                  </h3>

                  {req.description && (
                    <p style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      lineHeight: '1.4',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {req.description}
                    </p>
                  )}
                </div>

                {/* Card Footer */}
                <div style={{
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {new Date(req.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>

                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-primary)', fontWeight: '500' }}>
                    View details
                    <ChevronRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL / DRAWER */}
      {detailModalOpen && selectedRequest && (
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
            width: '640px',
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
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: DECISION_STATUS_STYLES[selectedRequest.decision_status]?.bg,
                  color: DECISION_STATUS_STYLES[selectedRequest.decision_status]?.color,
                }}>
                  {DECISION_STATUS_STYLES[selectedRequest.decision_status]?.label}
                </span>
              </div>

              <button
                onClick={() => setDetailModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Title & Description */}
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px' }}>
                  {selectedRequest.title}
                </h2>
                {selectedRequest.description && (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                    {selectedRequest.description}
                  </p>
                )}
              </div>

              {/* Reviewer Decisions / Notes */}
              {(selectedRequest.decision_reason || selectedRequest.escalation_reason) && (
                <div style={{
                  background: selectedRequest.decision_status === 'REJECTED' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                  border: `1px solid ${selectedRequest.decision_status === 'REJECTED' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                    Reviewer Notes & Feedback
                  </span>
                  {selectedRequest.decision_reason && (
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '4px 0 0', fontWeight: '500' }}>
                      {selectedRequest.decision_reason}
                    </p>
                  )}
                  {selectedRequest.escalation_reason && (
                    <p style={{ fontSize: '12px', color: '#a855f7', margin: '4px 0 0' }}>
                      <strong>Escalation Note:</strong> {selectedRequest.escalation_reason}
                    </p>
                  )}
                </div>
              )}

              {/* Execution Evidence / Proof Section */}
              {selectedRequest.execution_evidence && Object.keys(selectedRequest.execution_evidence).length > 0 && (
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Sparkles size={15} style={{ color: 'var(--status-success)' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                      Verified Execution Evidence
                    </span>
                  </div>
                  <pre style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: 'var(--text-primary)',
                    overflowX: 'auto',
                    margin: 0,
                  }}>
                    {JSON.stringify(selectedRequest.execution_evidence, null, 2)}
                  </pre>
                </div>
              )}

              {/* Audit Timeline */}
              <div>
                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
                  Request Audit Timeline
                </span>
                
                {(!selectedRequest.timeline_events || selectedRequest.timeline_events.length === 0) ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No timeline events recorded.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '2px solid var(--border-medium)', paddingLeft: '14px', marginLeft: '6px' }}>
                    {selectedRequest.timeline_events.map(ev => (
                      <div key={ev.id} style={{ position: 'relative' }}>
                        <div style={{
                          position: 'absolute',
                          left: '-20px',
                          top: '2px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: ev.event_type === 'APPROVED' ? 'var(--status-success)' : ev.event_type === 'REJECTED' ? 'var(--status-error)' : 'var(--border-medium)',
                          border: '2px solid var(--bg-card)',
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {ev.event_type.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: '600', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                            {ev.actor_role}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {ev.message && (
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
                            {ev.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE REQUEST MODAL */}
      {createModalOpen && (
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
          <form onSubmit={handleCreateSubmit} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            width: '540px',
            maxWidth: '95vw',
            overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-secondary)',
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Submit New Institutional Request
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {createError && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: '6px',
                  color: 'var(--status-error)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <AlertCircle size={14} />
                  {createError}
                </div>
              )}

              {/* Request Category Selector */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Request Category
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { key: 'CERTIFICATE', label: 'Certificate', icon: Award },
                    { key: 'GRIEVANCE', label: 'Grievance', icon: ShieldAlert },
                    { key: 'MAINTENANCE', label: 'Maintenance', icon: Wrench },
                    { key: 'LAB_BOOKING', label: 'Lab Booking', icon: Building2 },
                    { key: 'GENERAL', label: 'General', icon: FileText },
                  ].map(cat => {
                    const Icon = cat.icon;
                    const isSelected = createType === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setCreateType(cat.key)}
                        style={{
                          background: isSelected ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                          border: isSelected ? '1px solid var(--text-primary)' : '1px solid var(--border-medium)',
                          borderRadius: '8px',
                          padding: '10px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: isSelected ? '600' : '500',
                          fontSize: '11px',
                        }}
                      >
                        <Icon size={16} />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Title / Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bonafide Certificate for Bank Verification"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Description Input */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Detailed Description / Reason
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide context, required dates, department info, or urgency..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
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

            {/* Footer */}
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
                onClick={() => setCreateModalOpen(false)}
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
                disabled={createSubmitting}
                style={{
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {createSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
