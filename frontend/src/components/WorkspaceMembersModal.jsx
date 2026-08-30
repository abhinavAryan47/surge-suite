import React, { useState, useEffect, useMemo } from 'react';
import { workspaceServices } from '../services/workspaceServices';
import { 
  X, 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  Crown, 
  Trash2, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Check, 
  ChevronDown,
  Info,
  Loader2
} from 'lucide-react';

export default function WorkspaceMembersModal({ workspace, isOpen, onClose, onWorkspaceUpdated }) {
  const [membersList, setMembersList] = useState([]);
  const [allUsersList, setAllUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('MEMBER');
  const [searchQuery, setSearchQuery] = useState('');

  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const isOwner = workspace?.role === 'OWNER';

  useEffect(() => {
    if (isOpen && workspace?.id) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setConfirmDeleteId(null);
      loadMembersData();
    }
  }, [isOpen, workspace?.id]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const loadMembersData = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [membersRes, usersRes] = await Promise.all([
        workspaceServices.listMembers(workspace.id),
        isOwner ? workspaceServices.listAllUsers() : Promise.resolve({ data: [] })
      ]);
      setMembersList(membersRes.data || []);
      setAllUsersList(usersRes.data || []);
    } catch (err) {
      console.error(err);
      showNotification("Failed to load workspace members.", true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserToAdd) {
      showNotification("Please select a user to add.", true);
      return;
    }

    setAddingMember(true);
    setErrorMsg(null);
    try {
      await workspaceServices.addMember(workspace.id, {
        user_id: selectedUserToAdd,
        role: selectedRoleToAdd
      });
      showNotification("Member added successfully.");
      setSelectedUserToAdd('');
      setSelectedRoleToAdd('MEMBER');
      await loadMembersData();
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to add member.", true);
    } finally {
      setAddingMember(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    setUpdatingUserId(userId);
    setErrorMsg(null);
    try {
      await workspaceServices.updateMemberRole(workspace.id, userId, { role: newRole });
      setMembersList(prev => prev.map(m => m.user.id === userId ? { ...m, role: newRole } : m));
      showNotification("Member role updated successfully.");
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to update member role.", true);
      await loadMembersData();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRemoveMember = async (userId) => {
    setRemovingUserId(userId);
    setErrorMsg(null);
    try {
      await workspaceServices.removeMember(workspace.id, userId);
      setMembersList(prev => prev.filter(m => m.user.id !== userId));
      setConfirmDeleteId(null);
      showNotification("Member removed successfully.");
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to remove member.", true);
    } finally {
      setRemovingUserId(null);
    }
  };

  // Filter available users for addition (exclude owner and already-added members)
  const availableUsersToAdd = useMemo(() => {
    const existingMemberUserIds = new Set(membersList.map(m => String(m.user.id)));
    if (workspace?.owner?.id) {
      existingMemberUserIds.add(String(workspace.owner.id));
    }
    return allUsersList.filter(u => !existingMemberUserIds.has(String(u.id)));
  }, [allUsersList, membersList, workspace?.owner?.id]);

  // Filter members list by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return membersList;
    const q = searchQuery.toLowerCase();
    return membersList.filter(m => {
      const name = (m.user.first_name || '').toLowerCase();
      const username = (m.user.username || '').toLowerCase();
      const role = (m.role || '').toLowerCase();
      return name.includes(q) || username.includes(q) || role.includes(q);
    });
  }, [membersList, searchQuery]);

  const getInitials = (firstName, username) => {
    if (firstName && firstName.trim()) {
      const parts = firstName.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return firstName.substring(0, 2).toUpperCase();
    }
    if (username) return username.substring(0, 2).toUpperCase();
    return 'U';
  };

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'OWNER':
        return {
          background: 'rgba(234, 179, 8, 0.15)',
          color: '#eab308',
          border: '1px solid rgba(234, 179, 8, 0.3)',
        };
      case 'ADMIN':
        return {
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        };
      case 'VIEWER':
        return {
          background: 'rgba(107, 114, 128, 0.15)',
          color: 'var(--text-secondary)',
          border: '1px solid rgba(107, 114, 128, 0.3)',
        };
      case 'MEMBER':
      default:
        return {
          background: 'rgba(34, 197, 94, 0.12)',
          color: 'var(--status-success, #22c55e)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
        };
    }
  };

  if (!isOpen || !workspace) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.headerIconBox}>
              <Users size={18} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={styles.headerTitle}>Workspace Members & Roles</h3>
                <span style={styles.workspaceBadge}>{workspace.name}</span>
                <span style={{ ...styles.roleBadge, ...getRoleBadgeStyle(workspace.role || 'MEMBER') }}>
                  Your Role: {workspace.role || 'MEMBER'}
                </span>
              </div>
              <p style={styles.headerSubtitle}>
                Manage member access permissions and role-based access control (RBAC).
              </p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close dialog">
            <X size={18} />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div style={styles.alertError}>
            <AlertCircle size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={styles.alertSuccess}>
            <CheckCircle2 size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        <div style={styles.body}>
          
          {/* Non-Owner Notice */}
          {!isOwner && (
            <div style={styles.infoBanner}>
              <Info size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <span>
                You are viewing this workspace as a <strong>{workspace.role || 'MEMBER'}</strong>. Member management and role adjustments are restricted to the workspace owner.
              </span>
            </div>
          )}

          {/* Add Member Card (Owner Only) */}
          {isOwner && (
            <div style={styles.addMemberSection}>
              <div style={styles.sectionHeader}>
                <UserPlus size={14} style={{ color: 'var(--text-muted)', marginRight: '6px' }} />
                <h4 style={styles.sectionTitle}>Add New Member</h4>
              </div>

              <form onSubmit={handleAddMember} style={styles.addForm}>
                <div style={styles.formRow}>
                  <div style={{ flex: '1 1 220px' }}>
                    <label style={styles.inputLabel}>Select User</label>
                    <select
                      value={selectedUserToAdd}
                      onChange={(e) => setSelectedUserToAdd(e.target.value)}
                      style={styles.selectInput}
                      disabled={addingMember || availableUsersToAdd.length === 0}
                    >
                      <option value="">
                        {availableUsersToAdd.length === 0 
                          ? "No other available users to add" 
                          : "Choose a user..."}
                      </option>
                      {availableUsersToAdd.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.first_name ? `${u.first_name} (@${u.username})` : u.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ width: '140px', flexShrink: 0 }}>
                    <label style={styles.inputLabel}>Role</label>
                    <select
                      value={selectedRoleToAdd}
                      onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                      style={styles.selectInput}
                      disabled={addingMember}
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>

                  <div style={{ alignSelf: 'flex-end' }}>
                    <button
                      type="submit"
                      style={styles.btnAdd}
                      disabled={addingMember || !selectedUserToAdd}
                    >
                      {addingMember ? (
                        <>
                          <Loader2 size={13} className="animate-spin" style={{ marginRight: '6px' }} />
                          Adding...
                        </>
                      ) : (
                        <>
                          <UserPlus size={13} style={{ marginRight: '6px' }} />
                          Add Member
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Members List Header & Search */}
          <div style={styles.listHeaderRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={styles.sectionTitle}>Current Members</h4>
              <span style={styles.countBadge}>
                {membersList.length + 1} Total
              </span>
            </div>

            {membersList.length > 3 && (
              <div style={styles.searchBox}>
                <Search size={13} style={{ color: 'var(--text-muted)', marginLeft: '8px' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter members..."
                  style={styles.searchInput}
                />
              </div>
            )}
          </div>

          {/* Members List Container */}
          <div style={styles.membersContainer}>
            {loading ? (
              <div style={styles.loadingBox}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                <span style={styles.loadingText}>Loading workspace members...</span>
              </div>
            ) : (
              <div style={styles.membersList}>
                
                {/* 1. Canonical Owner Row */}
                {(!searchQuery || 'owner'.includes(searchQuery.toLowerCase()) || 
                  (workspace.owner?.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (workspace.owner?.username || '').toLowerCase().includes(searchQuery.toLowerCase())) && (
                  <div style={styles.memberCardOwner}>
                    <div style={styles.memberInfo}>
                      <div style={styles.avatarCircleOwner}>
                        {getInitials(workspace.owner?.first_name, workspace.owner?.username)}
                      </div>
                      <div style={styles.memberDetails}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={styles.memberName}>
                            {workspace.owner?.first_name || workspace.owner?.username}
                          </span>
                          <span style={styles.ownerUsername}>@{workspace.owner?.username}</span>
                        </div>
                        <span style={styles.ownerSubtitle}>Workspace Creator & Primary Owner</span>
                      </div>
                    </div>

                    <div style={styles.memberActions}>
                      <span style={{ ...styles.roleBadge, ...getRoleBadgeStyle('OWNER'), display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Crown size={11} />
                        OWNER
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. Additional Members Rows */}
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => {
                    const isDeletingThis = confirmDeleteId === member.user.id;
                    const isUpdatingThis = updatingUserId === member.user.id;
                    const isRemovingThis = removingUserId === member.user.id;

                    return (
                      <div key={member.id} style={styles.memberCard}>
                        <div style={styles.memberInfo}>
                          <div style={styles.avatarCircle}>
                            {getInitials(member.user.first_name, member.user.username)}
                          </div>
                          <div style={styles.memberDetails}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={styles.memberName}>
                                {member.user.first_name || member.user.username}
                              </span>
                              <span style={styles.memberUsername}>@{member.user.username}</span>
                            </div>
                            <span style={styles.memberMeta}>
                              Joined {new Date(member.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div style={styles.memberActions}>
                          {isOwner ? (
                            <>
                              {/* Role Selector */}
                              <div style={{ position: 'relative' }}>
                                <select
                                  value={member.role}
                                  onChange={(e) => handleUpdateRole(member.user.id, e.target.value)}
                                  disabled={isUpdatingThis || isRemovingThis}
                                  style={{
                                    ...styles.roleSelect,
                                    ...getRoleBadgeStyle(member.role),
                                  }}
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="MEMBER">MEMBER</option>
                                  <option value="VIEWER">VIEWER</option>
                                </select>
                              </div>

                              {/* Remove Button & Confirm Dialog */}
                              {isDeletingThis ? (
                                <div style={styles.confirmDeleteBox}>
                                  <span style={styles.confirmDeleteText}>Remove?</span>
                                  <button
                                    onClick={() => handleRemoveMember(member.user.id)}
                                    disabled={isRemovingThis}
                                    style={styles.btnConfirmDelete}
                                  >
                                    {isRemovingThis ? "..." : "Yes"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={isRemovingThis}
                                    style={styles.btnCancelDelete}
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(member.user.id)}
                                  style={styles.btnRemove}
                                  title="Remove member from workspace"
                                  disabled={isUpdatingThis || isRemovingThis}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ ...styles.roleBadge, ...getRoleBadgeStyle(member.role) }}>
                              {member.role}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  searchQuery ? (
                    <div style={styles.emptyBox}>
                      <p style={styles.emptyText}>No members match "{searchQuery}".</p>
                    </div>
                  ) : membersList.length === 0 && (
                    <div style={styles.emptyBox}>
                      <Users size={28} strokeWidth={1.5} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
                      <p style={styles.emptyText}>No additional members have been added to this workspace yet.</p>
                      {isOwner && (
                        <p style={styles.emptySubtext}>Use the invite form above to allocate access to registered users.</p>
                      )}
                    </div>
                  )
                )}

              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnClose}>
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    backdropFilter: 'blur(4px)',
  },
  modalCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-lg, 12px)',
    width: '100%',
    maxWidth: '680px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.2))',
    overflow: 'hidden',
  },
  header: {
    padding: '18px 22px',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'var(--bg-card)',
  },
  headerIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md, 8px)',
    backgroundColor: 'var(--bg-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-medium)',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 'var(--text-md, 16px)',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  headerSubtitle: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  workspaceBadge: {
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full, 9999px)',
    border: '1px solid var(--border-medium)',
  },
  roleBadge: {
    fontSize: '10.5px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full, 9999px)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: 'var(--radius-sm, 6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'var(--transition-all, all 0.2s)',
  },
  alertError: {
    margin: '12px 22px 0 22px',
    padding: '10px 14px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid var(--status-error, #ef4444)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: 'var(--status-error, #ef4444)',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  alertSuccess: {
    margin: '12px 22px 0 22px',
    padding: '10px 14px',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid var(--status-success, #22c55e)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: 'var(--status-success, #22c55e)',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  body: {
    padding: '20px 22px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md, 8px)',
    fontSize: '12.5px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  addMemberSection: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  inputLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  selectInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-input, var(--bg-card))',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  btnAdd: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm, 6px)',
    backgroundColor: 'var(--text-primary)',
    color: 'var(--bg-card)',
    border: 'none',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    height: '37px',
    transition: 'var(--transition-all, all 0.2s)',
  },
  listHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '4px',
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-secondary)',
    padding: '1px 7px',
    borderRadius: 'var(--radius-full, 9999px)',
    border: '1px solid var(--border-light)',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--bg-input, var(--bg-card))',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    width: '180px',
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    padding: '6px 8px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    outline: 'none',
    width: '100%',
  },
  membersContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    gap: '10px',
  },
  loadingText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  membersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '340px',
    overflowY: 'auto',
    paddingRight: '2px',
  },
  memberCardOwner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-md, 8px)',
  },
  memberCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md, 8px)',
    transition: 'var(--transition-all, all 0.2s)',
  },
  memberInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatarCircleOwner: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    color: '#eab308',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '12px',
    flexShrink: 0,
  },
  avatarCircle: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-medium)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '12px',
    flexShrink: 0,
  },
  memberDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  memberName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  memberUsername: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  ownerUsername: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  memberMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  ownerSubtitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  memberActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  roleSelect: {
    padding: '4px 10px',
    borderRadius: 'var(--radius-full, 9999px)',
    fontSize: '10.5px',
    fontWeight: '700',
    textTransform: 'uppercase',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
    textAlign: 'center',
  },
  btnRemove: {
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--text-muted)',
    padding: '6px',
    borderRadius: 'var(--radius-sm, 6px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'var(--transition-all, all 0.2s)',
  },
  confirmDeleteBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  confirmDeleteText: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--status-error, #ef4444)',
  },
  btnConfirmDelete: {
    backgroundColor: 'var(--status-error, #ef4444)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '10.5px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  btnCancelDelete: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '10.5px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  emptyBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-hover)',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px dashed var(--border-medium)',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    margin: 0,
  },
  emptySubtext: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
    margin: '4px 0 0 0',
  },
  footer: {
    padding: '12px 22px',
    borderTop: '1px solid var(--border-light)',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: 'var(--bg-card)',
  },
  btnClose: {
    padding: '8px 18px',
    borderRadius: 'var(--radius-sm, 6px)',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-medium)',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'var(--transition-all, all 0.2s)',
  },
};
