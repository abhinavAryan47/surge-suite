import api from './api';

export const settingsServices = {
  /**
   * Retrieve list of AI providers and configuration status.
   * @returns {Promise} Axios response promise
   */
  listProviders() {
    return api.get('/settings/providers/');
  },

  /**
   * Save API Key for a specific provider.
   * @param {string} provider - Lowecase provider identifier
   * @param {string} apiKey - Plains text API Key to save
   * @returns {Promise} Axios response promise
   */
  saveProviderKey(provider, apiKey) {
    return api.post(`/settings/providers/${provider}/`, { api_key: apiKey });
  },

  /**
   * Delete API Key for a specific provider.
   * @param {string} provider - Lowecase provider identifier
   * @returns {Promise} Axios response promise
   */
  deleteProviderKey(provider) {
    return api.delete(`/settings/providers/${provider}/`);
  },

  /**
   * Retrieve list of built-in MCP servers and their tools.
   */
  getBuiltinMCPs() {
    return api.get('/mcp/builtin/');
  },

  /**
   * Retrieve list of user's custom MCP configurations.
   */
  listCustomMCPs() {
    return api.get('/mcp/custom/');
  },

  /**
   * Create a new custom MCP configuration.
   */
  createCustomMCP(data) {
    return api.post('/mcp/custom/', data);
  },

  /**
   * Update an existing custom MCP configuration.
   */
  updateCustomMCP(id, data) {
    return api.put(`/mcp/custom/${id}/`, data);
  },

  /**
   * Delete a custom MCP configuration.
   */
  deleteCustomMCP(id) {
    return api.delete(`/mcp/custom/${id}/`);
  }
};
