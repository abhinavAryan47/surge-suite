import api from './api';

/**
 * Service methods for task and agent resources
 */
export const taskServices = {
  /**
   * List tasks for a given workspace.
   */
  list(workspaceId) {
    return api.get(`/tasks/?workspace=${workspaceId}`);
  },

  /**
   * Create a new task in a workspace.
   */
  create(workspaceId, problemStatement) {
    return api.post('/tasks/', {
      workspace: workspaceId,
      problem_statement: problemStatement
    });
  },

  /**
   * Retrieve task details, executions, and events by ID.
   */
  retrieve(id) {
    return api.get(`/tasks/${id}/`);
  },

  /**
   * Trigger synchronous execution of a task.
   */
  execute(id) {
    return api.post(`/tasks/${id}/execute/`, {}, { timeout: 120000 });
  },

  /**
   * List active agents.
   */
  listAgents() {
    return api.get('/agents/');
  },

  /**
   * Retrieve details of a specific agent.
   */
  retrieveAgent(id) {
    return api.get(`/agents/${id}/`);
  },

  /**
   * Phase 4.7: Approve a pending shell command authorization request.
   * "Allow Once" — approves ONLY this exact pending command for this task.
   */
  approve(taskId, approvalId) {
    return api.post(`/tasks/${taskId}/approvals/${approvalId}/approve/`, {}, { timeout: 120000 });
  },

  /**
   * Phase 4.7: Deny a pending shell command authorization request.
   * The command will NOT be executed and the agent receives denial feedback.
   */
  deny(taskId, approvalId) {
    return api.post(`/tasks/${taskId}/approvals/${approvalId}/deny/`, {}, { timeout: 120000 });
  },
};
