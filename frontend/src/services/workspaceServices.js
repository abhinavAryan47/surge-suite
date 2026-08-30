import api from './api';

/**
 * Service methods for workspace resources
 */
export const workspaceServices = {
  /**
   * List workspaces where the user is an owner or member.
   */
  list() {
    return api.get('/workspaces/');
  },

  /**
   * Create a new workspace.
   */
  create(data) {
    return api.post('/workspaces/', data);
  },

  /**
   * Retrieve workspace details by ID.
   */
  retrieve(id) {
    return api.get(`/workspaces/${id}/`);
  },

  /**
   * Update workspace details (owner only).
   */
  update(id, data) {
    return api.patch(`/workspaces/${id}/`, data);
  },

  /**
   * List archived workspaces owned by the user.
   */
  listArchived() {
    return api.get('/workspaces/archived/');
  },

  /**
   * Archive a workspace (owner only).
   */
  archive(id) {
    return api.post(`/workspaces/${id}/archive/`);
  },

  /**
   * Restore an archived workspace (owner only).
   */
  restore(id) {
    return api.post(`/workspaces/${id}/restore/`);
  },

  /**
   * List all other registered users (for membership allocation).
   */
  listAllUsers() {
    return api.get('/workspaces/users/');
  },

  /**
   * List members of a workspace.
   */
  listMembers(id) {
    return api.get(`/workspaces/${id}/members/`);
  },

  /**
   * Add a member to the workspace (owner only).
   */
  addMember(id, data) {
    return api.post(`/workspaces/${id}/members/`, data);
  },

  /**
   * Update a member's role in the workspace (owner only).
   */
  updateMemberRole(id, userId, data) {
    return api.patch(`/workspaces/${id}/members/${userId}/`, data);
  },

  /**
   * Remove a member from the workspace (owner only).
   */
  removeMember(id, userId) {
    return api.delete(`/workspaces/${id}/members/${userId}/`);
  },

  /**
   * Retrieve centralized list of backend AI providers and their models.
   */
  listAIProviders() {
    return api.get('/workspaces/ai-providers/');
  },

  /**
   * Retrieve specific workspace settings.
   */
  getSettings(id) {
    return api.get(`/workspaces/${id}/settings/`);
  },

  /**
   * Update specific workspace settings.
   */
  updateSettings(id, data) {
    return api.patch(`/workspaces/${id}/settings/`, data);
  },

  /**
   * Send a direct message to the agent inside the workspace.
   */
  dm(id, data) {
    return api.post(`/workspaces/${id}/dm/`, data);
  },

  /**
   * List skills registered in the workspace.
   */
  listSkills(id) {
    return api.get(`/workspaces/${id}/skills/`);
  },

  /**
   * Add or upload a skill (.md) in the workspace.
   */
  addSkill(id, data, isFormData = false) {
    return api.post(
      `/workspaces/${id}/skills/`,
      data,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}
    );
  },

  /**
   * Remove a skill from the workspace.
   */
  removeSkill(id, skillId) {
    return api.delete(`/workspaces/${id}/skills/${skillId}/`);
  },

  /**
   * List active context items in the workspace.
   */
  listContext(id) {
    return api.get(`/workspaces/${id}/context/`);
  },

  /**
   * Add manual text context or upload a document file to the workspace.
   */
  addContext(id, data, isFormData = false) {
    return api.post(
      `/workspaces/${id}/context/`,
      data,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}
    );
  },

  /**
   * Remove (archive) a context item from the workspace.
   */
  removeContext(id, contextId) {
    return api.delete(`/workspaces/${id}/context/${contextId}/`);
  },

  /**
   * Retrieve structured context and instructions summary for the workspace.
   */
  getContextSummary(id) {
    return api.get(`/workspaces/${id}/context/summary/`);
  },

  // Institutional Policy Engine
  listPolicies(workspaceId) {
    return api.get(`/mcp/policies/?workspace_id=${workspaceId}`);
  },
  createPolicy(data) {
    return api.post('/mcp/policies/', data);
  },
  deletePolicy(id) {
    return api.delete(`/mcp/policies/${id}/`);
  },

  // Workflow Logs
  listCertificateRequests(workspaceId) {
    return api.get(`/workflows/certificates/?workspace_id=${workspaceId}`);
  },
  listMaintenanceTickets(workspaceId) {
    return api.get(`/workflows/maintenance/?workspace_id=${workspaceId}`);
  },
  listLabBookings(workspaceId) {
    return api.get(`/workflows/laboratory/?workspace_id=${workspaceId}`);
  },
  listGrievances(workspaceId) {
    return api.get(`/workflows/grievances/?workspace_id=${workspaceId}`);
  }
};

