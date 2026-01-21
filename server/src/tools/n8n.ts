import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

async function n8nFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const apiKey = await getCredential('n8n');
  const apiUrl = process.env.N8N_API_URL || 'https://et-t.app.n8n.cloud/api/v1';
  
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`n8n API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const n8nTools = {
  n8n_list_workflows: {
    description: 'List all workflows in n8n',
    inputSchema: z.object({
      active: z.boolean().optional().describe('Filter by active status'),
      limit: z.number().min(1).max(100).optional().default(20),
    }),
    handler: async ({ active, limit = 20 }: { active?: boolean; limit?: number }) => {
      let url = `/workflows?limit=${limit}`;
      if (active !== undefined) url += `&active=${active}`;
      
      const data = await n8nFetch(url);
      
      return {
        workflows: data.data || [],
        count: data.data?.length || 0,
      };
    },
  },

  n8n_get_workflow: {
    description: 'Get details of a specific workflow',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID'),
    }),
    handler: async ({ workflowId }: { workflowId: string }) => {
      const data = await n8nFetch(`/workflows/${workflowId}`);
      return data;
    },
  },

  n8n_activate_workflow: {
    description: 'Activate or deactivate a workflow',
    inputSchema: z.object({
      workflowId: z.string(),
      active: z.boolean(),
    }),
    handler: async ({ workflowId, active }: { workflowId: string; active: boolean }) => {
      const data = await n8nFetch(`/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });

      return {
        message: `Workflow ${active ? 'activated' : 'deactivated'} successfully`,
        workflow: data,
      };
    },
  },

  n8n_execute_workflow: {
    description: 'Execute a workflow manually',
    inputSchema: z.object({
      workflowId: z.string(),
      data: z.record(z.any()).optional().describe('Input data for the workflow'),
    }),
    handler: async ({ workflowId, data = {} }: { workflowId: string; data?: Record<string, any> }) => {
      const result = await n8nFetch(`/workflows/${workflowId}/run`, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      return {
        message: 'Workflow execution started',
        execution: result,
      };
    },
  },

  n8n_list_executions: {
    description: 'List workflow executions',
    inputSchema: z.object({
      workflowId: z.string().optional().describe('Filter by workflow ID'),
      status: z.enum(['success', 'error', 'waiting']).optional(),
      limit: z.number().min(1).max(100).optional().default(20),
    }),
    handler: async ({ workflowId, status, limit = 20 }: { 
      workflowId?: string; 
      status?: string; 
      limit?: number; 
    }) => {
      let url = `/executions?limit=${limit}`;
      if (workflowId) url += `&workflowId=${workflowId}`;
      if (status) url += `&status=${status}`;
      
      const data = await n8nFetch(url);
      
      return {
        executions: data.data || [],
        count: data.data?.length || 0,
      };
    },
  },

  n8n_get_execution: {
    description: 'Get details of a specific execution',
    inputSchema: z.object({
      executionId: z.string(),
    }),
    handler: async ({ executionId }: { executionId: string }) => {
      const data = await n8nFetch(`/executions/${executionId}`);
      return data;
    },
  },

  n8n_create_workflow: {
    description: 'Create a new workflow in n8n',
    inputSchema: z.object({
      name: z.string().describe('Name of the workflow'),
      nodes: z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string().describe('Node type (e.g., n8n-nodes-base.httpRequest)'),
        typeVersion: z.number().optional().default(1),
        position: z.tuple([z.number(), z.number()]).describe('[x, y] position'),
        parameters: z.record(z.any()).optional().default({}),
        credentials: z.record(z.any()).optional(),
      })).describe('Array of nodes in the workflow'),
      connections: z.record(z.any()).optional().default({}).describe('Node connections object'),
      settings: z.object({
        saveExecutionProgress: z.boolean().optional(),
        saveManualExecutions: z.boolean().optional(),
        saveDataErrorExecution: z.string().optional(),
        saveDataSuccessExecution: z.string().optional(),
        executionTimeout: z.number().optional(),
        timezone: z.string().optional(),
      }).optional().default({}),
      active: z.boolean().optional().default(false),
    }),
    handler: async ({ name, nodes, connections, settings, active }: {
      name: string;
      nodes: any[];
      connections?: Record<string, any>;
      settings?: Record<string, any>;
      active?: boolean;
    }) => {
      const workflow = {
        name,
        nodes,
        connections: connections || {},
        settings: settings || {},
        active: active || false,
      };

      const data = await n8nFetch('/workflows', {
        method: 'POST',
        body: JSON.stringify(workflow),
      });

      return {
        message: 'Workflow created successfully',
        workflow: data,
      };
    },
  },

  n8n_update_workflow: {
    description: 'Update an existing workflow (replaces entire workflow)',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID to update'),
      name: z.string().optional(),
      nodes: z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string(),
        typeVersion: z.number().optional(),
        position: z.tuple([z.number(), z.number()]),
        parameters: z.record(z.any()).optional(),
        credentials: z.record(z.any()).optional(),
      })).optional(),
      connections: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional(),
      active: z.boolean().optional(),
    }),
    handler: async ({ workflowId, ...updates }: {
      workflowId: string;
      name?: string;
      nodes?: any[];
      connections?: Record<string, any>;
      settings?: Record<string, any>;
      active?: boolean;
    }) => {
      // First get the existing workflow
      const existing = await n8nFetch(`/workflows/${workflowId}`);
      
      // Merge updates
      const updatedWorkflow = {
        ...existing,
        ...updates,
      };

      const data = await n8nFetch(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedWorkflow),
      });

      return {
        message: 'Workflow updated successfully',
        workflow: data,
      };
    },
  },

  n8n_add_node: {
    description: 'Add a node to an existing workflow',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID'),
      node: z.object({
        name: z.string().describe('Unique node name'),
        type: z.string().describe('Node type (e.g., n8n-nodes-base.httpRequest)'),
        typeVersion: z.number().optional().default(1),
        position: z.tuple([z.number(), z.number()]).describe('[x, y] position'),
        parameters: z.record(z.any()).optional().default({}),
        credentials: z.record(z.any()).optional(),
      }),
      connectFrom: z.object({
        nodeName: z.string().describe('Name of the node to connect from'),
        outputIndex: z.number().optional().default(0),
      }).optional().describe('Connect this node from another node'),
    }),
    handler: async ({ workflowId, node, connectFrom }: {
      workflowId: string;
      node: any;
      connectFrom?: { nodeName: string; outputIndex?: number };
    }) => {
      // Get existing workflow
      const workflow = await n8nFetch(`/workflows/${workflowId}`);
      
      // Add the new node
      const newNode = {
        id: crypto.randomUUID(),
        ...node,
        parameters: node.parameters || {},
      };
      workflow.nodes.push(newNode);

      // Add connection if specified
      if (connectFrom) {
        const sourceNode = connectFrom.nodeName;
        const outputIndex = connectFrom.outputIndex || 0;
        
        if (!workflow.connections[sourceNode]) {
          workflow.connections[sourceNode] = { main: [] };
        }
        if (!workflow.connections[sourceNode].main[outputIndex]) {
          workflow.connections[sourceNode].main[outputIndex] = [];
        }
        workflow.connections[sourceNode].main[outputIndex].push({
          node: newNode.name,
          type: 'main',
          index: 0,
        });
      }

      // Update the workflow
      const data = await n8nFetch(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify(workflow),
      });

      return {
        message: `Node "${node.name}" added successfully`,
        nodeId: newNode.id,
        workflow: data,
      };
    },
  },

  n8n_update_node: {
    description: 'Update a specific node in a workflow',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID'),
      nodeName: z.string().describe('Name of the node to update'),
      parameters: z.record(z.any()).optional().describe('New parameters (merged with existing)'),
      position: z.tuple([z.number(), z.number()]).optional().describe('New [x, y] position'),
      credentials: z.record(z.any()).optional().describe('Credentials to set'),
      newName: z.string().optional().describe('Rename the node'),
    }),
    handler: async ({ workflowId, nodeName, parameters, position, credentials, newName }: {
      workflowId: string;
      nodeName: string;
      parameters?: Record<string, any>;
      position?: [number, number];
      credentials?: Record<string, any>;
      newName?: string;
    }) => {
      // Get existing workflow
      const workflow = await n8nFetch(`/workflows/${workflowId}`);
      
      // Find the node
      const nodeIndex = workflow.nodes.findIndex((n: any) => n.name === nodeName);
      if (nodeIndex === -1) {
        throw new Error(`Node "${nodeName}" not found in workflow`);
      }

      // Update the node
      const node = workflow.nodes[nodeIndex];
      if (parameters) {
        node.parameters = { ...node.parameters, ...parameters };
      }
      if (position) {
        node.position = position;
      }
      if (credentials) {
        node.credentials = { ...node.credentials, ...credentials };
      }
      if (newName) {
        // Also update connections that reference this node
        const oldName = node.name;
        node.name = newName;
        
        // Update connections from this node
        if (workflow.connections[oldName]) {
          workflow.connections[newName] = workflow.connections[oldName];
          delete workflow.connections[oldName];
        }
        
        // Update connections to this node
        for (const [sourceName, sourceConns] of Object.entries(workflow.connections)) {
          const conns = sourceConns as any;
          if (conns.main) {
            for (const outputConns of conns.main) {
              if (outputConns) {
                for (const conn of outputConns) {
                  if (conn.node === oldName) {
                    conn.node = newName;
                  }
                }
              }
            }
          }
        }
      }

      // Update the workflow
      const data = await n8nFetch(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify(workflow),
      });

      return {
        message: `Node "${nodeName}" updated successfully`,
        workflow: data,
      };
    },
  },

  n8n_remove_node: {
    description: 'Remove a node from a workflow',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID'),
      nodeName: z.string().describe('Name of the node to remove'),
    }),
    handler: async ({ workflowId, nodeName }: {
      workflowId: string;
      nodeName: string;
    }) => {
      // Get existing workflow
      const workflow = await n8nFetch(`/workflows/${workflowId}`);
      
      // Remove the node
      const nodeIndex = workflow.nodes.findIndex((n: any) => n.name === nodeName);
      if (nodeIndex === -1) {
        throw new Error(`Node "${nodeName}" not found in workflow`);
      }
      workflow.nodes.splice(nodeIndex, 1);

      // Remove connections from this node
      delete workflow.connections[nodeName];

      // Remove connections to this node
      for (const [sourceName, sourceConns] of Object.entries(workflow.connections)) {
        const conns = sourceConns as any;
        if (conns.main) {
          for (let i = 0; i < conns.main.length; i++) {
            if (conns.main[i]) {
              conns.main[i] = conns.main[i].filter((c: any) => c.node !== nodeName);
            }
          }
        }
      }

      // Update the workflow
      const data = await n8nFetch(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify(workflow),
      });

      return {
        message: `Node "${nodeName}" removed successfully`,
        workflow: data,
      };
    },
  },

  n8n_delete_workflow: {
    description: 'Delete a workflow from n8n',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID to delete'),
    }),
    handler: async ({ workflowId }: { workflowId: string }) => {
      await n8nFetch(`/workflows/${workflowId}`, {
        method: 'DELETE',
      });

      return {
        message: 'Workflow deleted successfully',
        workflowId,
      };
    },
  },

  n8n_duplicate_workflow: {
    description: 'Duplicate an existing workflow',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow ID to duplicate'),
      newName: z.string().describe('Name for the new workflow'),
    }),
    handler: async ({ workflowId, newName }: {
      workflowId: string;
      newName: string;
    }) => {
      // Get existing workflow
      const existing = await n8nFetch(`/workflows/${workflowId}`);
      
      // Create new workflow
      const newWorkflow = {
        name: newName,
        nodes: existing.nodes,
        connections: existing.connections,
        settings: existing.settings,
        active: false,
      };

      const data = await n8nFetch('/workflows', {
        method: 'POST',
        body: JSON.stringify(newWorkflow),
      });

      return {
        message: 'Workflow duplicated successfully',
        originalId: workflowId,
        newWorkflow: data,
      };
    },
  },
};

// Register tools
Object.entries(n8nTools).forEach(([name, tool]) => {
  registerTool(name, 'n8n', tool.description, tool.inputSchema);
});
