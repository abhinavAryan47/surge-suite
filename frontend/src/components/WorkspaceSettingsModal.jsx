import React, { useState, useEffect, useRef } from 'react';
import { workspaceServices } from '../services/workspaceServices';
import { 
  X, 
  Sliders, 
  Database, 
  FileText, 
  Upload, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  FileCode, 
  FileType, 
  Eye, 
  ShieldCheck,
  Scale,
  Activity
} from 'lucide-react';

export default function WorkspaceSettingsModal({ workspace, isOpen, onClose, onWorkspaceUpdated }) {
  const [activeTab, setActiveTab] = useState('system'); // 'system' | 'context' | 'policies' | 'workflows'
  
  // Role based access
  const userRole = workspace?.role || 'MEMBER';
  const isOwnerOrAdmin = userRole === 'OWNER' || userRole === 'ADMIN';
  const isViewer = userRole === 'VIEWER';

  // System Prompt State
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  // Institutional Intelligence Settings State
  const [contextWindowLimit, setContextWindowLimit] = useState(10000);
  const [institutionalKnowledgeEnabled, setInstitutionalKnowledgeEnabled] = useState(false);
  const [policyEngineEnabled, setPolicyEngineEnabled] = useState(false);
  const [workflowExecutionEnabled, setWorkflowExecutionEnabled] = useState(false);

  // Policies Tab State
  const [policies, setPolicies] = useState([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyDesc, setNewPolicyDesc] = useState('');
  const [newPolicyEffect, setNewPolicyEffect] = useState('ALLOW');
  const [newPolicyPriority, setNewPolicyPriority] = useState(1);
  const [newPolicyRules, setNewPolicyRules] = useState('{\n  "target_resource": "*"\n}');
  const [policyAdding, setPolicyAdding] = useState(false);

  // Workflows Tab State
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowFilterTab, setWorkflowFilterTab] = useState('certificates');
  const [certificates, setCertificates] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [laboratory, setLaboratory] = useState([]);
  const [grievances, setGrievances] = useState([]);
  
  // Skills State
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillContent, setNewSkillContent] = useState('');
  const [skillFile, setSkillFile] = useState(null);
  const [skillAdding, setSkillAdding] = useState(false);
  const [showManualSkillForm, setShowManualSkillForm] = useState(false);

  // Context State
  const [contextItems, setContextItems] = useState([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [newContextType, setNewContextType] = useState('USER_CONTEXT');
  const [newContextText, setNewContextText] = useState('');
  const [contextFile, setContextFile] = useState(null);
  const [contextAdding, setContextAdding] = useState(false);
  const [contextUploadMode, setContextUploadMode] = useState('file'); // 'file' | 'text'

  // Preview Modal for Normalized Context Content
  const [previewItem, setPreviewItem] = useState(null);

  // Alerts
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fileInputSkillRef = useRef(null);
  const fileInputContextRef = useRef(null);

  useEffect(() => {
    if (isOpen && workspace?.id) {
      setErrorMsg(null);
      setSuccessMsg(null);
      loadAllData();
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

  const loadAllData = async () => {
    if (!workspace?.id) return;
    try {
      // 1. Fetch workspace settings (system prompt)
      const settingsRes = await workspaceServices.getSettings(workspace.id);
      setSystemPrompt(settingsRes.data.system_prompt || '');
      setContextWindowLimit(settingsRes.data.context_window_limit || 10000);
      setInstitutionalKnowledgeEnabled(settingsRes.data.institutional_knowledge_enabled ?? false);
      setPolicyEngineEnabled(settingsRes.data.policy_engine_enabled ?? false);
      setWorkflowExecutionEnabled(settingsRes.data.workflow_execution_enabled ?? false);

      // 2. Fetch skills
      setSkillsLoading(true);
      const skillsRes = await workspaceServices.listSkills(workspace.id);
      setSkills(skillsRes.data);
      setSkillsLoading(false);

      // 3. Fetch context items
      setContextLoading(true);
      const contextRes = await workspaceServices.listContext(workspace.id);
      setContextItems(contextRes.data);
      setContextLoading(false);
    } catch (err) {
      console.error(err);
      showNotification("Failed to load workspace configuration.", true);
      setSkillsLoading(false);
      setContextLoading(false);
    }
  };

  // Save System Prompt with validation
  const handleSaveSystemPrompt = async () => {
    const trimmed = systemPrompt.trim();
    if (!trimmed) {
      showNotification("System prompt cannot be empty. Please enter instructions for the workspace agent.", true);
      return;
    }

    setPromptSaving(true);
    setErrorMsg(null);
    try {
      await workspaceServices.updateSettings(workspace.id, {
        system_prompt: trimmed,
        context_window_limit: contextWindowLimit,
        institutional_knowledge_enabled: institutionalKnowledgeEnabled,
        policy_engine_enabled: policyEngineEnabled,
        workflow_execution_enabled: workflowExecutionEnabled
      });
      showNotification("Workspace settings updated successfully.");
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to save system prompt.", true);
    } finally {
      setPromptSaving(false);
    }
  };

  const loadPolicies = async () => {
    if (!workspace?.id) return;
    try {
      setPoliciesLoading(true);
      const res = await workspaceServices.listPolicies(workspace.id);
      setPolicies(res.data);
    } catch (err) {
      console.error(err);
      showNotification("Failed to load policies.", true);
    } finally {
      setPoliciesLoading(false);
    }
  };

  const loadWorkflows = async () => {
    if (!workspace?.id) return;
    try {
      setWorkflowsLoading(true);
      const [certs, maint, lab, griev] = await Promise.all([
        workspaceServices.listCertificateRequests(workspace.id),
        workspaceServices.listMaintenanceTickets(workspace.id),
        workspaceServices.listLabBookings(workspace.id),
        workspaceServices.listGrievances(workspace.id)
      ]);
      setCertificates(certs.data);
      setMaintenance(maint.data);
      setLaboratory(lab.data);
      setGrievances(griev.data);
    } catch (err) {
      console.error(err);
      showNotification("Failed to load workflow logs.", true);
    } finally {
      setWorkflowsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'policies') {
      loadPolicies();
    } else if (activeTab === 'workflows') {
      loadWorkflows();
    }
  }, [activeTab]);

  const handleAddPolicy = async (e) => {
    e.preventDefault();
    if (!newPolicyName.trim()) {
      showNotification("Policy name is required.", true);
      return;
    }
    let parsedRules = {};
    try {
      parsedRules = JSON.parse(newPolicyRules);
    } catch (err) {
      showNotification("Rules must be a valid JSON object.", true);
      return;
    }

    setPolicyAdding(true);
    setErrorMsg(null);
    try {
      await workspaceServices.createPolicy({
        workspace: workspace.id,
        name: newPolicyName.trim(),
        description: newPolicyDesc.trim(),
        effect: newPolicyEffect,
        priority: parseInt(newPolicyPriority) || 1,
        rules: parsedRules
      });
      showNotification("Policy created successfully.");
      setNewPolicyName('');
      setNewPolicyDesc('');
      setNewPolicyEffect('ALLOW');
      setNewPolicyPriority(1);
      setNewPolicyRules('{\n  "target_resource": "*"\n}');
      loadPolicies();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to create policy.", true);
    } finally {
      setPolicyAdding(false);
    }
  };

  const handleDeletePolicy = async (policyId) => {
    if (!window.confirm("Are you sure you want to delete this policy?")) return;
    try {
      await workspaceServices.deletePolicy(policyId);
      showNotification("Policy deleted successfully.");
      loadPolicies();
    } catch (err) {
      console.error(err);
      showNotification("Failed to delete policy.", true);
    }
  };

  // Add Skill via File Upload or Manual Form
  const handleAddSkill = async (e) => {
    e.preventDefault();
    setSkillAdding(true);
    setErrorMsg(null);
    try {
      if (skillFile) {
        if (!skillFile.name.toLowerCase().endsWith('.md')) {
          showNotification("Skills accept Markdown (.md) files only.", true);
          setSkillAdding(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', skillFile);
        if (newSkillDesc) formData.append('description', newSkillDesc);
        
        await workspaceServices.addSkill(workspace.id, formData, true);
        setSkillFile(null);
        if (fileInputSkillRef.current) fileInputSkillRef.current.value = '';
      } else {
        if (!newSkillName.trim() || !newSkillContent.trim()) {
          showNotification("Skill name and markdown content are required.", true);
          setSkillAdding(false);
          return;
        }
        let formattedName = newSkillName.trim();
        if (!formattedName.toLowerCase().endsWith('.md')) {
          formattedName += '.md';
        }
        await workspaceServices.addSkill(workspace.id, {
          name: formattedName,
          description: newSkillDesc,
          content: newSkillContent
        });
        setNewSkillName('');
        setNewSkillDesc('');
        setNewSkillContent('');
        setShowManualSkillForm(false);
      }

      showNotification("Skill registered successfully.");
      const skillsRes = await workspaceServices.listSkills(workspace.id);
      setSkills(skillsRes.data);
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to add skill.", true);
    } finally {
      setSkillAdding(false);
    }
  };

  // Remove Skill
  const handleRemoveSkill = async (skillId) => {
    try {
      await workspaceServices.removeSkill(workspace.id, skillId);
      setSkills(prev => prev.filter(s => s.id !== skillId));
      showNotification("Skill removed successfully.");
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification("Failed to remove skill.", true);
    }
  };

  // Add Context (File Upload or Manual Text)
  const handleAddContext = async (e) => {
    e.preventDefault();
    setContextAdding(true);
    setErrorMsg(null);
    try {
      if (contextUploadMode === 'file') {
        if (!contextFile) {
          showNotification("Please select a document file to upload.", true);
          setContextAdding(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', contextFile);
        if (newContextName.trim()) formData.append('name', newContextName.trim());
        formData.append('context_type', newContextType);

        await workspaceServices.addContext(workspace.id, formData, true);
        setContextFile(null);
        setNewContextName('');
        if (fileInputContextRef.current) fileInputContextRef.current.value = '';
      } else {
        if (!newContextText.trim()) {
          showNotification("Context text cannot be empty.", true);
          setContextAdding(false);
          return;
        }
        await workspaceServices.addContext(workspace.id, {
          name: newContextName.trim() || "Manual Context",
          context_type: newContextType,
          content: newContextText
        });
        setNewContextName('');
        setNewContextText('');
      }

      showNotification("Context processed and normalized successfully.");
      const contextRes = await workspaceServices.listContext(workspace.id);
      setContextItems(contextRes.data);
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification(err.response?.data?.error || "Failed to process context.", true);
    } finally {
      setContextAdding(false);
    }
  };

  // Remove Context Item
  const handleRemoveContext = async (contextId) => {
    try {
      await workspaceServices.removeContext(workspace.id, contextId);
      setContextItems(prev => prev.filter(c => c.id !== contextId));
      showNotification("Context item removed.");
      if (onWorkspaceUpdated) onWorkspaceUpdated();
    } catch (err) {
      console.error(err);
      showNotification("Failed to remove context item.", true);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!isOpen || !workspace) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.headerIconBox}>
              <Sliders size={18} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={styles.headerTitle}>Workspace Settings & Context</h3>
                <span style={styles.workspaceBadge}>{workspace.name}</span>
              </div>
              <p style={styles.headerSubtitle}>
                Manage behavioral instructions (System Prompt & Skills) and background data (Context Layer).
              </p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close settings">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={styles.tabNav}>
          <button
            onClick={() => setActiveTab('system')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'system' ? '2px solid var(--text-primary)' : '2px solid transparent',
              color: activeTab === 'system' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'system' ? '600' : '500'
            }}
          >
            <Sliders size={15} style={{ marginRight: '8px' }} />
            System Settings & Skills
          </button>
          <button
            onClick={() => setActiveTab('context')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'context' ? '2px solid var(--text-primary)' : '2px solid transparent',
              color: activeTab === 'context' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'context' ? '600' : '500'
            }}
          >
            <Database size={15} style={{ marginRight: '8px' }} />
            Context & Knowledge Layer
            {contextItems.length > 0 && (
              <span style={styles.countBadge}>{contextItems.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'policies' ? '2px solid var(--text-primary)' : '2px solid transparent',
              color: activeTab === 'policies' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'policies' ? '600' : '500'
            }}
          >
            <Scale size={15} style={{ marginRight: '8px' }} />
            Institutional Policies
            {policies.length > 0 && (
              <span style={styles.countBadge}>{policies.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'workflows' ? '2px solid var(--text-primary)' : '2px solid transparent',
              color: activeTab === 'workflows' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'workflows' ? '600' : '500'
            }}
          >
            <Activity size={15} style={{ marginRight: '8px' }} />
            Workflows Status
          </button>
        </div>

        {/* Notification Alerts */}
        {!isOwnerOrAdmin && (
          <div style={{ ...styles.guardNotice, marginBottom: '16px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <ShieldCheck size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Role Access: {userRole}</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                You have view access. System prompt modifications, institutional intelligence configurations, policy authoring, and skill registrations require <strong>ADMIN</strong> or <strong>OWNER</strong> role.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={styles.errorBanner}>
            <AlertCircle size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={styles.successBanner}>
            <CheckCircle2 size={15} style={{ marginRight: '8px', flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div style={styles.bodyContent}>
          
          {/* TAB 1: SYSTEM SETTINGS & SKILLS */}
          {activeTab === 'system' && (
            <div style={styles.tabSection}>
              
              {/* System Prompt Section */}
              <div style={styles.cardSection}>
                <div style={styles.sectionTitleRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={15} style={{ color: 'var(--text-primary)' }} />
                    <h4 style={styles.sectionTitle}>Workspace System Prompt</h4>
                  </div>
                  <span style={styles.metaHint}>Instructions / Control Plane</span>
                </div>
                <p style={styles.sectionDesc}>
                  Define base persona instructions and operational boundaries for AI agents operating inside this workspace.
                </p>

                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  placeholder={isOwnerOrAdmin ? "e.g. You are a Senior Solutions Architect. Prioritize robust error handling, clean interfaces, and concise explanations." : "System prompt is locked. Only Admin or Owner can edit."}
                  rows={4}
                  style={{
                    ...styles.textareaInput,
                    opacity: !isOwnerOrAdmin ? 0.7 : 1,
                    cursor: !isOwnerOrAdmin ? 'not-allowed' : 'text'
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {systemPrompt.length} characters • {systemPrompt.trim() ? systemPrompt.trim().split(/\s+/).length : 0} words
                  </span>
                  <button
                    onClick={handleSaveSystemPrompt}
                    disabled={!isOwnerOrAdmin || promptSaving || !systemPrompt.trim()}
                    style={{
                      ...styles.primaryActionBtn,
                      opacity: (!isOwnerOrAdmin || promptSaving || !systemPrompt.trim()) ? 0.45 : 1,
                      cursor: (!isOwnerOrAdmin || promptSaving || !systemPrompt.trim()) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Save size={13} style={{ marginRight: '6px' }} />
                    {promptSaving ? 'Saving...' : 'Save System Prompt'}
                  </button>
                </div>
              </div>

              {/* Institutional Intelligence Settings Section */}
              <div style={{ ...styles.cardSection, marginTop: '20px' }}>
                <div style={styles.sectionTitleRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={15} style={{ color: 'var(--text-primary)' }} />
                    <h4 style={styles.sectionTitle}>Institutional Intelligence</h4>
                  </div>
                  <span style={styles.metaHint}>Grounding & Policy Engine</span>
                </div>
                <p style={styles.sectionDesc}>
                  Configure RAG contexts, policy compliance rules, and automated workflow triggers.
                </p>

                {/* Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Institutional Knowledge Retrieval (RAG)</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Enable paragraph/sentence-chunked RAG on context files of type "Institutional Reference".
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={institutionalKnowledgeEnabled}
                      onChange={(e) => setInstitutionalKnowledgeEnabled(e.target.checked)}
                      disabled={!isOwnerOrAdmin}
                      style={{ cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Institutional Policy Engine</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Evaluate workspace policies and apply priority-based allowances/restrictions before tool calls.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={policyEngineEnabled}
                      onChange={(e) => setPolicyEngineEnabled(e.target.checked)}
                      disabled={!isOwnerOrAdmin}
                      style={{ cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Workflow Execution</strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Connect institutional MCP servers to persistent DB-backed ORM tables (bookings, tickets, certificates, grievances).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={workflowExecutionEnabled}
                      onChange={(e) => setWorkflowExecutionEnabled(e.target.checked)}
                      disabled={!isOwnerOrAdmin}
                      style={{ cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>

                  {/* Context Window Limit */}
                  <div style={{ marginTop: '6px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Context Window Limit (Characters):
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={contextWindowLimit}
                        onChange={(e) => setContextWindowLimit(parseInt(e.target.value) || 10000)}
                        disabled={!isOwnerOrAdmin}
                        style={{ ...styles.textInput, width: '120px', cursor: !isOwnerOrAdmin ? 'not-allowed' : 'text' }}
                      />
                      <button
                        type="button"
                        onClick={() => setContextWindowLimit(10000)}
                        disabled={!isOwnerOrAdmin}
                        style={{ ...styles.secondaryBtn, opacity: !isOwnerOrAdmin ? 0.5 : 1, cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer' }}
                      >
                        10k chars
                      </button>
                      <button
                        type="button"
                        onClick={() => setContextWindowLimit(20000)}
                        disabled={!isOwnerOrAdmin}
                        style={{ ...styles.secondaryBtn, opacity: !isOwnerOrAdmin ? 0.5 : 1, cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer' }}
                      >
                        20k chars
                      </button>
                      <button
                        type="button"
                        onClick={() => setContextWindowLimit(50000)}
                        disabled={!isOwnerOrAdmin}
                        style={{ ...styles.secondaryBtn, opacity: !isOwnerOrAdmin ? 0.5 : 1, cursor: !isOwnerOrAdmin ? 'not-allowed' : 'pointer' }}
                      >
                        50k chars
                      </button>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Restricts context delivery budget to enforce strict grounding without context window overflow.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                  <button
                    onClick={handleSaveSystemPrompt}
                    disabled={!isOwnerOrAdmin || promptSaving}
                    style={{
                      ...styles.primaryActionBtn,
                      opacity: (!isOwnerOrAdmin || promptSaving) ? 0.45 : 1,
                      cursor: (!isOwnerOrAdmin || promptSaving) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Save size={13} style={{ marginRight: '6px' }} />
                    {promptSaving ? 'Saving...' : 'Save Workspace Config'}
                  </button>
                </div>
              </div>

              {/* Skills Section (.md only) */}
              <div style={{ ...styles.cardSection, marginTop: '20px' }}>
                <div style={styles.sectionTitleRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileCode size={15} style={{ color: 'var(--text-primary)' }} />
                    <h4 style={styles.sectionTitle}>Workspace Skills</h4>
                  </div>
                  <span style={{ ...styles.metaHint, background: 'rgba(59, 130, 246, 0.1)', color: 'var(--status-info, #3b82f6)' }}>
                    Markdown (.md) only
                  </span>
                </div>
                <p style={styles.sectionDesc}>
                  Skills provide structured behavioral rules and domain protocols. Skills remain strictly separate from ordinary context data.
                </p>

                {/* Upload or Add Skill (Admins/Owners only) */}
                {isOwnerOrAdmin ? (
                  <form onSubmit={handleAddSkill} style={styles.skillUploadBox}>
                    {!showManualSkillForm ? (
                      <div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="file"
                            accept=".md"
                            ref={fileInputSkillRef}
                            onChange={(e) => setSkillFile(e.target.files[0])}
                            style={styles.fileInput}
                          />
                          <button
                            type="submit"
                            disabled={skillAdding || !skillFile}
                            style={{
                              ...styles.primaryActionBtn,
                              opacity: (skillAdding || !skillFile) ? 0.45 : 1,
                              cursor: (skillAdding || !skillFile) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Upload size={13} style={{ marginRight: '6px' }} />
                            {skillAdding ? 'Uploading...' : 'Upload Skill .md'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowManualSkillForm(true)}
                            style={styles.secondaryBtn}
                          >
                            <Plus size={13} style={{ marginRight: '6px' }} />
                            Write Skill Manually
                          </button>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          * Only Markdown files ending with <code>.md</code> are accepted.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="text"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            placeholder="Skill Name (e.g. security-audit.md)"
                            style={{ ...styles.textInput, flex: 1 }}
                          />
                          <input
                            type="text"
                            value={newSkillDesc}
                            onChange={(e) => setNewSkillDesc(e.target.value)}
                            placeholder="Brief Description (optional)"
                            style={{ ...styles.textInput, flex: 1.5 }}
                          />
                        </div>
                        <textarea
                          value={newSkillContent}
                          onChange={(e) => setNewSkillContent(e.target.value)}
                          placeholder="# Skill Protocol&#10;1. Check input boundaries...&#10;2. Enforce authentication..."
                          rows={4}
                          style={styles.textareaInput}
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setShowManualSkillForm(false)}
                            style={styles.secondaryBtn}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={skillAdding || !newSkillName.trim() || !newSkillContent.trim()}
                            style={{
                              ...styles.primaryActionBtn,
                              opacity: (skillAdding || !newSkillName.trim() || !newSkillContent.trim()) ? 0.45 : 1,
                              cursor: (skillAdding || !newSkillName.trim() || !newSkillContent.trim()) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Plus size={13} style={{ marginRight: '6px' }} />
                            {skillAdding ? 'Adding...' : 'Save Skill'}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                ) : (
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    🔒 Registering or uploading workspace skills is restricted to workspace <strong>ADMIN</strong> or <strong>OWNER</strong>.
                  </p>
                )}

                {/* Skills List */}
                <div style={{ marginTop: '16px' }}>
                  <h5 style={styles.subListHeader}>Registered Skills ({skills.length})</h5>
                  {skillsLoading ? (
                    <p style={styles.emptyText}>Loading skills...</p>
                  ) : skills.length > 0 ? (
                    <div style={styles.itemsGrid}>
                      {skills.map(s => (
                        <div key={s.id} style={styles.itemRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <FileCode size={16} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={styles.itemTitle}>{s.name}</div>
                              {s.description && (
                                <div style={styles.itemSubtitle}>{s.description}</div>
                              )}
                              <div style={styles.itemMeta}>
                                {s.content.length} characters • Updated {new Date(s.updated_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          {isOwnerOrAdmin && (
                            <button
                              onClick={() => handleRemoveSkill(s.id)}
                              style={styles.deleteIconBtn}
                              title="Delete skill"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={styles.emptyText}>No skills registered yet.</p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CONTEXT & KNOWLEDGE LAYER */}
          {activeTab === 'context' && (
            <div style={styles.tabSection}>
              
              {/* Context Guard Notice */}
              <div style={styles.guardNotice}>
                <ShieldCheck size={16} style={{ color: 'var(--text-primary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '12px' }}>Data Plane Isolation:</strong>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Uploaded documents and text are treated strictly as <strong>DATA</strong>. Context items retain full provenance (SHA-256 hash, MIME, author) and cannot inject instructions or grant permissions.
                  </p>
                </div>
              </div>

              {/* Add Context Form */}
              {!isViewer ? (
                <div style={{ ...styles.cardSection, marginTop: '16px' }}>
                  <div style={styles.sectionTitleRow}>
                    <h4 style={styles.sectionTitle}>Add Workspace Context</h4>
                    <div style={styles.modeToggleGroup}>
                      <button
                        type="button"
                        onClick={() => setContextUploadMode('file')}
                        style={{
                          ...styles.modeToggleBtn,
                          background: contextUploadMode === 'file' ? 'var(--bg-card)' : 'transparent',
                          color: contextUploadMode === 'file' ? 'var(--text-primary)' : 'var(--text-muted)'
                        }}
                      >
                        <Upload size={12} style={{ marginRight: '4px' }} />
                        File Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setContextUploadMode('text')}
                        style={{
                          ...styles.modeToggleBtn,
                          background: contextUploadMode === 'text' ? 'var(--bg-card)' : 'transparent',
                          color: contextUploadMode === 'text' ? 'var(--text-primary)' : 'var(--text-muted)'
                        }}
                      >
                        <FileType size={12} style={{ marginRight: '4px' }} />
                        Manual Text
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleAddContext} style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={newContextName}
                        onChange={(e) => setNewContextName(e.target.value)}
                        placeholder={contextUploadMode === 'file' ? "Context Name (optional, defaults to filename)" : "Context Title (e.g. Q3 API Specification)"}
                        style={{ ...styles.textInput, flex: 2, minWidth: '200px' }}
                      />
                      <select
                        value={newContextType}
                        onChange={(e) => setNewContextType(e.target.value)}
                        style={{ ...styles.selectInput, flex: 1, minWidth: '160px' }}
                      >
                        <option value="USER_CONTEXT">User Context (General)</option>
                        <option value="REFERENCE">Reference Document</option>
                        <option value="INSTITUTIONAL_REFERENCE">Institutional Reference</option>
                      </select>
                    </div>

                    {contextUploadMode === 'file' ? (
                      <div>
                        <div style={styles.dropzone}>
                          <input
                            type="file"
                            accept=".pdf,.txt,.md,.markdown,.csv,.docx,.json,.html"
                            ref={fileInputContextRef}
                            onChange={(e) => setContextFile(e.target.files[0])}
                            style={styles.fileInput}
                          />
                          <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
                            <Upload size={20} style={{ color: 'var(--text-muted)', marginBottom: '6px' }} />
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
                              {contextFile ? contextFile.name : "Select or drag a context document here"}
                            </p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                              Supported: PDF, TXT, MD, CSV, DOCX, JSON, HTML (Max 10MB)
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                          <button
                            type="submit"
                            disabled={contextAdding || !contextFile}
                            style={{
                              ...styles.primaryActionBtn,
                              opacity: (contextAdding || !contextFile) ? 0.45 : 1,
                              cursor: (contextAdding || !contextFile) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Upload size={13} style={{ marginRight: '6px' }} />
                            {contextAdding ? 'Processing Document...' : 'Upload & Normalize Document'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <textarea
                          value={newContextText}
                          onChange={(e) => setNewContextText(e.target.value)}
                          placeholder="Paste or write reference context data here (e.g. database schema details, organizational hierarchy, product specs)..."
                          rows={4}
                          style={styles.textareaInput}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                          <button
                            type="submit"
                            disabled={contextAdding || !newContextText.trim()}
                            style={{
                              ...styles.primaryActionBtn,
                              opacity: (contextAdding || !newContextText.trim()) ? 0.45 : 1,
                              cursor: (contextAdding || !newContextText.trim()) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Plus size={13} style={{ marginRight: '6px' }} />
                            {contextAdding ? 'Adding Context...' : 'Add Context Entry'}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              ) : (
                <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 'var(--radius-sm)', marginTop: '16px' }}>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    👁️ Context upload and creation are disabled for <strong>VIEWER</strong> accounts.
                  </p>
                </div>
              )}

              {/* Stored Context Items List */}
              <div style={{ ...styles.cardSection, marginTop: '20px' }}>
                <div style={styles.sectionTitleRow}>
                  <h4 style={styles.sectionTitle}>Stored Workspace Context ({contextItems.length})</h4>
                  <span style={styles.metaHint}>Normalized & Stored</span>
                </div>

                {contextLoading ? (
                  <p style={styles.emptyText}>Loading context items...</p>
                ) : contextItems.length > 0 ? (
                  <div style={styles.itemsGrid}>
                    {contextItems.map(item => (
                      <div key={item.id} style={styles.itemRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <Database size={16} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={styles.itemTitle}>{item.name}</span>
                              <span style={{
                                ...styles.typeTag,
                                background: item.context_type === 'INSTITUTIONAL_REFERENCE' 
                                  ? 'rgba(168, 85, 247, 0.1)' 
                                  : (item.context_type === 'REFERENCE' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)'),
                                color: item.context_type === 'INSTITUTIONAL_REFERENCE'
                                  ? 'var(--status-purple, #a855f7)'
                                  : (item.context_type === 'REFERENCE' ? 'var(--status-info, #3b82f6)' : 'var(--status-success, #22c55e)')
                              }}>
                                {item.context_type}
                              </span>
                              <span style={{ ...styles.typeTag, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                                {item.source_type}
                              </span>
                            </div>

                            <div style={styles.itemMeta}>
                              <span>Size: {formatFileSize(item.file_size)}</span>
                              {item.content_hash && (
                                <span>• SHA: <code>{item.content_hash.substring(0, 10)}...</code></span>
                              )}
                              <span>• Added {new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={() => setPreviewItem(item)}
                            style={styles.previewBtn}
                            title="Inspect Normalized Text"
                          >
                            <Eye size={13} style={{ marginRight: '4px' }} />
                            Preview
                          </button>
                          {!isViewer && (
                            <button
                              onClick={() => handleRemoveContext(item.id)}
                              style={styles.deleteIconBtn}
                              title="Remove Context"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.emptyText}>No context items stored in this workspace.</p>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: INSTITUTIONAL POLICIES */}
          {activeTab === 'policies' && (
            <div style={styles.tabSection}>
              <p style={styles.sectionDesc}>
                Define programmatic policy engine constraints. Evaluated before tool execution. Higher priority policies take precedence. Ties default to ESCALATE.
              </p>

              {/* Add Policy Form (Admins/Owners only) */}
              {isOwnerOrAdmin ? (
                <div style={{ ...styles.cardSection, marginTop: '16px' }}>
                  <h4 style={styles.sectionTitle}>Create Policy Rule</h4>
                  <form onSubmit={handleAddPolicy} style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={newPolicyName}
                        onChange={(e) => setNewPolicyName(e.target.value)}
                        placeholder="Policy Name (e.g. Reject CS Bookings)"
                        style={{ ...styles.textInput, flex: 2, minWidth: '200px' }}
                        required
                      />
                      <select
                        value={newPolicyEffect}
                        onChange={(e) => setNewPolicyEffect(e.target.value)}
                        style={{ ...styles.selectInput, flex: 1, minWidth: '150px' }}
                      >
                        <option value="ALLOW">ALLOW</option>
                        <option value="DENY">DENY</option>
                        <option value="REQUIRES_APPROVAL">REQUIRES_APPROVAL</option>
                        <option value="ESCALATE">ESCALATE</option>
                      </select>
                      <input
                        type="number"
                        value={newPolicyPriority}
                        onChange={(e) => setNewPolicyPriority(e.target.value)}
                        placeholder="Priority"
                        style={{ ...styles.textInput, flex: 0.5, minWidth: '80px' }}
                        min="1"
                      />
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <input
                        type="text"
                        value={newPolicyDesc}
                        onChange={(e) => setNewPolicyDesc(e.target.value)}
                        placeholder="Brief Description (e.g. Deny CS lab access to general users)"
                        style={{ ...styles.textInput, width: '100%' }}
                      />
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Rules Constraint (JSON Object):
                      </label>
                      <textarea
                        value={newPolicyRules}
                        onChange={(e) => setNewPolicyRules(e.target.value)}
                        rows={3}
                        style={{ ...styles.textareaInput, fontFamily: 'monospace', fontSize: '11px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="submit"
                        disabled={policyAdding}
                        style={{
                          ...styles.primaryActionBtn,
                          opacity: policyAdding ? 0.45 : 1,
                          cursor: policyAdding ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <Plus size={13} style={{ marginRight: '6px' }} />
                        {policyAdding ? 'Creating...' : 'Create Policy'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 'var(--radius-sm)', marginTop: '16px' }}>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    🔒 Policy authoring and deletion require <strong>ADMIN</strong> or <strong>OWNER</strong> role.
                  </p>
                </div>
              )}

              {/* Policies List */}
              <div style={{ ...styles.cardSection, marginTop: '20px' }}>
                <h4 style={styles.sectionTitle}>Active Policy Registry</h4>
                {policiesLoading ? (
                  <p style={styles.emptyText}>Loading policies...</p>
                ) : policies.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {policies.map((p) => {
                      const effectColors = {
                        ALLOW: { bg: 'rgba(34, 197, 94, 0.1)', fg: 'var(--status-success, #22c55e)' },
                        DENY: { bg: 'rgba(239, 68, 68, 0.1)', fg: 'var(--status-error, #ef4444)' },
                        REQUIRES_APPROVAL: { bg: 'rgba(245, 158, 11, 0.1)', fg: '#f59e0b' },
                        ESCALATE: { bg: 'rgba(107, 114, 128, 0.1)', fg: '#6b7280' }
                      };
                      const col = effectColors[p.effect] || { bg: 'var(--bg-hover)', fg: 'var(--text-primary)' };

                      return (
                        <div key={p.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          padding: '12px',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          backgroundColor: 'var(--bg-card)'
                        }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{p.name}</strong>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '10px',
                                fontWeight: '600',
                                backgroundColor: col.bg,
                                color: col.fg
                              }}>
                                {p.effect}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Priority: {p.priority}
                              </span>
                            </div>
                            {p.description && (
                              <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {p.description}
                              </p>
                            )}
                            <pre style={{
                              margin: '8px 0 0 0',
                              padding: '6px 10px',
                              backgroundColor: 'var(--bg-sidebar)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              color: 'var(--text-secondary)',
                              overflowX: 'auto'
                            }}>
                              {JSON.stringify(p.rules, null, 2)}
                            </pre>
                          </div>
                          {isOwnerOrAdmin && (
                            <button
                              onClick={() => handleDeletePolicy(p.id)}
                              style={styles.deleteIconBtn}
                              title="Delete Policy"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={styles.emptyText}>No policies defined yet.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: WORKFLOWS STATUS LOGS */}
          {activeTab === 'workflows' && (
            <div style={styles.tabSection}>
              <p style={styles.sectionDesc}>
                View real-time workflow database logs executed by your workspace agent. Scoped securely per user.
              </p>

              {/* Subtabs filter bar */}
              <div style={{ ...styles.modeToggleGroup, marginBottom: '16px', justifyContent: 'flex-start' }}>
                <button
                  onClick={() => setWorkflowFilterTab('certificates')}
                  style={{
                    ...styles.modeToggleBtn,
                    background: workflowFilterTab === 'certificates' ? 'var(--bg-card)' : 'transparent',
                    color: workflowFilterTab === 'certificates' ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '6px 12px'
                  }}
                >
                  Certificate Requests
                  {certificates.length > 0 && <span style={{ ...styles.countBadge, marginLeft: '6px' }}>{certificates.length}</span>}
                </button>
                <button
                  onClick={() => setWorkflowFilterTab('maintenance')}
                  style={{
                    ...styles.modeToggleBtn,
                    background: workflowFilterTab === 'maintenance' ? 'var(--bg-card)' : 'transparent',
                    color: workflowFilterTab === 'maintenance' ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '6px 12px'
                  }}
                >
                  Maintenance Tickets
                  {maintenance.length > 0 && <span style={{ ...styles.countBadge, marginLeft: '6px' }}>{maintenance.length}</span>}
                </button>
                <button
                  onClick={() => setWorkflowFilterTab('laboratory')}
                  style={{
                    ...styles.modeToggleBtn,
                    background: workflowFilterTab === 'laboratory' ? 'var(--bg-card)' : 'transparent',
                    color: workflowFilterTab === 'laboratory' ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '6px 12px'
                  }}
                >
                  Laboratory Bookings
                  {laboratory.length > 0 && <span style={{ ...styles.countBadge, marginLeft: '6px' }}>{laboratory.length}</span>}
                </button>
                <button
                  onClick={() => setWorkflowFilterTab('grievances')}
                  style={{
                    ...styles.modeToggleBtn,
                    background: workflowFilterTab === 'grievances' ? 'var(--bg-card)' : 'transparent',
                    color: workflowFilterTab === 'grievances' ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '6px 12px'
                  }}
                >
                  Grievances
                  {grievances.length > 0 && <span style={{ ...styles.countBadge, marginLeft: '6px' }}>{grievances.length}</span>}
                </button>
              </div>

              {/* Logs Content */}
              <div style={styles.cardSection}>
                {workflowsLoading ? (
                  <p style={styles.emptyText}>Loading logs...</p>
                ) : (
                  <div>
                    {workflowFilterTab === 'certificates' && (
                      certificates.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {certificates.map((c) => (
                            <div key={c.id} style={styles.workflowLogCard}>
                              <div>
                                <span style={styles.workflowLogId}>ID: {c.id.substring(0, 8)}...</span>
                                <strong style={{ fontSize: '12px', color: 'var(--text-primary)', marginLeft: '8px' }}>{c.certificate_type}</strong>
                                {c.description && <p style={styles.workflowLogDesc}>{c.description}</p>}
                                <span style={styles.workflowLogTime}>Requested: {new Date(c.created_at).toLocaleString()}</span>
                              </div>
                              <span style={styles.workflowLogStatusBadge(c.status)}>{c.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.emptyText}>No certificate requests recorded.</p>
                      )
                    )}

                    {workflowFilterTab === 'maintenance' && (
                      maintenance.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {maintenance.map((m) => (
                            <div key={m.id} style={styles.workflowLogCard}>
                              <div>
                                <span style={styles.workflowLogId}>ID: {m.id.substring(0, 8)}...</span>
                                <strong style={{ fontSize: '12px', color: 'var(--text-primary)', marginLeft: '8px' }}>{m.category} at {m.location}</strong>
                                {m.description && <p style={styles.workflowLogDesc}>{m.description}</p>}
                                <span style={styles.workflowLogTime}>Requested: {new Date(m.created_at).toLocaleString()}</span>
                              </div>
                              <span style={styles.workflowLogStatusBadge(m.status)}>{m.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.emptyText}>No maintenance tickets recorded.</p>
                      )
                    )}

                    {workflowFilterTab === 'laboratory' && (
                      laboratory.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {laboratory.map((l) => (
                            <div key={l.id} style={styles.workflowLogCard}>
                              <div>
                                <span style={styles.workflowLogId}>ID: {l.id.substring(0, 8)}...</span>
                                <strong style={{ fontSize: '12px', color: 'var(--text-primary)', marginLeft: '8px' }}>{l.lab_name}</strong>
                                <p style={styles.workflowLogDesc}>Date: {l.date} • {l.start_time} to {l.end_time}</p>
                                <span style={styles.workflowLogTime}>Booked: {new Date(l.created_at).toLocaleString()}</span>
                              </div>
                              <span style={styles.workflowLogStatusBadge(l.status)}>{l.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.emptyText}>No laboratory bookings recorded.</p>
                      )
                    )}

                    {workflowFilterTab === 'grievances' && (
                      grievances.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {grievances.map((g) => (
                            <div key={g.id} style={styles.workflowLogCard}>
                              <div>
                                <span style={styles.workflowLogId}>ID: {g.id.substring(0, 8)}...</span>
                                <strong style={{ fontSize: '12px', color: 'var(--text-primary)', marginLeft: '8px' }}>{g.subject}</strong>
                                <p style={styles.workflowLogDesc}>{g.description} {g.department && `• Dept: ${g.department}`}</p>
                                <span style={styles.workflowLogTime}>Raised: {new Date(g.created_at).toLocaleString()}</span>
                              </div>
                              <span style={styles.workflowLogStatusBadge(g.status)}>{g.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.emptyText}>No grievances recorded.</p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.secondaryBtn}>
            Close Settings
          </button>
        </div>

      </div>

      {/* Normalized Context Preview Modal */}
      {previewItem && (
        <div style={styles.previewOverlay}>
          <div style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <div style={{ minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Normalized Context: {previewItem.name}
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Type: {previewItem.context_type} • Hash: {previewItem.content_hash}
                </p>
              </div>
              <button onClick={() => setPreviewItem(null)} style={styles.closeBtn}>
                <X size={16} />
              </button>
            </div>
            <div style={styles.previewBody}>
              <pre style={styles.previewCode}>
                {previewItem.normalized_content || "No normalized content available."}
              </pre>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setPreviewItem(null)} style={styles.secondaryBtn}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

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
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-lg, 12px)',
    width: '100%',
    maxWidth: '850px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--bg-card)',
  },
  headerIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-sm, 6px)',
    backgroundColor: 'var(--bg-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  headerSubtitle: {
    margin: '2px 0 0 0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  workspaceBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabNav: {
    display: 'flex',
    gap: '4px',
    padding: '0 20px',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    padding: '12px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  countBadge: {
    marginLeft: '6px',
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
  bodyContent: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
    backgroundColor: 'var(--bg-card)',
  },
  tabSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  cardSection: {
    backgroundColor: 'var(--bg-input, var(--bg-sidebar))',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '16px',
  },
  sectionTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  sectionDesc: {
    margin: '0 0 12px 0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  metaHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-hover)',
    fontWeight: '500',
  },
  textareaInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.5',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
  },
  textInput: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  selectInput: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    boxSizing: 'border-box',
    outline: 'none',
    cursor: 'pointer',
  },
  fileInput: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  primaryActionBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm, 8px)',
    backgroundColor: 'var(--text-primary)',
    color: 'var(--bg-card)',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid var(--text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s, background-color 0.2s',
  },
  secondaryBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm, 8px)',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-medium)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  skillUploadBox: {
    padding: '12px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px dashed var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
  },
  subListHeader: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  itemsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    gap: '12px',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemSubtitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: '2px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  typeTag: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '4px',
  },
  deleteIconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--status-error, #ef4444)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtn: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  guardNotice: {
    display: 'flex',
    gap: '10px',
    padding: '10px 14px',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: 'var(--radius-sm, 6px)',
  },
  dropzone: {
    padding: '24px 16px',
    border: '1px dashed var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    backgroundColor: 'var(--bg-hover)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  modeToggleGroup: {
    display: 'flex',
    backgroundColor: 'var(--bg-hover)',
    padding: '2px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-light)',
  },
  modeToggleBtn: {
    border: 'none',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '500',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  errorBanner: {
    margin: '12px 20px 0 20px',
    padding: '8px 12px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: 'var(--status-error, #ef4444)',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  successBanner: {
    margin: '12px 20px 0 20px',
    padding: '8px 12px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: 'var(--status-success, #22c55e)',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    margin: '8px 0',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid var(--border-light)',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: 'var(--bg-card)',
  },
  previewOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '20px',
  },
  previewCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-lg, 12px)',
    width: '100%',
    maxWidth: '700px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
  },
  previewHeader: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewBody: {
    padding: '16px',
    overflowY: 'auto',
    flex: 1,
    backgroundColor: 'var(--bg-sidebar)',
  },
  previewCode: {
    margin: 0,
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
  },
  workflowLogCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm, 6px)',
    gap: '12px',
  },
  workflowLogId: {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: 'var(--text-muted)',
    backgroundColor: 'var(--bg-hover)',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  workflowLogDesc: {
    margin: '4px 0 0 0',
    fontSize: '12.5px',
    color: 'var(--text-secondary)',
  },
  workflowLogTime: {
    display: 'block',
    marginTop: '4px',
    fontSize: '10.5px',
    color: 'var(--text-muted)',
  },
  workflowLogStatusBadge: (status) => {
    const statusLower = (status || '').toLowerCase();
    let bg = 'rgba(107, 114, 128, 0.1)';
    let color = '#6b7280';
    if (statusLower === 'confirmed' || statusLower === 'approved' || statusLower === 'resolved') {
      bg = 'rgba(34, 197, 94, 0.1)';
      color = 'var(--status-success, #22c55e)';
    } else if (statusLower === 'cancelled' || statusLower === 'rejected' || statusLower === 'failed') {
      bg = 'rgba(239, 68, 68, 0.1)';
      color = 'var(--status-error, #ef4444)';
    } else if (statusLower === 'pending' || statusLower === 'awaiting_approval') {
      bg = 'rgba(245, 158, 11, 0.1)';
      color = '#f59e0b';
    }
    return {
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      backgroundColor: bg,
      color: color,
      textTransform: 'uppercase',
    };
  },
};
