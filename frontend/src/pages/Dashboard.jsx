import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import Notes from './Notes.jsx';
import SettingsTab from '../components/SettingsTab';
import DMAgentTab from '../components/DMAgentTab';
import MyRequestsTab from '../components/MyRequestsTab';
import ReviewCenterTab from '../components/ReviewCenterTab';
import NotificationCenter from '../components/NotificationCenter';
import WorkspaceSettingsModal from '../components/WorkspaceSettingsModal';
import WorkspaceMembersModal from '../components/WorkspaceMembersModal';
import MarkdownRenderer from '../components/MarkdownRenderer';
import VoiceCommandButton from '../components/VoiceCommandButton';
import AudioResponsePlayer from '../components/AudioResponsePlayer';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { workspaceServices } from '../services/workspaceServices';
import { taskServices } from '../services/taskServices';
import { 
  LayoutGrid, 
  Table, 
  FileText, 
  FolderOpen, 
  Settings, 
  Sliders,
  LogOut, 
  Plus, 
  Menu, 
  FolderPlus,
  ChevronRight,
  Pin,
  Clock,
  Zap,
  Database,
  AlertCircle,
  Archive,
  ClipboardList,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Inbox,
  FileCheck
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Workspaces');
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  // Real-time states representing workspaces
  const [workspaces, setWorkspaces] = useState([]);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    return localStorage.getItem('surge_active_workspace_id') || '';
  });
  const [workspaceError, setWorkspaceError] = useState(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');

  // Membership modal states
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [membersWorkspace, setMembersWorkspace] = useState(null);

  // Workspace Settings & Context Modal states
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsWorkspace, setSettingsWorkspace] = useState(null);

  const [pinnedFiles, setPinnedFiles] = useState([]);

  // Task & Agent execution state variables
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [taskProblemStatement, setTaskProblemStatement] = useState('');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [executingTaskId, setExecutingTaskId] = useState(null);
  const [taskError, setTaskError] = useState('');
  // Phase 4.7: approval action state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [viewingWalkthrough, setViewingWalkthrough] = useState(false);

  // Voice recognition hook for multilingual voice commands
  const {
    isListening: isVoiceListening,
    interimTranscript: voiceInterimTranscript,
    language: voiceLanguage,
    changeLanguage: setVoiceLanguage,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
    error: voiceError,
    isSupported: isVoiceSupported
  } = useVoiceRecognition({
    onResult: (fullText) => {
      setTaskProblemStatement(fullText);
    }
  });

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
  const activeWsRole = activeWs?.role || 'MEMBER';
  const isViewerRole = activeWsRole === 'VIEWER';
  const isOwnerOrAdmin = activeWsRole === 'OWNER' || activeWsRole === 'ADMIN';

  const loadTasks = async (wsId) => {
    if (!wsId) return;
    setTasksLoading(true);
    try {
      const res = await taskServices.list(wsId);
      setTasks(res.data);
    } catch (err) {
      console.error(err);
      setTaskError("Failed to load tasks.");
    } finally {
      setTasksLoading(false);
    }
  };

  const refreshTaskDetails = async (taskId) => {
    try {
      const res = await taskServices.retrieve(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteTask = async (taskId) => {
    setExecutingTaskId(taskId);
    setTaskError('');
    setApprovalError('');
    try {
      await taskServices.execute(taskId);
      await refreshTaskDetails(taskId);
    } catch (err) {
      console.error(err);
      setTaskError("Execution failed: " + (err.response?.data?.error || err.message));
      await refreshTaskDetails(taskId);
    } finally {
      setExecutingTaskId(null);
    }
  };

  const handleApproveCommand = async (taskId, approvalId) => {
    setApprovalLoading(true);
    setApprovalError('');
    try {
      await taskServices.approve(taskId, approvalId);
      await refreshTaskDetails(taskId);
    } catch (err) {
      console.error(err);
      setApprovalError("Approval failed: " + (err.response?.data?.error || err.message));
      await refreshTaskDetails(taskId);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleDenyCommand = async (taskId, approvalId) => {
    setApprovalLoading(true);
    setApprovalError('');
    try {
      await taskServices.deny(taskId, approvalId);
      await refreshTaskDetails(taskId);
    } catch (err) {
      console.error(err);
      setApprovalError("Denial failed: " + (err.response?.data?.error || err.message));
      await refreshTaskDetails(taskId);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskProblemStatement.trim()) return;
    setTaskError('');
    try {
      const res = await taskServices.create(activeWorkspaceId, taskProblemStatement);
      setTasks(prev => [res.data, ...prev]);
      setTaskProblemStatement('');
      setSelectedTaskId(res.data.id);
      
      // Automatically trigger execution synchronously
      handleExecuteTask(res.data.id);
    } catch (err) {
      console.error(err);
      setTaskError("Failed to create task: " + (err.response?.data?.error || err.message));
    }
  };

  useEffect(() => {
    if (activeWorkspaceId && activeTab === 'Tasks') {
      loadTasks(activeWorkspaceId);
      setSelectedTaskId(null);
      setTaskError('');
    }
  }, [activeWorkspaceId, activeTab]);

  // Fetch details immediately when selectedTaskId changes
  useEffect(() => {
    if (selectedTaskId) {
      refreshTaskDetails(selectedTaskId);
    }
  }, [selectedTaskId]);

  // Periodic polling for task status if currently selected task is RUNNING, PENDING, or WAITING_FOR_APPROVAL
  useEffect(() => {
    if (!selectedTaskId || activeTab !== 'Tasks') return;
    const selectedTask = tasks.find(t => t.id === selectedTaskId);
    if (!selectedTask || (
      selectedTask.status !== 'RUNNING' &&
      selectedTask.status !== 'PENDING' &&
      selectedTask.status !== 'WAITING_FOR_APPROVAL'
    )) return;

    const interval = setInterval(() => {
      refreshTaskDetails(selectedTaskId);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedTaskId, tasks, activeTab]);

  // Helper to compute remaining days in the Trash Bin (max 30 days)
  const getRemainingDays = (deletedAt) => {
    if (!deletedAt) return 30;
    const deletedDate = new Date(deletedAt);
    const expiryDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const diffTime = expiryDate - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Manage frontend-only list of active notes
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('surge_notes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse local notes:", e);
      }
    }
    return [
      {
        id: 'welcome-note',
        title: 'Welcome to Surge Notes',
        body: '<div>This is a premium monochrome notes writing workspace.</div><div>Feel free to format text, add lists, or insert links!</div>',
        isPinned: false,
        color: 'default',
        tags: ['#welcome', '#guide'],
        updatedAt: new Date().toISOString()
      }
    ];
  });

  // Manage frontend-only list of deleted notes (Trash Bin)
  const [deletedNotes, setDeletedNotes] = useState(() => {
    const saved = localStorage.getItem('surge_notes_bin');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse local bin notes:", e);
      }
    }
    return [];
  });

  const [activeNoteId, setActiveNoteId] = useState(null);

  // Sync active notes to localStorage
  const saveNotes = (updatedNotes) => {
    setNotes(updatedNotes);
    localStorage.setItem('surge_notes', JSON.stringify(updatedNotes));
  };

  // Sync bin notes to localStorage
  const saveBinNotes = (updatedBinNotes) => {
    setDeletedNotes(updatedBinNotes);
    localStorage.setItem('surge_notes_bin', JSON.stringify(updatedBinNotes));
  };

  const fetchWorkspaces = async () => {
    try {
      setWorkspaceError(null);
      const res = await workspaceServices.list();
      setWorkspaces(res.data);
      
      const archivedRes = await workspaceServices.listArchived();
      setArchivedWorkspaces(archivedRes.data);
      
      // Auto active workspace selection
      if (res.data.length > 0) {
        const found = res.data.find(w => w.id === activeWorkspaceId);
        if (!found) {
          setActiveWorkspaceId(res.data[0].id);
          localStorage.setItem('surge_active_workspace_id', res.data[0].id);
        }
      } else {
        setActiveWorkspaceId('');
        localStorage.removeItem('surge_active_workspace_id');
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
      setWorkspaceError("Failed to load workspaces. Please check connection.");
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      setWorkspaceError(null);
      const res = await workspaceServices.create({ name: newWorkspaceName });
      setNewWorkspaceName('');
      await fetchWorkspaces();
      setActiveWorkspaceId(res.data.id);
      localStorage.setItem('surge_active_workspace_id', res.data.id);
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to create workspace.";
      setWorkspaceError(msg);
    }
  };

  const handleStartEdit = (ws) => {
    setEditingWorkspaceId(ws.id);
    setEditingWorkspaceName(ws.name);
  };

  const handleSaveRename = async (id) => {
    if (!editingWorkspaceName.trim()) return;
    try {
      setWorkspaceError(null);
      await workspaceServices.update(id, { name: editingWorkspaceName });
      setEditingWorkspaceId(null);
      await fetchWorkspaces();
    } catch (err) {
      setWorkspaceError(err.response?.data?.error || "Failed to rename workspace.");
    }
  };

  const handleArchiveWorkspace = async (id) => {
    try {
      setWorkspaceError(null);
      await workspaceServices.archive(id);
      await fetchWorkspaces();
    } catch (err) {
      setWorkspaceError(err.response?.data?.error || "Failed to archive workspace.");
    }
  };

  const handleRestoreWorkspace = async (id) => {
    try {
      setWorkspaceError(null);
      await workspaceServices.restore(id);
      await fetchWorkspaces();
    } catch (err) {
      setWorkspaceError(err.response?.data?.error || "Failed to restore workspace.");
    }
  };

  const handleOpenMembers = (ws) => {
    setWorkspaceError(null);
    setMembersWorkspace(ws);
    setMembersModalOpen(true);
  };

  // Boot-time auto-purge for items older than 30 days
  useEffect(() => {
    const parsed = deletedNotes;
    const pruned = parsed.filter(n => {
      const daysLeft = getRemainingDays(n.deletedAt);
      return daysLeft > 0;
    });
    if (pruned.length !== parsed.length) {
      saveBinNotes(pruned);
    }
  }, []);

  const handleCreateNote = () => {
    const newNote = {
      id: `note-${Date.now()}`,
      title: '',
      body: '',
      isPinned: false,
      color: 'default',
      tags: [],
      updatedAt: new Date().toISOString()
    };
    const updated = [newNote, ...notes];
    saveNotes(updated);
    setActiveNoteId(newNote.id);
    setActiveTab('Notes');
  };

  const handleUpdateNote = (updatedNote) => {
    const updated = notes.map(n => n.id === updatedNote.id ? { ...updatedNote, updatedAt: new Date().toISOString() } : n);
    saveNotes(updated);
  };

  const handleTogglePinNote = (noteId) => {
    const updated = notes.map(n => n.id === noteId ? { ...n, isPinned: !n.isPinned } : n);
    saveNotes(updated);
  };

  // Move note to trash bin (delete action)
  const handleDeleteNote = (noteId) => {
    const noteToDelete = notes.find(n => n.id === noteId);
    if (!noteToDelete) return;

    // Move to bin
    const deletedNote = {
      ...noteToDelete,
      deletedAt: new Date().toISOString()
    };
    const updatedBin = [deletedNote, ...deletedNotes];
    saveBinNotes(updatedBin);

    // Remove from active notes
    const updatedNotes = notes.filter(n => n.id !== noteId);
    saveNotes(updatedNotes);

    // Clear active selection
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  // Restore note from trash bin
  const handleRestoreNote = (noteId) => {
    const noteToRestore = deletedNotes.find(n => n.id === noteId);
    if (!noteToRestore) return;

    const { deletedAt, ...restoredNote } = noteToRestore;
    restoredNote.updatedAt = new Date().toISOString();

    // Move back to active list
    const updatedNotes = [restoredNote, ...notes];
    saveNotes(updatedNotes);

    // Remove from bin list
    const updatedBin = deletedNotes.filter(n => n.id !== noteId);
    saveBinNotes(updatedBin);
  };

  // Permanently delete a single note
  const handlePermanentlyDeleteNote = (noteId) => {
    const updatedBin = deletedNotes.filter(n => n.id !== noteId);
    saveBinNotes(updatedBin);
  };

  // Empty the entire Trash Bin
  const handleEmptyBin = () => {
    saveBinNotes([]);
  };

  const handleOpenNote = (noteId) => {
    setActiveNoteId(noteId);
    setActiveTab('Notes');
  };

  const getExcerpt = (htmlString) => {
    if (!htmlString) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const text = doc.body.textContent || doc.body.innerText || '';
      return text.length > 80 ? text.substring(0, 80) + '...' : text;
    } catch (e) {
      return '';
    }
  };

  const { currentUser, logout } = useAuth();
  const username = currentUser?.user_id;

  const firstName = currentUser?.name 
    ? currentUser.name.split(' ')[0] 
    : (localStorage.getItem('firstName') || 'Guest');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Get current hour to render greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={styles.container}>
      {/* Sidebar Navigation */}
      <aside style={{
        ...styles.sidebar,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        left: sidebarOpen ? '0' : '-260px',
      }}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logoBox}>
            <LayoutGrid size={16} style={{ color: 'var(--text-primary)' }} />
            <span style={styles.logoText}>Surge Suite</span>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          {[
            { name: 'Workspaces', icon: LayoutGrid },
            { name: 'Spreadsheets', icon: Table },
            { name: 'Notes', icon: FileText },
            { name: 'Tasks', icon: ClipboardList },
            { name: 'My Requests', icon: Inbox },
            ...(isOwnerOrAdmin ? [{ name: 'Review Center', icon: ShieldCheck }] : []),
            { name: 'DM Agent', icon: MessageSquare },
            { name: 'Shared Files', icon: FolderOpen },
            { name: 'Settings', icon: Settings }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.name;
            return (
              <button
                key={item.name}
                onClick={() => {
                  setActiveTab(item.name);
                  setSidebarOpen(false);
                }}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                style={{
                  ...styles.navItem,
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? '600' : '500',
                }}
              >
                <Icon size={15} style={{ marginRight: '10px', opacity: isActive ? 1 : 0.7, transition: 'var(--transition-all)' }} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            <LogOut size={14} style={{ marginRight: '10px', opacity: 0.7 }} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={styles.mainContent}>
        {/* Top Header */}
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            {/* Mobile Sidebar Hamburger Toggle */}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.hamburgerBtn}>
              <Menu size={18} />
            </button>
            <span style={styles.pageTitleBreadcrumb}>
              {activeTab === 'Notes' ? 'Notes' : activeTab} / <span style={{ color: 'var(--text-primary)' }}>Overview</span>
            </span>
          </div>

          <div style={styles.headerRight}>
            <NotificationCenter 
              workspaceId={activeWorkspaceId} 
              onSelectRequest={(reqId, notifType) => {
                setSelectedRequestId(reqId);
                if (notifType === 'REQUEST_ESCALATED' || notifType === 'NEW_REQUEST') {
                  if (isOwnerOrAdmin) {
                    setActiveTab('Review Center');
                  } else {
                    setActiveTab('My Requests');
                  }
                } else {
                  setActiveTab('My Requests');
                }
              }} 
            />
            <ThemeToggle />
            <div style={styles.profileBadge}>{firstName.substring(0, 2).toUpperCase()}</div>
          </div>
        </header>

        {/* Dashboard Panels */}
        <main style={styles.contentBody}>
          {activeTab === 'Workspaces' ? (
            <div style={styles.workspaceWrapper}>
              
              {/* Header block */}
              <header style={styles.greetingHeader}>
                <h1 style={styles.greetingTitle}>Workspaces</h1>
                <p style={styles.greetingSubtitle}>Manage and organize your team workspaces and access limits.</p>
              </header>

              {workspaceError && (
                <div style={styles.errorAlert}>
                  <AlertCircle size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
                  {workspaceError}
                </div>
              )}

              {/* Create Workspace Panel */}
              <section style={styles.section}>
                <div style={styles.sectionHeader}>
                  <FolderPlus size={14} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                  <h3 style={styles.sectionTitle}>Create New Workspace</h3>
                </div>
                <form onSubmit={handleCreateWorkspace} style={styles.createForm}>
                  <input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="Enter workspace name"
                    style={styles.textInput}
                    disabled={workspaces.filter(w => w.owner.username === username).length >= 5}
                  />
                  <button 
                    type="submit" 
                    style={styles.actionBtn}
                    disabled={workspaces.filter(w => w.owner.username === username).length >= 5}
                  >
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Create
                  </button>
                </form>
                {workspaces.filter(w => w.owner.username === username).length >= 5 && (
                  <p style={{ color: 'var(--status-error)', fontSize: '12px', marginTop: '8px' }}>
                    * You have reached the maximum limit of 5 owned workspaces (including archived ones).
                  </p>
                )}
              </section>

              {/* Active/Accessible Workspaces Section */}
              <section style={{ ...styles.section, marginTop: '32px' }}>
                <div style={styles.sectionHeader}>
                  <LayoutGrid size={14} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                  <h3 style={styles.sectionTitle}>Active Workspaces</h3>
                </div>

                {workspaces.length > 0 ? (
                  <div style={styles.workspaceGrid}>
                    {workspaces.map(ws => {
                      const isEditing = editingWorkspaceId === ws.id;
                      const isOwner = ws.owner.username === username;
                      const isActive = activeWorkspaceId === ws.id;
                      
                      return (
                        <div 
                          key={ws.id} 
                          style={{
                            ...styles.workspaceCard,
                            border: isActive ? '1px solid var(--text-primary)' : '1px solid var(--border-medium)'
                          }}
                        >
                          <div style={styles.workspaceCardHeader}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                <input
                                  type="text"
                                  value={editingWorkspaceName}
                                  onChange={(e) => setEditingWorkspaceName(e.target.value)}
                                  style={{ ...styles.textInput, padding: '4px 8px' }}
                                />
                                <button onClick={() => handleSaveRename(ws.id)} style={{ ...styles.actionBtn, padding: '4px 10px' }}>Save</button>
                                <button onClick={() => setEditingWorkspaceId(null)} style={{ ...styles.actionBtn, background: 'var(--bg-card)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', padding: '4px 10px' }}>Cancel</button>
                              </div>
                            ) : (
                              <>
                                <h4 style={styles.workspaceCardTitle}>{ws.name}</h4>
                                {isActive && <span style={styles.activeLabel}>Active</span>}
                              </>
                            )}
                          </div>
                          
                          <div style={styles.workspaceMeta}>
                            <p style={styles.metaText}><strong>Owner:</strong> {ws.owner.first_name || ws.owner.username}</p>
                            <p style={styles.metaText}><strong>Your Role:</strong> {ws.role}</p>
                          </div>

                          <div style={styles.workspaceActions}>
                            {!isActive && (
                              <button 
                                onClick={() => {
                                  setActiveWorkspaceId(ws.id);
                                  localStorage.setItem('surge_active_workspace_id', ws.id);
                                }} 
                                style={styles.selectBtn}
                              >
                                Select Workspace
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setSettingsWorkspace(ws);
                                setSettingsModalOpen(true);
                              }} 
                              style={styles.iconBtn} 
                              title="Workspace Settings & Context"
                            >
                              Settings
                            </button>
                            <button 
                              onClick={() => handleOpenMembers(ws)} 
                              style={styles.iconBtn} 
                              title={isOwner ? "Manage Workspace Members" : "View Workspace Members"}
                            >
                              Members
                            </button>
                            {isOwner && !isEditing && (
                              <>
                                <button onClick={() => handleStartEdit(ws)} style={styles.iconBtn} title="Rename Workspace">
                                  Rename
                                </button>
                                <button onClick={() => handleArchiveWorkspace(ws.id)} style={{ ...styles.iconBtn, color: 'var(--status-error)' }} title="Archive Workspace">
                                  Archive
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={styles.emptyText}>No active workspaces found. Create one above to get started.</p>
                )}
              </section>

              {/* Archived Workspaces Section */}
              {archivedWorkspaces.length > 0 && (
                <section style={{ ...styles.section, marginTop: '32px' }}>
                  <div style={styles.sectionHeader}>
                    <Archive size={14} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                    <h3 style={styles.sectionTitle}>Archived Workspaces</h3>
                  </div>
                  <div style={styles.workspaceGrid}>
                    {archivedWorkspaces.map(ws => (
                      <div key={ws.id} style={{ ...styles.workspaceCard, opacity: 0.7, background: 'rgba(0,0,0,0.02)' }}>
                        <div style={styles.workspaceCardHeader}>
                          <h4 style={styles.workspaceCardTitle}>{ws.name}</h4>
                          <span style={{ ...styles.activeLabel, background: 'var(--border-medium)', color: 'var(--text-secondary)' }}>Archived</span>
                        </div>
                        <div style={styles.workspaceMeta}>
                          <p style={styles.metaText}>Archived on: {new Date(ws.archived_at).toLocaleDateString()}</p>
                          <p style={styles.metaText}>Permanent deletion: {new Date(ws.scheduled_deletion_at).toLocaleDateString()}</p>
                        </div>
                        <div style={styles.workspaceActions}>
                          <button onClick={() => handleRestoreWorkspace(ws.id)} style={styles.selectBtn}>
                            Restore Workspace
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Members Management Modal */}
              <WorkspaceMembersModal
                workspace={membersWorkspace}
                isOpen={membersModalOpen}
                onClose={() => setMembersModalOpen(false)}
                onWorkspaceUpdated={fetchWorkspaces}
              />

              {/* Workspace Settings & Context Layer Modal */}
              <WorkspaceSettingsModal
                workspace={settingsWorkspace}
                isOpen={settingsModalOpen}
                onClose={() => setSettingsModalOpen(false)}
                onWorkspaceUpdated={fetchWorkspaces}
              />

            </div>
          ) : activeTab === 'Notes' ? (
            <Notes 
              notes={notes}
              deletedNotes={deletedNotes}
              activeNoteId={activeNoteId}
              setActiveNoteId={setActiveNoteId}
              onNewNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onTogglePin={handleTogglePinNote}
              onDeleteNote={handleDeleteNote}
              onRestoreNote={handleRestoreNote}
              onPermanentlyDeleteNote={handlePermanentlyDeleteNote}
              onEmptyBin={handleEmptyBin}
            />
          ) : activeTab === 'Tasks' ? (
            <div style={styles.tasksWrapper}>
              <header style={styles.greetingHeader}>
                <h1 style={styles.greetingTitle}>Agentic Tasks</h1>
                <p style={styles.greetingSubtitle}>
                  Submit problem statements to active AI agents and monitor execution logs.
                </p>
              </header>

              {taskError && (
                <div style={styles.errorAlert}>
                  <AlertCircle size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
                  {taskError}
                </div>
              )}

              {!activeWorkspaceId ? (
                <div style={styles.emptyTabPanel}>
                  <ClipboardList size={36} strokeWidth={1.25} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                  <h3 style={styles.emptyPanelTitle}>No Workspace Selected</h3>
                  <p style={styles.emptyPanelText}>Please select or create an active workspace first to manage tasks.</p>
                </div>
              ) : (
                (() => {
                  const activeWorkspaceObj = workspaces.find(w => w.id === activeWorkspaceId);
                  const isRealExecution = activeWorkspaceObj?.ai_provider && activeWorkspaceObj?.ai_provider !== 'simulated';
                  
                  const getProviderDisplayName = (pId) => {
                    const names = {
                      simulated: "Simulated",
                      gemini: "Google AI Studio / Gemini",
                      groq: "Groq",
                      nvidia_nim: "NVIDIA NIM",
                      openclaw: "OpenClaw",
                      opencode: "OpenCode"
                    };
                    return names[pId] || pId;
                  };

                  return (
                    <div className="tasks-container-redesign">
                      {/* Left Column: Create Task & Task List */}
                      <div style={styles.tasksLeftCol}>
                        {/* Active Workspace AI Config Banner */}
                        <div style={styles.activeWorkspaceBanner}>
                          <h4 style={styles.bannerHeader}>Active Workspace AI Configuration</h4>
                          <div style={styles.bannerRow}>
                            <div style={styles.bannerItem}>
                              <span style={styles.bannerLabel}>Workspace</span>
                              <span style={styles.bannerValue}>{activeWorkspaceObj?.name || 'Loading...'}</span>
                            </div>
                            <div style={styles.bannerItem}>
                              <span style={styles.bannerLabel}>AI Provider</span>
                              <span style={styles.bannerValue}>{getProviderDisplayName(activeWorkspaceObj?.ai_provider)}</span>
                            </div>
                            <div style={styles.bannerItem}>
                              <span style={styles.bannerLabel}>AI Model</span>
                              <span style={styles.bannerValue}>{activeWorkspaceObj?.ai_model || 'dev-mock'}</span>
                            </div>
                            <div style={styles.bannerItem}>
                              <span style={styles.bannerLabel}>Expected Mode</span>
                              <span style={{
                                ...styles.bannerValue,
                                color: isRealExecution ? 'var(--status-success, #22c55e)' : 'var(--text-muted)'
                              }}>{isRealExecution ? 'REAL' : 'SIMULATED'}</span>
                            </div>
                          </div>
                        </div>

                        <section style={styles.section}>
                          <div style={styles.sectionHeader}>
                            <Plus size={14} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                            <h3 style={styles.sectionTitle}>New Agent Task</h3>
                          </div>
                          <form onSubmit={handleCreateTask} style={styles.taskForm}>
                            <div style={{ position: 'relative' }}>
                              {isVoiceListening && (
                                <div style={styles.voiceActiveBanner}>
                                  <span style={styles.voiceActivePulse} />
                                  <span style={styles.voiceActiveText}>
                                    Listening in {voiceLanguage === 'hi-IN' ? 'हिन्दी' : voiceLanguage === 'bn-IN' ? 'বাংলা' : voiceLanguage === 'or-IN' ? 'ଓଡ଼ିଆ' : 'English'}... Speak now
                                  </span>
                                  {voiceInterimTranscript && (
                                    <span style={styles.voiceInterimLive}>
                                      "{voiceInterimTranscript}"
                                    </span>
                                  )}
                                </div>
                              )}
                              <textarea
                                value={taskProblemStatement}
                                onChange={(e) => setTaskProblemStatement(e.target.value)}
                                placeholder={
                                  isViewerRole
                                    ? "🔒 You have read-only (VIEWER) access to this workspace. Task execution is disabled."
                                    : isVoiceListening
                                    ? "🎙️ Listening... speak in your language (e.g. 'create note', 'book a lab')..."
                                    : "Describe the task to execute, or click Voice Input to speak in English, हिन्दी, বাংলা, or ଓଡ଼ିଆ..."
                                }
                                style={{
                                  ...styles.taskTextarea,
                                  border: isVoiceListening ? '1px solid var(--status-error, #ef4444)' : styles.taskTextarea.border,
                                  boxShadow: isVoiceListening ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : 'none',
                                  opacity: isViewerRole ? 0.6 : 1,
                                  cursor: isViewerRole ? 'not-allowed' : 'text'
                                }}
                                rows={3}
                                disabled={isViewerRole || executingTaskId !== null}
                              />
                            </div>
                            <div style={styles.taskFormActions}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <VoiceCommandButton
                                  isListening={isVoiceListening}
                                  onStart={() => startVoiceListening(taskProblemStatement)}
                                  onStop={stopVoiceListening}
                                  selectedLanguage={voiceLanguage}
                                  onLanguageChange={setVoiceLanguage}
                                  error={voiceError}
                                  isSupported={isVoiceSupported}
                                  disabled={isViewerRole || executingTaskId !== null}
                                />
                                <AudioResponsePlayer
                                  text={taskProblemStatement}
                                  defaultLang={voiceLanguage}
                                  compact={true}
                                  label="Listen to Input"
                                />
                              </div>
                              <button
                                type="submit"
                                className="action-btn"
                                style={{
                                  ...styles.actionBtn,
                                  opacity: (isViewerRole || executingTaskId !== null || !taskProblemStatement.trim()) ? 0.5 : 1,
                                  cursor: (isViewerRole || executingTaskId !== null || !taskProblemStatement.trim()) ? 'not-allowed' : 'pointer'
                                }}
                                disabled={isViewerRole || executingTaskId !== null || !taskProblemStatement.trim()}
                                title={isViewerRole ? "Viewers cannot execute tasks" : ""}
                              >
                                {executingTaskId ? 'Executing...' : 'Run Task'}
                              </button>
                            </div>
                          </form>
                        </section>

                        <section style={{ ...styles.section, marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <div style={styles.sectionHeader}>
                            <ClipboardList size={14} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                            <h3 style={styles.sectionTitle}>Workspace Tasks</h3>
                          </div>

                          {tasksLoading && tasks.length === 0 ? (
                            <p style={styles.loadingText}>Loading tasks...</p>
                          ) : tasks.length === 0 ? (
                            <p style={styles.taskEmptyText}>No tasks created yet.</p>
                          ) : (
                            <div style={styles.taskList}>
                              {tasks.map(t => {
                                const isSelected = selectedTaskId === t.id;
                                const activeExec = t.executions?.[0];
                                const tProvider = activeExec?.provider || t.assigned_agent_details?.provider;
                                const tModel = activeExec?.model || t.assigned_agent_details?.model;
                                const tMode = activeExec?.mode || (tProvider === 'simulated' ? 'SIMULATED' : 'REAL');

                                return (
                                  <div
                                    key={t.id}
                                    onClick={() => setSelectedTaskId(t.id)}
                                    style={{
                                      ...styles.taskItem,
                                      border: isSelected ? '1px solid var(--text-primary)' : '1px solid var(--border-medium)',
                                      background: isSelected ? 'var(--bg-hover)' : 'var(--bg-card)'
                                    }}
                                  >
                                    <div style={styles.taskItemHeader}>
                                      <span style={{
                                        ...styles.statusBadge,
                                       background: t.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.1)' : t.status === 'FAILED' ? 'rgba(239, 68, 68, 0.1)' : t.status === 'RUNNING' ? 'rgba(234, 179, 8, 0.1)' : t.status === 'WAITING_FOR_APPROVAL' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                        color: t.status === 'COMPLETED' ? 'var(--status-success, #22c55e)' : t.status === 'FAILED' ? 'var(--status-error, #ef4444)' : t.status === 'RUNNING' ? 'var(--status-warning, #eab308)' : t.status === 'WAITING_FOR_APPROVAL' ? '#f97316' : 'var(--text-muted)',
                                        border: t.status === 'COMPLETED' ? '1px solid rgba(34, 197, 94, 0.2)' : t.status === 'FAILED' ? '1px solid rgba(239, 68, 68, 0.2)' : t.status === 'RUNNING' ? '1px solid rgba(234, 179, 8, 0.2)' : t.status === 'WAITING_FOR_APPROVAL' ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(107, 114, 128, 0.2)'
                                      }}>
                                        {t.status}
                                      </span>
                                      <span style={styles.taskTime}>{new Date(t.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p style={styles.taskItemProblem}>{t.problem_statement}</p>
                                    <div style={styles.taskItemFooter}>
                                      <span>Provider: {getProviderDisplayName(tProvider)} ({tModel})</span>
                                      <span>Mode: <strong style={{color: tMode === 'REAL' ? 'var(--status-success, #22c55e)' : 'var(--text-muted)'}}>{tMode}</strong></span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      </div>

                      {/* Right Column: Task Detail View & Approval Section wrapper */}
                      <div className="tasks-right-side-wrapper">
                        <div className="tasks-right-col-redesign">
                        {selectedTaskId ? (
                          (() => {
                            const selectedTask = tasks.find(t => t.id === selectedTaskId);
                            if (!selectedTask) return <p style={styles.taskEmptyText}>Task not found.</p>;
                            const activeExec = selectedTask.executions?.[0];
                            const execProvider = activeExec?.provider || selectedTask.assigned_agent_details?.provider;
                            const execModel = activeExec?.model || selectedTask.assigned_agent_details?.model;
                            const execMode = activeExec?.mode || (execProvider === 'simulated' ? 'SIMULATED' : 'REAL');

                            return (
                              <div style={styles.taskDetailCard}>
                                <div style={styles.detailCardHeader}>
                                  <h3 style={styles.detailTitle}>Task Details</h3>
                                  {selectedTask.status !== 'RUNNING' && selectedTask.status !== 'WAITING_FOR_APPROVAL' && (
                                    <button
                                      onClick={() => handleExecuteTask(selectedTask.id)}
                                      style={{ ...styles.btnSave, padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '600', fontSize: 'var(--text-xs)' }}
                                      disabled={executingTaskId !== null}
                                    >
                                      Re-run Task
                                    </button>
                                  )}
                                </div>
                                
                                <div style={styles.detailProblemBlock}>
                                  <p style={styles.detailProblemText}>"{selectedTask.problem_statement}"</p>
                                </div>

                                <div style={styles.detailTable}>
                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>Status</span>
                                    <span style={{
                                      ...styles.statusBadge,
                                      background: selectedTask.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.1)' : selectedTask.status === 'FAILED' ? 'rgba(239, 68, 68, 0.1)' : selectedTask.status === 'RUNNING' ? 'rgba(234, 179, 8, 0.1)' : selectedTask.status === 'WAITING_FOR_APPROVAL' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                      color: selectedTask.status === 'COMPLETED' ? 'var(--status-success, #22c55e)' : selectedTask.status === 'FAILED' ? 'var(--status-error, #ef4444)' : selectedTask.status === 'RUNNING' ? 'var(--status-warning, #eab308)' : selectedTask.status === 'WAITING_FOR_APPROVAL' ? '#f97316' : 'var(--text-muted)',
                                      border: selectedTask.status === 'COMPLETED' ? '1px solid rgba(34, 197, 94, 0.2)' : selectedTask.status === 'FAILED' ? '1px solid rgba(239, 68, 68, 0.2)' : selectedTask.status === 'RUNNING' ? '1px solid rgba(234, 179, 8, 0.2)' : selectedTask.status === 'WAITING_FOR_APPROVAL' ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(107, 114, 128, 0.2)'
                                    }}>
                                      {selectedTask.status}
                                    </span>
                                  </div>

                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>Logical Agent</span>
                                    <span style={styles.detailTableValue}>{selectedTask.assigned_agent_details?.name || 'Unassigned'}</span>
                                  </div>

                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>AI Provider</span>
                                    <span style={styles.detailTableValue}>{getProviderDisplayName(execProvider)}</span>
                                  </div>

                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>AI Model Used</span>
                                    <span style={styles.detailTableValue}>{execModel || 'None'}</span>
                                  </div>

                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>Execution Mode</span>
                                    <span style={{
                                      ...styles.statusBadge,
                                      background: execMode === 'REAL' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                                      color: execMode === 'REAL' ? 'var(--status-success, #22c55e)' : 'var(--text-muted)',
                                      border: execMode === 'REAL' ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(107, 114, 128, 0.2)'
                                    }}>
                                      {execMode}
                                    </span>
                                  </div>

                                  <div style={styles.detailRow}>
                                    <span style={styles.detailTableLabel}>Capabilities</span>
                                    <span style={styles.detailTableValue}>
                                      {(() => {
                                        const mcpEvent = selectedTask.events?.find(e => e.event_type === 'MCP_DISCOVERY_COMPLETED');
                                        const count = mcpEvent?.metadata?.tools_discovered?.length || 0;
                                        return count > 0 ? `${count} MCP tools discovered` : 'No MCP tools discovered';
                                      })()}
                                    </span>
                                  </div>
                                </div>



                                {/* Agent Result Section */}
                                {selectedTask.status === 'COMPLETED' ? (
                                  selectedTask.result ? (
                                    <div style={styles.resultBoxRedesign}>
                                      <h4 style={{...styles.resultHeader, borderLeft: '4px solid var(--status-success, #22c55e)'}}>Agent Result</h4>
                                      <AudioResponsePlayer text={selectedTask.result} defaultLang={voiceLanguage} />
                                      <div style={{ padding: '16px' }}>
                                        <MarkdownRenderer text={selectedTask.result} />
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{
                                      marginTop: '20px',
                                      padding: '16px',
                                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                                      border: '1px dashed var(--status-error, #ef4444)',
                                      borderRadius: 'var(--radius-md)',
                                      color: 'var(--status-error, #ef4444)',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}>
                                      <span>⚠️</span>
                                      <span>The agent completed execution but did not produce a final response.</span>
                                    </div>
                                  )
                                ) : selectedTask.status === 'FAILED' ? (
                                  <div style={{
                                    marginTop: '20px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden'
                                  }}>
                                    <h4 style={{
                                      ...styles.resultHeader,
                                      borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                                      color: 'var(--status-error, #ef4444)',
                                      borderLeft: '4px solid var(--status-error, #ef4444)'
                                    }}>
                                      Execution Failed
                                    </h4>
                                    <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                      <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: 'var(--status-error, #ef4444)' }}>
                                        The task could not be completed successfully.
                                      </p>
                                      <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                                        {selectedTask.result || (activeExec?.error) || "The task execution failed with an unknown error."}
                                      </div>
                                    </div>
                                  </div>
                                ) : null}

                                {/* Execution Walkthrough Artifact Section */}
                                {selectedTask.walkthrough && (
                                  <div style={{ marginTop: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                      <h4 style={styles.timelineHeader}>Execution Walkthrough</h4>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                          type="button"
                                          onClick={() => setViewingWalkthrough(!viewingWalkthrough)}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: 'var(--text-primary)',
                                            background: 'var(--bg-hover)',
                                            border: '1px solid var(--border-light)',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          {viewingWalkthrough ? 'Hide walkthrough.md' : 'View walkthrough.md'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const blob = new Blob([selectedTask.walkthrough], { type: 'text/markdown' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `walkthrough-${selectedTask.id.slice(0, 8)}.md`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                          }}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: 'var(--text-primary)',
                                            background: 'var(--bg-hover)',
                                            border: '1px solid var(--border-light)',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Download
                                        </button>
                                      </div>
                                    </div>
                                    {viewingWalkthrough && (
                                      <div style={{
                                        padding: '16px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-md)',
                                        maxHeight: '400px',
                                        overflowY: 'auto'
                                      }}>
                                        <MarkdownRenderer text={selectedTask.walkthrough} />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Tools Used */}
                                {(() => {
                                  const executedTools = [];
                                  selectedTask.events?.forEach(event => {
                                    if (event.event_type === 'TOOL_COMPLETED' && event.metadata?.tool_name) {
                                      if (!executedTools.includes(event.metadata.tool_name)) {
                                        executedTools.push(event.metadata.tool_name);
                                      }
                                    }
                                  });
                                  if (executedTools.length === 0) return null;
                                  return (
                                    <div style={{ marginTop: '24px' }}>
                                      <h4 style={styles.timelineHeader}>Tools Used</h4>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                                        {executedTools.map(tool => (
                                          <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--status-success, #22c55e)' }}>
                                            <span>✓</span>
                                            <strong style={{ color: 'var(--text-primary)' }}>{tool}</strong>
                                          </div>
                                        ))}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--status-success, #22c55e)' }}>
                                          <span>✓</span>
                                          <span style={{ color: 'var(--text-secondary)' }}>Final response generated</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Human-readable Timeline */}
                                <div style={{ marginTop: '24px' }}>
                                  <h4 style={styles.timelineHeader}>Execution Timeline</h4>
                                  <div style={styles.timelineListRedesign}>
                                    {selectedTask.events && selectedTask.events.length > 0 ? (
                                      (() => {
                                        const getReadableEventTitle = (event) => {
                                          const titles = {
                                            TASK_CREATED: "Task created",
                                            AGENT_SELECTED: "Agent selected",
                                            EXECUTION_STARTED: "Execution started",
                                            TOOL_DISCOVERED: "Capabilities discovered",
                                            MCP_DISCOVERY_STARTED: "Starting MCP tool discovery",
                                            MCP_DISCOVERY_COMPLETED: "Discovered MCP tools",
                                            TOOL_SELECTED: "Tool selected",
                                            TOOL_STARTED: "Running tool",
                                            TOOL_COMPLETED: "Tool completed",
                                            TOOL_FAILED: "Tool execution failed",
                                            FALLBACK_SELECTED: "Safe fallback selected",
                                            FINAL_RESPONSE_GENERATED: "Final response generated",
                                            EXECUTION_COMPLETED: "Execution completed",
                                            EXECUTION_FAILED: "Execution failed",
                                            ACTION_STARTED: "Model query started",
                                            ACTION_COMPLETED: "Model query completed",
                                            APPROVAL_REQUESTED: "⏸ Awaiting human approval",
                                            APPROVAL_APPROVED: "✅ Shell command approved",
                                            APPROVAL_DENIED: "❌ Shell command denied",
                                            APPROVAL_EXECUTED: "Shell command executed",
                                            APPROVAL_SECURITY_BLOCKED: "🚫 Command blocked at execution",
                                          };
                                          
                                          let base = titles[event.event_type] || event.event_type;
                                          if (event.event_type === 'AGENT_SELECTED' && event.metadata?.agent_name) {
                                            base = `${event.metadata.agent_name} selected`;
                                          } else if (event.event_type === 'MCP_DISCOVERY_COMPLETED' && event.metadata?.tools_discovered) {
                                            base = `Discovered ${event.metadata.tools_discovered.length} MCP tools`;
                                          } else if (event.event_type === 'TOOL_SELECTED' && event.metadata?.tool_name) {
                                            base = `Tool selected: ${event.metadata.tool_name}`;
                                          } else if (event.event_type === 'TOOL_STARTED' && event.metadata?.tool_name) {
                                            base = `Running tool: ${event.metadata.tool_name}`;
                                          } else if (event.event_type === 'TOOL_COMPLETED' && event.metadata?.tool_name) {
                                            base = `Tool completed: ${event.metadata.tool_name}`;
                                          } else if (event.event_type === 'TOOL_FAILED' && event.metadata?.tool_name) {
                                            base = `Tool execution failed: ${event.metadata.tool_name}`;
                                          } else if (event.event_type === 'FALLBACK_SELECTED' && event.metadata?.tool_name) {
                                            base = `Safe fallback selected: ${event.metadata.tool_name}`;
                                          } else if (event.event_type === 'EXECUTION_FAILED' && event.metadata?.error) {
                                            base = `Execution failed: ${event.metadata.error}`;
                                          }
                                          return base;
                                        };

                                        return selectedTask.events.map((event, idx) => {
                                          const isError = event.event_type === 'EXECUTION_FAILED' || (event.event_type === 'ACTION_COMPLETED' && event.metadata?.status === 'FAILED');
                                          return (
                                            <div key={event.id} style={styles.timelineItemRedesign}>
                                              <div style={{
                                                ...styles.timelineDot,
                                                backgroundColor: isError ? 'var(--status-error, #ef4444)' : 'var(--status-success, #22c55e)'
                                              }} />
                                              <div style={styles.timelineContentBox}>
                                                <div style={styles.timelineItemHeaderRedesign}>
                                                  <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                                                    {isError ? '✗' : '✓'} {getReadableEventTitle(event)}
                                                  </span>
                                                  <span style={styles.timelineTime}>
                                                    {new Date(event.timestamp).toLocaleTimeString()}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        });
                                      })()
                                    ) : (
                                      <p style={styles.taskEmptyText}>No timeline events logged.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Developer / Debug Section */}
                                <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                                  <button
                                    onClick={() => setShowRawLogs(!showRawLogs)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: 0
                                    }}
                                  >
                                    {showRawLogs ? '▼ Hide Developer Details' : '▶ Show Developer Details'}
                                  </button>
                                  {showRawLogs && (
                                    <div style={{ marginTop: '12px' }}>
                                      <h5 style={{ ...styles.timelineHeader, margin: '0 0 8px 0' }}>Raw Debug Logs</h5>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {selectedTask.events?.map(event => (
                                          <div key={event.id} style={{ padding: '10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)', fontFamily: 'monospace', fontSize: '11px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                              <span style={{ fontWeight: '600', color: 'var(--status-error)' }}>{event.event_type}</span>
                                              <span style={{ color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            {event.metadata && (
                                              <pre style={{ margin: 0, overflowX: 'auto', color: 'var(--text-secondary)' }}>
                                                {JSON.stringify(event.metadata, null, 2)}
                                              </pre>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div style={styles.emptyDetailPanel}>
                            <ClipboardList size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                            <p style={styles.emptyPanelText}>Select a task from the list to inspect execution snapshots and real-time timeline logs.</p>
                          </div>
                        )}
                      </div>

                      {/* Right Column: Approval Panel */}
                      {(() => {
                        if (!selectedTaskId) return null;
                        const selectedTask = tasks.find(t => t.id === selectedTaskId);
                        if (!selectedTask || selectedTask.status !== 'WAITING_FOR_APPROVAL' || !selectedTask.pending_approval) return null;
                        const ap = selectedTask.pending_approval;
                        return (
                          <div className="tasks-approval-panel-redesign">
                            <h3 style={styles.detailTitle}>Approval Required</h3>
                            
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '-4px' }}>
                              Agent execution is paused. This command requires your authorization before proceeding.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Requested Command
                              </span>
                              <code style={{
                                display: 'block',
                                padding: '12px',
                                background: 'var(--bg-input, #1f1f23)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '13px',
                                fontFamily: 'monospace',
                                color: 'var(--text-primary)',
                                wordBreak: 'break-all',
                                border: '1px solid var(--border-medium)',
                                lineHeight: '1.4'
                              }}>{ap.sanitized_display_command}</code>
                            </div>

                            {ap.reason && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Agent Reasoning
                                </span>
                                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{ap.reason}</p>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level: </span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  textTransform: 'uppercase',
                                  background: ap.risk === 'HIGH' ? 'rgba(239, 68, 68, 0.1)' : ap.risk === 'MEDIUM' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                  color: ap.risk === 'HIGH' ? 'var(--status-error, #ef4444)' : ap.risk === 'MEDIUM' ? 'var(--status-warning, #f59e0b)' : 'var(--status-success, #10b981)',
                                  border: `1px solid ${ap.risk === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : ap.risk === 'MEDIUM' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`
                                }}>{ap.risk}</span>
                              </div>
                              {ap.expires_at && (
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                  Expires: {new Date(ap.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>

                            <div style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.04)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-secondary)', border: '1px dashed rgba(245, 158, 11, 0.2)' }}>
                              ⚠️ <strong>Allow Once</strong> executes only this exact command. It does not whitelist future actions.
                            </div>

                            {(() => {
                              const isTaskCreator = selectedTask?.creator === currentUser?.user_id || selectedTask?.creator_details?.id === currentUser?.user_id;
                              const canAuthorize = isOwnerOrAdmin || isTaskCreator;
                              return !canAuthorize ? (
                                <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                  🔒 Command authorization is restricted to the Task Creator, Workspace Admin, or Workspace Owner.
                                </div>
                              ) : null;
                            })()}

                            {approvalError && (
                              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', color: 'var(--status-error, #ef4444)' }}>
                                {approvalError}
                              </div>
                            )}

                            {(() => {
                              const isTaskCreator = selectedTask?.creator === currentUser?.user_id || selectedTask?.creator_details?.id === currentUser?.user_id;
                              const canAuthorize = isOwnerOrAdmin || isTaskCreator;
                              return (
                                <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', paddingTop: '12px' }}>
                                  <button
                                    id={`modal-approve-btn-${ap.id}`}
                                    onClick={() => handleApproveCommand(selectedTask.id, ap.id)}
                                    disabled={!canAuthorize || approvalLoading}
                                    style={{
                                      flex: 1,
                                      padding: '8px 16px',
                                      background: 'var(--status-success, #10b981)',
                                      border: 'none',
                                      borderRadius: 'var(--radius-sm)',
                                      color: '#ffffff',
                                      fontWeight: '600',
                                      fontSize: 'var(--text-sm)',
                                      cursor: (!canAuthorize || approvalLoading) ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      opacity: (!canAuthorize || approvalLoading) ? 0.45 : 1,
                                      boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)',
                                      transition: 'var(--transition-all)'
                                    }}
                                  >
                                    {approvalLoading ? '⏳ Processing...' : 'Allow Once'}
                                  </button>
                                  <button
                                    id={`modal-deny-btn-${ap.id}`}
                                    onClick={() => handleDenyCommand(selectedTask.id, ap.id)}
                                    disabled={!canAuthorize || approvalLoading}
                                    style={{
                                      flex: 1,
                                      padding: '8px 16px',
                                      background: 'rgba(239, 68, 68, 0.08)',
                                      border: '1px solid var(--status-error, #ef4444)',
                                      borderRadius: 'var(--radius-sm)',
                                      color: 'var(--status-error, #ef4444)',
                                      fontWeight: '600',
                                      fontSize: 'var(--text-sm)',
                                      cursor: (!canAuthorize || approvalLoading) ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      opacity: (!canAuthorize || approvalLoading) ? 0.45 : 1,
                                      transition: 'var(--transition-all)'
                                    }}
                                  >
                                    {approvalLoading ? '⏳ Processing...' : 'Deny'}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })()
              )}
            </div>
          ) : activeTab === 'My Requests' ? (
            !activeWorkspaceId ? (
              <div style={styles.emptyTabPanel}>
                <Inbox size={36} strokeWidth={1.25} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h3 style={styles.emptyPanelTitle}>No Workspace Selected</h3>
                <p style={styles.emptyPanelText}>Please select or create an active workspace first to manage requests.</p>
              </div>
            ) : (
              <MyRequestsTab 
                workspace={activeWs} 
                isViewer={isViewerRole} 
                initialRequestId={selectedRequestId} 
              />
            )
          ) : activeTab === 'Review Center' ? (
            !activeWorkspaceId ? (
              <div style={styles.emptyTabPanel}>
                <ShieldCheck size={36} strokeWidth={1.25} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h3 style={styles.emptyPanelTitle}>No Workspace Selected</h3>
                <p style={styles.emptyPanelText}>Please select or create an active workspace first to access the Review Center.</p>
              </div>
            ) : (
              <ReviewCenterTab 
                workspace={activeWs} 
                userRole={activeWsRole} 
                initialRequestId={selectedRequestId} 
              />
            )
          ) : activeTab === 'Settings' ? (
            <SettingsTab activeWorkspaceId={activeWorkspaceId} onWorkspaceUpdated={fetchWorkspaces} />
          ) : activeTab === 'DM Agent' ? (
            <DMAgentTab activeWorkspaceId={activeWorkspaceId} workspaces={workspaces} />
          ) : (
            <div style={styles.emptyTabPanel}>
              <FolderPlus size={36} strokeWidth={1.25} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h3 style={styles.emptyPanelTitle}>{activeTab} Hub</h3>
              <p style={styles.emptyPanelText}>Create a new workspace item to start editing in this tab.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: 'var(--bg-app-solid)',
    color: 'var(--text-primary)',
    transition: 'background-color var(--dur-normal) var(--ease-apple), color var(--dur-normal) var(--ease-apple)',
    fontFamily: 'var(--font-sans)',
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    width: '260px',
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    transition: 'transform var(--dur-normal) var(--ease-apple)',
  },
  sidebarHeader: {
    padding: 'var(--space-5)',
    borderBottom: '1px solid var(--border-light)',
  },
  logoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: 'var(--text-primary)',
  },
  logoText: {
    fontSize: 'var(--text-base)',
    fontWeight: '700',
    letterSpacing: '-0.5px',
  },
  sidebarNav: {
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    transition: 'var(--transition-all)',
    position: 'relative',
  },
  sidebarFooter: {
    padding: '20px 16px',
    borderTop: '1px solid var(--border-light)',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: '500',
    color: 'var(--text-muted)',
    transition: 'var(--transition-all)',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    marginLeft: 0,
    transition: 'margin var(--dur-normal) var(--ease-apple)',
  },
  header: {
    height: '64px',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-header)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 var(--space-5)',
    position: 'sticky',
    top: 0,
    zIndex: 90,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  hamburgerBtn: {
    display: 'none',
  },
  pageTitleBreadcrumb: {
    fontSize: 'var(--text-xs)',
    fontWeight: '500',
    color: 'var(--text-muted)',
    letterSpacing: '-0.1px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--text-primary)',
    color: 'var(--bg-card)',
    border: 'none',
    padding: '7px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
    boxShadow: 'var(--shadow-sm)',
  },
  profileBadge: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--text-primary)',
    color: 'var(--bg-app-solid)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-xs)',
    fontWeight: '700',
  },
  contentBody: {
    padding: 'var(--space-6) var(--space-5)',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    flex: 1,
    animation: 'fadeIn var(--dur-normal) var(--ease-apple)',
  },
  workspaceWrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  greetingHeader: {
    marginBottom: 'var(--space-6)',
  },
  greetingTitle: {
    fontSize: 'var(--text-2xl)',
    fontWeight: '800',
    letterSpacing: '-1.2px',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },
  greetingSubtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },
  workspaceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    gap: '32px',
    alignItems: 'start',
    width: '100%',
  },
  mainSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  section: {
    width: '100%',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    letterSpacing: '-0.2px',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px var(--space-5)',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    textAlign: 'center',
    boxShadow: 'var(--shadow-sm)',
    transition: 'var(--transition-all)',
  },
  emptyTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: '700',
    marginBottom: '4px',
    color: 'var(--text-primary)',
  },
  emptyText: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    maxWidth: '280px',
    lineHeight: '1.5',
  },
  dashboardRightSidebar: {
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarWidget: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px',
    boxShadow: 'var(--shadow-sm)',
  },
  widgetHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 'var(--space-3)',
  },
  widgetTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  widgetBody: {
    display: 'flex',
    flexDirection: 'column',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    transition: 'var(--transition-all)',
    textAlign: 'left',
  },

  quotaInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    fontWeight: '500',
  },
  progressBarBg: {
    width: '100%',
    height: '4px',
    background: 'var(--bg-sidebar)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  progressBarActive: {
    width: '0%',
    height: '100%',
    background: 'var(--text-primary)',
  },
  emptyTabPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 24px',
    textAlign: 'center',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    animation: 'fadeIn var(--dur-normal) var(--ease-apple)',
  },
  emptyPanelTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: '700',
    marginBottom: '8px',
  },
  emptyPanelText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    maxWidth: '300px',
  },
  notesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
    width: '100%',
  },
  noteCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '120px',
  },
  noteCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  noteCardTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  noteCardExcerpt: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4',
    flex: 1,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  noteCardDate: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  recentNotesList: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  recentNoteRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--border-light)',
    gap: '16px',
  },
  recentNoteLeft: {
    display: 'flex',
    alignItems: 'center',
    width: '200px',
    flexShrink: 0,
  },
  recentNoteTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  recentNoteExcerpt: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  recentNoteDate: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontWeight: '500',
    width: '80px',
    textAlign: 'right',
    flexShrink: 0,
  },
  createForm: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    maxWidth: '500px',
    marginBottom: '8px',
  },
  textInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-medium)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  },
  workspaceCard: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    position: 'relative',
    transition: 'var(--transition-all)',
  },
  workspaceCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  workspaceCardTitle: {
    fontSize: 'var(--text-md)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
  },
  activeLabel: {
    fontSize: '10px',
    fontWeight: '700',
    background: 'var(--text-primary)',
    color: 'var(--bg-card)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase',
  },
  workspaceMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metaText: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  workspaceActions: {
    display: 'flex',
    gap: '8px',
    marginTop: 'auto',
    flexWrap: 'wrap',
  },
  selectBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--text-primary)',
    color: 'var(--bg-card)',
    border: 'none',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
  },
  iconBtn: {
    padding: '5px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    border: '1px solid var(--border-medium)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border-medium)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalTitle: {
    fontSize: 'var(--text-md)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
  },
  selectInput: {
    flex: 1,
    padding: '8px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-medium)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  },
  membersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'var(--bg-hover)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--status-error)',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '11px',
  },
  activeWorkspaceBanner: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: 'var(--shadow-sm)',
  },
  bannerHeader: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: 0,
    marginBottom: '10px',
  },
  bannerRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
  },
  bannerItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  bannerLabel: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bannerValue: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
  detailCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  detailProblemBlock: {
    backgroundColor: 'var(--bg-hover)',
    borderLeft: '3px solid var(--text-primary)',
    padding: '12px 16px',
    marginBottom: '20px',
    borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
  },
  detailProblemText: {
    fontSize: '13px',
    fontStyle: 'italic',
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: '1.4',
  },
  detailTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    marginBottom: '20px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailTableLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  detailTableValue: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
  resultBoxRedesign: {
    marginTop: '20px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  resultHeader: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-medium)',
    margin: 0,
  },
  resultContentRedesign: {
    padding: '16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },
  timelineHeader: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 16px 0',
  },
  timelineListRedesign: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'relative',
    paddingLeft: '16px',
    borderLeft: '1px solid var(--border-medium)',
    marginLeft: '6px',
  },
  timelineItemRedesign: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  timelineDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    backgroundColor: 'var(--text-primary)',
    position: 'absolute',
    left: '-21px',
    top: '4px',
    border: '2px solid var(--bg-card)',
  },
  timelineContentBox: {
    flex: '1',
  },
  timelineItemHeaderRedesign: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  tasksWrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  tasksContainer: {
    display: 'flex',
    gap: '24px',
    height: 'calc(100vh - 180px)',
    marginTop: '16px',
    alignItems: 'stretch',
  },
  tasksLeftCol: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    gap: '16px',
  },
  tasksRightCol: {
    width: '450px',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-card)',
    padding: '20px',
    overflowY: 'auto',
  },
  taskForm: {
    display: 'flex',
    flexDirection: 'column',
  },
  taskTextarea: {
    width: '100%',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-medium)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  taskItem: {
    padding: '16px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  taskItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },
  taskItemProblem: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    margin: 0,
    fontWeight: '500',
  },
  taskItemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    textTransform: 'uppercase',
    display: 'inline-block',
  },
  taskDetailCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    height: '100%',
  },
  detailTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
    borderBottom: '1px solid var(--border-medium)',
    paddingBottom: '12px',
  },
  detailField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  detailValueText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    margin: 0,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  timelineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '180px',
    overflowY: 'auto',
    background: 'var(--bg-hover)',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
  },
  timelineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    borderBottom: '1px solid var(--border-medium)',
    paddingBottom: '8px',
  },
  timelineItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineType: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  timelineTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  timelineMeta: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    margin: 0,
    background: 'var(--bg-card)',
    padding: '6px',
    borderRadius: '4px',
    overflowX: 'auto',
  },
  resultBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  resultContent: {
    background: 'var(--bg-hover)',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    lineHeight: '1.5',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'pre-wrap',
  },
  emptyDetailPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
  },
  loadingText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    margin: '20px 0',
  },
  taskEmptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    margin: '20px 0',
  },
  taskFormActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  voiceActiveBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 'var(--radius-sm, 6px) var(--radius-sm, 6px) 0 0',
    marginBottom: '-1px',
    fontSize: '11px',
    flexWrap: 'wrap',
  },
  voiceActivePulse: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: 'var(--status-error, #ef4444)',
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
    flexShrink: 0,
  },
  voiceActiveText: {
    fontWeight: '600',
    color: 'var(--status-error, #ef4444)',
    fontSize: '11px',
  },
  voiceInterimLive: {
    fontStyle: 'italic',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    marginLeft: '4px',
  },
};
