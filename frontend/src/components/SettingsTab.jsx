import React, { useState, useEffect } from 'react';
import { settingsServices } from '../services/settingsServices';
import { workspaceServices } from '../services/workspaceServices';
import { Eye, EyeOff, Save, Trash2, CheckCircle, AlertCircle, Cpu, Sliders, Plus, Edit2, Play, Square, Settings, RefreshCw } from 'lucide-react';

export default function SettingsTab({ activeWorkspaceId, onWorkspaceUpdated }) {
  // Provider registry state from backend
  const [registry, setRegistry] = useState({});
  
  // Workspace settings state
  const [workspaceSettingsLoading, setWorkspaceSettingsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('simulated');
  const [selectedModel, setSelectedModel] = useState('dev-mock');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  // Credentials configurations state
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Feedback alerts
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Input states map: provider -> string
  const [inputs, setInputs] = useState({});
  // Visibility states map: provider -> boolean
  const [visibility, setVisibility] = useState({});
  // Individual loading status map: provider -> boolean
  const [actionLoading, setActionLoading] = useState({});

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState('ai_settings'); // 'ai_settings' or 'mcp_registry'

  // MCP registry states
  const [builtinMCPs, setBuiltinMCPs] = useState([]);
  const [customMCPs, setCustomMCPs] = useState([]);
  const [mcpLoading, setMcpLoading] = useState(false);

  // Modal / Form state for Add/Edit Custom MCP
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [editingMcp, setEditingMcp] = useState(null); // null for create, server object for edit
  const [mcpName, setMcpName] = useState('');
  const [mcpDescription, setMcpDescription] = useState('');
  const [mcpJsonConfig, setMcpJsonConfig] = useState('');
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpSubmitLoading, setMcpSubmitLoading] = useState(false);
  const [mcpError, setMcpError] = useState('');

  const fetchMCPData = async () => {
    setMcpLoading(true);
    try {
      const builtinRes = await settingsServices.getBuiltinMCPs();
      setBuiltinMCPs(builtinRes.data || []);
      
      const customRes = await settingsServices.listCustomMCPs();
      setCustomMCPs(customRes.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load MCP Registry data.");
    } finally {
      setMcpLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'mcp_registry') {
      fetchMCPData();
    }
  }, [activeSubTab]);

  const handleOpenAddMcp = () => {
    setEditingMcp(null);
    setMcpName('');
    setMcpDescription('');
    setMcpJsonConfig(JSON.stringify({
      command: [],
      args: [],
      env: {}
    }, null, 2));
    setMcpEnabled(true);
    setMcpError('');
    setShowMcpForm(true);
  };

  const handleOpenEditMcp = (mcp) => {
    setEditingMcp(mcp);
    setMcpName(mcp.name);
    setMcpDescription(mcp.description || '');
    
    const configObj = {
      command: mcp.configuration?.command || [],
      args: mcp.configuration?.args || [],
      env: mcp.configuration?.env || {}
    };
    setMcpJsonConfig(JSON.stringify(configObj, null, 2));
    setMcpEnabled(mcp.is_enabled);
    setMcpError('');
    setShowMcpForm(true);
  };

  const handleSaveMcp = async (e) => {
    if (e) e.preventDefault();
    if (!mcpName.trim()) {
      setMcpError("Server Name is required.");
      return;
    }
    
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(mcpJsonConfig);
    } catch (err) {
      setMcpError(`Invalid JSON format: ${err.message}`);
      return;
    }
    
    if (!parsedConfig.command || !Array.isArray(parsedConfig.command)) {
      setMcpError("Invalid configuration: 'command' must be an array of strings.");
      return;
    }
    if (parsedConfig.command.length === 0) {
      setMcpError("Invalid configuration: 'command' array cannot be empty.");
      return;
    }
    for (const item of parsedConfig.command) {
      if (typeof item !== 'string') {
        setMcpError("Invalid configuration: all items in 'command' must be strings.");
        return;
      }
    }
    if (parsedConfig.args && !Array.isArray(parsedConfig.args)) {
      setMcpError("Invalid configuration: 'args' must be an array of strings.");
      return;
    }
    if (parsedConfig.args) {
      for (const item of parsedConfig.args) {
        if (typeof item !== 'string') {
          setMcpError("Invalid configuration: all items in 'args' must be strings.");
          return;
        }
      }
    }
    if (parsedConfig.env && (typeof parsedConfig.env !== 'object' || Array.isArray(parsedConfig.env))) {
      setMcpError("Invalid configuration: 'env' must be a JSON object.");
      return;
    }
    if (parsedConfig.env) {
      for (const key of Object.keys(parsedConfig.env)) {
        if (typeof parsedConfig.env[key] !== 'string') {
          setMcpError(`Invalid configuration: environment value for '${key}' must be a string.`);
          return;
        }
      }
    }
    
    const payload = {
      name: mcpName.trim(),
      description: mcpDescription.trim(),
      is_enabled: mcpEnabled,
      configuration: parsedConfig
    };
    
    setMcpSubmitLoading(true);
    setMcpError('');
    try {
      if (editingMcp) {
        await settingsServices.updateCustomMCP(editingMcp.id, payload);
        showNotification("Custom MCP Server updated successfully.");
      } else {
        await settingsServices.createCustomMCP(payload);
        showNotification("Custom MCP Server created successfully.");
      }
      setShowMcpForm(false);
      fetchMCPData();
    } catch (err) {
      console.error(err);
      const errData = err.response?.data;
      if (errData) {
        if (typeof errData === 'object') {
          if (errData.configuration) {
            setMcpError(`Configuration error: ${errData.configuration}`);
          } else if (errData.detail) {
            setMcpError(errData.detail);
          } else {
            setMcpError(JSON.stringify(errData));
          }
        } else {
          setMcpError(String(errData));
        }
      } else {
        setMcpError("Failed to save custom MCP Server. Handshake check may have failed.");
      }
    } finally {
      setMcpSubmitLoading(false);
    }
  };

  const handleDeleteMcp = async (id) => {
    if (!window.confirm("Are you sure you want to delete this custom MCP server?")) {
      return;
    }
    try {
      await settingsServices.deleteCustomMCP(id);
      showNotification("Custom MCP Server deleted successfully.");
      fetchMCPData();
    } catch (err) {
      console.error(err);
      showNotification("Failed to delete custom MCP Server.", true);
    }
  };

  const handleToggleMcpEnabled = async (mcp) => {
    try {
      await settingsServices.updateCustomMCP(mcp.id, {
        is_enabled: !mcp.is_enabled,
        name: mcp.name,
        configuration: mcp.configuration
      });
      showNotification(`MCP Server ${mcp.name} ${!mcp.is_enabled ? 'enabled' : 'disabled'}.`);
      fetchMCPData();
    } catch (err) {
      console.error(err);
      showNotification("Failed to update MCP Server status.", true);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch backend AI providers and models registry
      const registryRes = await workspaceServices.listAIProviders();
      setRegistry(registryRes.data);

      // 2. Fetch credentials configurations
      const credsRes = await settingsServices.listProviders();
      setProviders(credsRes.data);
      
      const initialInputs = {};
      const initialVisibility = {};
      credsRes.data.forEach(p => {
        initialInputs[p.provider] = '';
        initialVisibility[p.provider] = false;
      });
      setInputs(initialInputs);
      setVisibility(initialVisibility);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load settings data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaceSettings = async () => {
    if (!activeWorkspaceId) return;
    setWorkspaceSettingsLoading(true);
    try {
      const res = await workspaceServices.getSettings(activeWorkspaceId);
      setSelectedProvider(res.data.ai_provider || 'simulated');
      setSelectedModel(res.data.ai_model || 'dev-mock');
    } catch (err) {
      console.error(err);
      setError("Failed to load workspace settings.");
    } finally {
      setWorkspaceSettingsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchWorkspaceSettings();
  }, [activeWorkspaceId]);

  // Handle provider selection change and automatically pick the first model of the new provider
  const handleProviderChange = (prov) => {
    setSelectedProvider(prov);
    const models = registry[prov]?.models || [];
    setSelectedModel(models[0] || '');
  };

  const handleSaveWorkspaceSettings = async () => {
    if (!activeWorkspaceId) return;
    setWorkspaceSaving(true);
    try {
      await workspaceServices.updateSettings(activeWorkspaceId, {
        ai_provider: selectedProvider,
        ai_model: selectedModel
      });
      showNotification("Workspace settings saved successfully.");
      if (onWorkspaceUpdated) {
        await onWorkspaceUpdated();
      }
    } catch (err) {
      console.error(err);
      showNotification("Failed to save workspace settings.", true);
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleInputChange = (provider, value) => {
    setInputs(prev => ({ ...prev, [provider]: value }));
  };

  const toggleVisibility = (provider) => {
    setVisibility(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccessMsg(null);
    }, 4000);
  };

  const handleSaveKey = async (provider) => {
    const key = inputs[provider];
    if (!key) {
      showNotification("API Key cannot be empty.", true);
      return;
    }

    setActionLoading(prev => ({ ...prev, [provider]: true }));
    try {
      await settingsServices.saveProviderKey(provider, key);
      showNotification(`API Key saved successfully.`);
      // Refresh credentials configurations list
      const credsRes = await settingsServices.listProviders();
      setProviders(credsRes.data);
      setInputs(prev => ({ ...prev, [provider]: '' }));
    } catch (err) {
      console.error(err);
      showNotification(`Failed to save key.`, true);
    } finally {
      setActionLoading(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleRemoveKey = async (provider) => {
    if (!window.confirm(`Are you sure you want to remove this credential?`)) {
      return;
    }

    setActionLoading(prev => ({ ...prev, [provider]: true }));
    try {
      await settingsServices.deleteProviderKey(provider);
      showNotification(`API Key removed successfully.`);
      const credsRes = await settingsServices.listProviders();
      setProviders(credsRes.data);
    } catch (err) {
      console.error(err);
      showNotification(`Failed to remove key.`, true);
    } finally {
      setActionLoading(prev => ({ ...prev, [provider]: false }));
    }
  };

  const getProviderDescription = (providerId) => {
    const descs = {
      gemini: "Power agentic workflows using Google's Gemini models.",
      groq: "Ultra-fast inference gateway compatible with Llama and Mixtral.",
      nvidia_nim: "Accelerated model execution from NVIDIA's NIM catalog.",
      openclaw: "Local OpenAI-compatible API gateway and MCP router.",
      opencode: "Dedicated code assistance gateway and coder runtimes.",
      simulated: "Run in offline, mock-only simulation mode for tests."
    };
    return descs[providerId] || "";
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Fetching AI settings details...</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <h1 style={styles.title}>AI Settings</h1>
        <p style={styles.subtitle}>
          Configure your workspace default model execution choices and manage provider credentials.
        </p>
      </header>

      {/* Notifications */}
      {successMsg && (
        <div style={{ ...styles.alert, ...styles.alertSuccess }}>
          <CheckCircle size={16} style={{ marginRight: '8px' }} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div style={{ ...styles.alert, ...styles.alertError }}>
          <AlertCircle size={16} style={{ marginRight: '8px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div style={styles.subTabNav}>
        <button
          onClick={() => setActiveSubTab('ai_settings')}
          style={{
            ...styles.subTabBtn,
            ...(activeSubTab === 'ai_settings' ? styles.subTabBtnActive : {})
          }}
        >
          AI Providers
        </button>
        <button
          onClick={() => setActiveSubTab('mcp_registry')}
          style={{
            ...styles.subTabBtn,
            ...(activeSubTab === 'mcp_registry' ? styles.subTabBtnActive : {})
          }}
        >
          MCP Registry
        </button>
      </div>

      {activeSubTab === 'ai_settings' && (
        <>
          {/* Section 1: Workspace Settings */}
          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeaderLine}>
              <Sliders size={18} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <h2 style={styles.sectionBlockTitle}>Workspace Settings</h2>
            </div>
            <p style={styles.sectionBlockSubtitle}>
              Controls which AI provider and model this specific workspace uses.
            </p>

            {!activeWorkspaceId ? (
              <div style={styles.noActiveWorkspaceBox}>
                <AlertCircle size={18} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                <span>Select or create a workspace first to configure its model execution settings.</span>
              </div>
            ) : workspaceSettingsLoading ? (
              <p style={styles.loadingText}>Loading workspace AI configuration...</p>
            ) : (
              <div style={styles.workspaceConfigForm}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>AI Provider</label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      style={styles.selectDropdown}
                      disabled={workspaceSaving}
                    >
                      {Object.keys(registry).map(provId => (
                        <option key={provId} value={provId}>
                          {registry[provId]?.display_name || provId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>AI Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      style={styles.selectDropdown}
                      disabled={workspaceSaving}
                    >
                      {(registry[selectedProvider]?.models || []).map(modelId => (
                        <option key={modelId} value={modelId}>
                          {modelId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveWorkspaceSettings}
                  style={{ ...styles.btn, ...styles.btnSave, marginTop: '8px', alignSelf: 'flex-start' }}
                  disabled={workspaceSaving}
                >
                  <Save size={14} style={{ marginRight: '6px' }} />
                  {workspaceSaving ? 'Saving...' : 'Save Workspace Settings'}
                </button>
              </div>
            )}
          </section>

          {/* Section 2: AI Provider Credentials */}
          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeaderLine}>
              <Cpu size={18} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <h2 style={styles.sectionBlockTitle}>AI Provider Credentials</h2>
            </div>
            <p style={styles.sectionBlockSubtitle}>
              Configure your personal API credentials. Keys are encrypted symmetrically and never leaked.
            </p>

            <div style={styles.grid}>
              {providers.map(p => {
                const isConfigured = p.configured;
                const isActionLoading = actionLoading[p.provider];
                
                return (
                  <div key={p.provider} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <div style={styles.headerTitleWrap}>
                        <div style={styles.iconCircle}>
                          <Cpu size={16} style={{ color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                          <h3 style={styles.providerName}>{registry[p.provider]?.display_name || p.provider}</h3>
                          <p style={styles.providerDesc}>{getProviderDescription(p.provider)}</p>
                        </div>
                      </div>
                      
                      <span style={{
                        ...styles.badge,
                        backgroundColor: isConfigured ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isConfigured ? 'var(--status-success, #22c55e)' : 'var(--status-error, #ef4444)',
                        border: isConfigured ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        {isConfigured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>

                    <div style={styles.cardContent}>
                      {isConfigured && p.masked_key && (
                        <div style={styles.maskedKeySection}>
                          <span style={styles.maskedLabel}>Active Key:</span>
                          <code style={styles.maskedValue}>{p.masked_key}</code>
                        </div>
                      )}

                      <div style={styles.inputGroup}>
                        <label style={styles.inputLabel}>
                          {isConfigured ? 'Replace API Key' : 'Enter API Key'}
                        </label>
                        <div style={styles.inputWrapper}>
                          <input
                            type={visibility[p.provider] ? 'text' : 'password'}
                            value={inputs[p.provider] || ''}
                            onChange={(e) => handleInputChange(p.provider, e.target.value)}
                            placeholder={isConfigured ? 'Enter new key to replace existing' : 'Enter API Key'}
                            style={styles.keyInput}
                            disabled={isActionLoading}
                          />
                          <button
                            type="button"
                            onClick={() => toggleVisibility(p.provider)}
                            style={styles.visibleBtn}
                            disabled={isActionLoading}
                          >
                            {visibility[p.provider] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div style={styles.actionsWrap}>
                        <button
                          type="button"
                          onClick={() => handleSaveKey(p.provider)}
                          style={{ ...styles.btn, ...styles.btnSave }}
                          disabled={isActionLoading || !inputs[p.provider]}
                        >
                          <Save size={14} style={{ marginRight: '6px' }} />
                          {isConfigured ? 'Update Key' : 'Save Key'}
                        </button>

                        {isConfigured && (
                          <button
                            type="button"
                            onClick={() => handleRemoveKey(p.provider)}
                            style={{ ...styles.btn, ...styles.btnRemove }}
                            disabled={isActionLoading}
                          >
                            <Trash2 size={14} style={{ marginRight: '6px' }} />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'mcp_registry' && (
        <div>
          {/* Built-in MCP Servers Section */}
          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeaderLine}>
              <Cpu size={18} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <h2 style={styles.sectionBlockTitle}>Built-in MCP Servers</h2>
            </div>
            <p style={styles.sectionBlockSubtitle}>
              Core MCP servers provided out-of-the-box by Surge Suite. These are read-only and automatically managed.
            </p>

            {mcpLoading ? (
              <p style={styles.loadingText}>Loading built-in MCP configurations...</p>
            ) : (
              <div style={styles.mcpListGrid}>
                {builtinMCPs.map(srv => (
                  <div key={srv.name} style={styles.mcpCard}>
                    <div style={styles.mcpCardHeader}>
                      <div style={styles.mcpCardTitleInfo}>
                        <h3 style={styles.mcpName}>{srv.name}</h3>
                        <span style={styles.mcpBadgeBuiltin}>Built-in</span>
                      </div>
                      <p style={styles.mcpDesc}>{srv.description}</p>
                    </div>
                    <div style={styles.mcpCardContent}>
                      <div style={styles.toolsTitle}>Exposed Tools:</div>
                      {srv.tools && srv.tools.length > 0 ? (
                        <div style={styles.toolsList}>
                          {srv.tools.map(tool => (
                            <div key={tool.name} style={styles.toolItem}>
                              <code style={styles.toolName}>{tool.name}</code>
                              <span style={styles.toolDesc}>{tool.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.noToolsText}>No tools exposed by this server.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Custom MCP Servers Section */}
          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeaderLine}>
              <Cpu size={18} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <h2 style={styles.sectionBlockTitle}>Custom MCP Servers</h2>
            </div>
            <p style={styles.sectionBlockSubtitle}>
              Add and configure your own custom Model Context Protocol servers via JSON configuration.
            </p>

            <button
              onClick={handleOpenAddMcp}
              style={{ ...styles.btn, ...styles.btnSave, marginBottom: '20px' }}
            >
              Add Custom MCP Server
            </button>

            {mcpLoading ? (
              <p style={styles.loadingText}>Loading custom MCP configurations...</p>
            ) : customMCPs.length === 0 ? (
              <div style={styles.noActiveWorkspaceBox}>
                <span>No custom MCP servers configured yet. Click the button above to add one.</span>
              </div>
            ) : (
              <div style={styles.mcpListGrid}>
                {customMCPs.map(srv => (
                  <div key={srv.id} style={{
                    ...styles.mcpCard,
                    opacity: srv.is_enabled ? 1 : 0.65
                  }}>
                    <div style={styles.mcpCardHeader}>
                      <div style={styles.mcpCardTitleInfo}>
                        <h3 style={styles.mcpName}>{srv.name}</h3>
                        <div style={styles.mcpStatusRow}>
                          <span style={srv.is_enabled ? styles.mcpBadgeEnabled : styles.mcpBadgeDisabled}>
                            {srv.is_enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                      <p style={styles.mcpDesc}>{srv.description || "No description provided."}</p>
                    </div>

                    <div style={styles.mcpCardContent}>
                      <div style={styles.configDetails}>
                        <div><strong>Command:</strong> <code style={styles.configCode}>{srv.configuration?.command?.join(' ')}</code></div>
                        {srv.configuration?.env && Object.keys(srv.configuration.env).length > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            <strong>Env Variables:</strong>
                            <div style={styles.envTagsList}>
                              {Object.keys(srv.configuration.env).map(k => (
                                <span key={k} style={styles.envTag}>{k}=••••••••</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={styles.toolsTitle}>Exposed Tools (Cached):</div>
                      {srv.tools_metadata && srv.tools_metadata.length > 0 ? (
                        <div style={styles.toolsList}>
                          {srv.tools_metadata.map(tool => (
                            <div key={tool.name} style={styles.toolItem}>
                              <code style={styles.toolName}>{tool.name}</code>
                              <span style={styles.toolDesc}>{tool.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={styles.noToolsText}>No tools discovered. Enable and save the server to trigger handshake discovery.</p>
                      )}

                      <div style={styles.mcpCardActions}>
                        <div style={styles.toggleContainer}>
                          <input
                            type="checkbox"
                            checked={srv.is_enabled}
                            onChange={() => handleToggleMcpEnabled(srv)}
                            id={`toggle-${srv.id}`}
                            style={styles.toggleCheckbox}
                          />
                          <label htmlFor={`toggle-${srv.id}`} style={styles.toggleLabel}>
                            {srv.is_enabled ? 'Disable Server' : 'Enable Server'}
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenEditMcp(srv)}
                            style={styles.btnSmall}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMcp(srv.id)}
                            style={{ ...styles.btnSmall, ...styles.btnRemoveSmall }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Modal / Form for Custom MCP */}
          {showMcpForm && (
            <div style={styles.modalOverlay}>
              <div style={styles.modalContent}>
                <h3 style={styles.modalTitle}>
                  {editingMcp ? 'Edit Custom MCP Server' : 'Add Custom MCP Server'}
                </h3>
                <p style={styles.modalSubtitle}>
                  MCP configurations are tested on save. Enter the command and environment details.
                </p>

                {mcpError && (
                  <div style={{ ...styles.alert, ...styles.alertError, padding: '8px 12px', marginBottom: '16px' }}>
                    <AlertCircle size={14} style={{ marginRight: '6px' }} />
                    <span>{mcpError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveMcp} style={styles.mcpForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Server Name *</label>
                    <input
                      type="text"
                      value={mcpName}
                      onChange={(e) => setMcpName(e.target.value)}
                      placeholder="e.g. weather-service"
                      style={styles.keyInput}
                      disabled={mcpSubmitLoading}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Description</label>
                    <textarea
                      value={mcpDescription}
                      onChange={(e) => setMcpDescription(e.target.value)}
                      placeholder="Describe what tools this server provides..."
                      style={styles.textareaInput}
                      disabled={mcpSubmitLoading}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>MCP Configuration (JSON) *</label>
                    <textarea
                      value={mcpJsonConfig}
                      onChange={(e) => {
                        setMcpJsonConfig(e.target.value);
                        try {
                          JSON.parse(e.target.value);
                          setMcpError('');
                        } catch (err) {
                          setMcpError(`JSON Syntax Error: ${err.message}`);
                        }
                      }}
                      placeholder={'{\n  "command": ["uvx", "mcp-server-fetch"],\n  "args": [],\n  "env": {\n    "API_KEY": "secret"\n  }\n}'}
                      style={{
                        ...styles.textareaInput,
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        minHeight: '180px',
                        whiteSpace: 'pre',
                        overflowWrap: 'normal',
                        overflowX: 'auto'
                      }}
                      disabled={mcpSubmitLoading}
                    />
                    <small style={styles.helpText}>
                      Specify the command (array of strings), optional arguments (array of strings), and environment variables (object).
                    </small>
                  </div>

                  <div style={{ ...styles.formGroup, flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <input
                      type="checkbox"
                      id="mcp-enabled-checkbox"
                      checked={mcpEnabled}
                      onChange={(e) => setMcpEnabled(e.target.checked)}
                      style={styles.toggleCheckbox}
                      disabled={mcpSubmitLoading}
                    />
                    <label htmlFor="mcp-enabled-checkbox" style={styles.toggleLabel}>
                      Participate in agent execution (Enable)
                    </label>
                  </div>

                  <div style={styles.modalActions}>
                    <button
                      type="button"
                      onClick={() => setShowMcpForm(false)}
                      style={{ ...styles.btn, ...styles.btnRemove }}
                      disabled={mcpSubmitLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{ ...styles.btn, ...styles.btnSave }}
                      disabled={mcpSubmitLoading}
                    >
                      {mcpSubmitLoading ? 'Testing & Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    animation: 'fadeIn var(--dur-normal) var(--ease-apple)',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    letterSpacing: '-0.75px',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--border-light)',
    borderTop: '3px solid var(--text-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },
  sectionBlock: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    padding: '28px',
    marginBottom: '32px',
    boxShadow: 'var(--shadow-sm)',
  },
  sectionHeaderLine: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  sectionBlockTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  sectionBlockSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginBottom: '20px',
  },
  noActiveWorkspaceBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--border-light)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
  },
  workspaceConfigForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formRow: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '240px',
    flex: '1',
  },
  formLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  selectDropdown: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    cursor: 'pointer',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  card: {
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
    transition: 'var(--transition-all)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    gap: '16px',
  },
  headerTitleWrap: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  iconCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'var(--border-light)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  providerName: {
    fontSize: 'var(--text-sm)',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },
  providerDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  maskedKeySection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'var(--border-light)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    width: 'fit-content',
  },
  maskedLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  maskedValue: {
    fontFamily: 'monospace',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-primary)',
    letterSpacing: '1px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxWidth: '480px',
  },
  inputLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  keyInput: {
    width: '100%',
    padding: '10px 40px 10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    transition: 'var(--transition-all)',
  },
  visibleBtn: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  actionsWrap: {
    display: 'flex',
    gap: '12px',
    marginTop: '4px',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
    border: '1px solid transparent',
  },
  btnSave: {
    backgroundColor: 'var(--text-primary)',
    color: 'var(--bg-card)',
    opacity: 0.9,
    ':hover': {
      opacity: 1,
    },
    ':disabled': {
      backgroundColor: 'var(--border-medium)',
      color: 'var(--text-muted)',
      cursor: 'not-allowed',
    }
  },
  btnRemove: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: 'var(--status-error, #ef4444)',
    ':hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.05)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    }
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  alertSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.15)',
    color: 'var(--status-success, #22c55e)',
  },
  alertError: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: 'var(--status-error, #ef4444)',
  },
  subTabNav: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '28px',
    paddingBottom: '8px',
  },
  subTabBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
    outline: 'none',
  },
  subTabBtnActive: {
    color: 'var(--text-primary)',
    backgroundColor: 'var(--border-light)',
  },
  mcpListGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '24px',
    marginTop: '16px',
  },
  mcpCard: {
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'var(--transition-all)',
  },
  mcpCardHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  mcpCardTitleInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  mcpName: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  mcpStatusRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  mcpBadgeBuiltin: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: 'rgb(59, 130, 246)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
  },
  mcpBadgeEnabled: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    color: 'rgb(34, 197, 94)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
  },
  mcpBadgeDisabled: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    color: 'rgb(107, 114, 128)',
    border: '1px solid rgba(107, 114, 128, 0.2)',
  },
  mcpDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  mcpCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    borderTop: '1px solid var(--border-light)',
    paddingTop: '12px',
  },
  configDetails: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    padding: '10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  configCode: {
    fontFamily: 'monospace',
    color: 'var(--text-primary)',
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  envTagsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  envTag: {
    fontSize: '10px',
    fontFamily: 'monospace',
    backgroundColor: 'var(--border-light)',
    color: 'var(--text-secondary)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
  },
  toolsTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  toolsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '180px',
    overflowY: 'auto',
    backgroundColor: 'var(--bg-card)',
    padding: '8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)',
  },
  toolItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border-light)',
  },
  toolItemLast: {
    borderBottom: 'none',
  },
  toolName: {
    fontSize: '11px',
    fontFamily: 'monospace',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  toolDesc: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  noToolsText: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  mcpCardActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
    borderTop: '1px solid var(--border-light)',
    paddingTop: '12px',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toggleCheckbox: {
    cursor: 'pointer',
    width: '16px',
    height: '16px',
  },
  toggleLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  btnSmall: {
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'var(--transition-all)',
  },
  btnRemoveSmall: {
    color: 'var(--status-error, #ef4444)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)',
    padding: '28px',
    width: '100%',
    maxWidth: '560px',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  modalSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  mcpForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  textareaInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    minHeight: '80px',
    resize: 'vertical',
    outline: 'none',
    transition: 'var(--transition-all)',
  },
  helpText: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  btnAddRow: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '10px',
    fontWeight: '600',
    backgroundColor: 'var(--border-light)',
    border: '1px solid var(--border-medium)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  envRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  btnRemoveRow: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--status-error, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '16px',
    borderTop: '1px solid var(--border-light)',
    paddingTop: '16px',
  }
};
