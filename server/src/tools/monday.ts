import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

const MONDAY_API_URL = 'https://api.monday.com/v2';

// Monday.com uses GraphQL, so we need a different fetch pattern
async function mondayGraphQL(query: string, variables?: Record<string, any>): Promise<any> {
  const apiKey = await getCredential('monday');
  
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Monday.com API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { data?: any; errors?: any[] };
  
  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

export const mondayTools = {
  monday_list_boards: {
    description: 'List all Monday.com boards accessible to you',
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().default(25),
    }),
    handler: async ({ limit = 25 }: { limit?: number }) => {
      const query = `
        query ($limit: Int!) {
          boards(limit: $limit) {
            id
            name
            description
            state
            board_folder_id
            workspace_id
            columns {
              id
              title
              type
            }
            groups {
              id
              title
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { limit });
      
      return {
        boards: data.boards || [],
        count: data.boards?.length || 0,
      };
    },
  },

  monday_get_board: {
    description: 'Get details of a specific Monday.com board including columns and groups',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
    }),
    handler: async ({ boardId }: { boardId: string }) => {
      const query = `
        query ($boardId: [ID!]!) {
          boards(ids: $boardId) {
            id
            name
            description
            state
            columns {
              id
              title
              type
              settings_str
            }
            groups {
              id
              title
              color
            }
            owners {
              id
              name
              email
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { boardId: [boardId] });
      
      if (!data.boards || data.boards.length === 0) {
        throw new Error(`Board not found: ${boardId}`);
      }

      return data.boards[0];
    },
  },

  monday_list_items: {
    description: 'List items from a Monday.com board, optionally filtered by group',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
      groupId: z.string().optional().describe('Filter by group ID'),
      limit: z.number().min(1).max(500).optional().default(50),
    }),
    handler: async ({ boardId, groupId, limit = 50 }: { boardId: string; groupId?: string; limit?: number }) => {
      let query: string;
      let variables: Record<string, any>;

      if (groupId) {
        query = `
          query ($boardId: ID!, $groupId: String!, $limit: Int!) {
            boards(ids: [$boardId]) {
              groups(ids: [$groupId]) {
                id
                title
                items_page(limit: $limit) {
                  items {
                    id
                    name
                    state
                    created_at
                    updated_at
                    column_values {
                      id
                      text
                      value
                      type
                    }
                  }
                }
              }
            }
          }
        `;
        variables = { boardId, groupId, limit };
      } else {
        query = `
          query ($boardId: ID!, $limit: Int!) {
            boards(ids: [$boardId]) {
              items_page(limit: $limit) {
                items {
                  id
                  name
                  state
                  group {
                    id
                    title
                  }
                  created_at
                  updated_at
                  column_values {
                    id
                    text
                    value
                    type
                  }
                }
              }
            }
          }
        `;
        variables = { boardId, limit };
      }

      const data = await mondayGraphQL(query, variables);
      
      if (!data.boards || data.boards.length === 0) {
        throw new Error(`Board not found: ${boardId}`);
      }

      const board = data.boards[0];
      let items: any[] = [];

      if (groupId && board.groups) {
        items = board.groups[0]?.items_page?.items || [];
      } else {
        items = board.items_page?.items || [];
      }

      return {
        boardId,
        groupId: groupId || null,
        items,
        count: items.length,
      };
    },
  },

  monday_get_item: {
    description: 'Get a specific item by ID with all its column values',
    inputSchema: z.object({
      itemId: z.string().describe('Item ID'),
    }),
    handler: async ({ itemId }: { itemId: string }) => {
      const query = `
        query ($itemId: ID!) {
          items(ids: [$itemId]) {
            id
            name
            state
            created_at
            updated_at
            board {
              id
              name
            }
            group {
              id
              title
            }
            column_values {
              id
              title
              text
              value
              type
            }
            subitems {
              id
              name
              state
            }
            updates {
              id
              body
              created_at
              creator {
                name
              }
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { itemId });
      
      if (!data.items || data.items.length === 0) {
        throw new Error(`Item not found: ${itemId}`);
      }

      return data.items[0];
    },
  },

  monday_create_item: {
    description: 'Create a new item in a Monday.com board',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
      itemName: z.string().describe('Name of the new item'),
      groupId: z.string().optional().describe('Group ID (uses first group if not specified)'),
      columnValues: z.record(z.any()).optional().describe('Column values as JSON object'),
    }),
    handler: async ({ boardId, itemName, groupId, columnValues }: {
      boardId: string;
      itemName: string;
      groupId?: string;
      columnValues?: Record<string, any>;
    }) => {
      const query = `
        mutation ($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
          create_item(
            board_id: $boardId
            item_name: $itemName
            group_id: $groupId
            column_values: $columnValues
          ) {
            id
            name
            state
            group {
              id
              title
            }
          }
        }
      `;

      const variables: Record<string, any> = {
        boardId,
        itemName,
      };

      if (groupId) variables.groupId = groupId;
      if (columnValues) variables.columnValues = JSON.stringify(columnValues);

      const data = await mondayGraphQL(query, variables);
      
      return {
        message: 'Item created successfully',
        item: data.create_item,
      };
    },
  },

  monday_update_item: {
    description: 'Update column values of an existing item',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
      itemId: z.string().describe('Item ID'),
      columnValues: z.record(z.any()).describe('Column values to update as JSON object'),
    }),
    handler: async ({ boardId, itemId, columnValues }: {
      boardId: string;
      itemId: string;
      columnValues: Record<string, any>;
    }) => {
      const query = `
        mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(
            board_id: $boardId
            item_id: $itemId
            column_values: $columnValues
          ) {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, {
        boardId,
        itemId,
        columnValues: JSON.stringify(columnValues),
      });
      
      return {
        message: 'Item updated successfully',
        item: data.change_multiple_column_values,
      };
    },
  },

  monday_create_update: {
    description: 'Add a comment/update to a Monday.com item',
    inputSchema: z.object({
      itemId: z.string().describe('Item ID'),
      body: z.string().describe('Comment/update text'),
    }),
    handler: async ({ itemId, body }: { itemId: string; body: string }) => {
      const query = `
        mutation ($itemId: ID!, $body: String!) {
          create_update(item_id: $itemId, body: $body) {
            id
            body
            created_at
            creator {
              name
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { itemId, body });
      
      return {
        message: 'Update added successfully',
        update: data.create_update,
      };
    },
  },

  monday_move_item: {
    description: 'Move an item to a different group',
    inputSchema: z.object({
      itemId: z.string().describe('Item ID'),
      groupId: z.string().describe('Target group ID'),
    }),
    handler: async ({ itemId, groupId }: { itemId: string; groupId: string }) => {
      const query = `
        mutation ($itemId: ID!, $groupId: String!) {
          move_item_to_group(item_id: $itemId, group_id: $groupId) {
            id
            name
            group {
              id
              title
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { itemId, groupId });
      
      return {
        message: 'Item moved successfully',
        item: data.move_item_to_group,
      };
    },
  },

  monday_archive_item: {
    description: 'Archive a Monday.com item',
    inputSchema: z.object({
      itemId: z.string().describe('Item ID'),
    }),
    handler: async ({ itemId }: { itemId: string }) => {
      const query = `
        mutation ($itemId: ID!) {
          archive_item(item_id: $itemId) {
            id
            name
            state
          }
        }
      `;

      const data = await mondayGraphQL(query, { itemId });
      
      return {
        message: 'Item archived successfully',
        item: data.archive_item,
      };
    },
  },

  monday_delete_item: {
    description: 'Delete a Monday.com item (permanently)',
    inputSchema: z.object({
      itemId: z.string().describe('Item ID'),
    }),
    handler: async ({ itemId }: { itemId: string }) => {
      const query = `
        mutation ($itemId: ID!) {
          delete_item(item_id: $itemId) {
            id
          }
        }
      `;

      const data = await mondayGraphQL(query, { itemId });
      
      return {
        message: 'Item deleted successfully',
        deletedId: data.delete_item?.id,
      };
    },
  },

  monday_search_items: {
    description: 'Search for items across boards by name or column value',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID to search in'),
      query: z.string().describe('Search query'),
      columnId: z.string().optional().describe('Specific column to search in'),
    }),
    handler: async ({ boardId, query: searchQuery, columnId }: {
      boardId: string;
      query: string;
      columnId?: string;
    }) => {
      // Use items_page with query_params for filtering
      const query = `
        query ($boardId: ID!, $searchQuery: String!) {
          items_page_by_column_values(
            board_id: $boardId
            columns: [{column_id: "name", column_values: [$searchQuery]}]
            limit: 50
          ) {
            items {
              id
              name
              state
              group {
                id
                title
              }
              column_values {
                id
                text
                value
              }
            }
          }
        }
      `;

      try {
        const data = await mondayGraphQL(query, { boardId, searchQuery });
        
        return {
          boardId,
          query: searchQuery,
          items: data.items_page_by_column_values?.items || [],
          count: data.items_page_by_column_values?.items?.length || 0,
        };
      } catch (error) {
        // Fallback: get all items and filter client-side
        logger.warn('Column search failed, falling back to client-side filter');
        
        const fallbackQuery = `
          query ($boardId: ID!) {
            boards(ids: [$boardId]) {
              items_page(limit: 500) {
                items {
                  id
                  name
                  state
                  group {
                    id
                    title
                  }
                  column_values {
                    id
                    text
                    value
                  }
                }
              }
            }
          }
        `;

        const data = await mondayGraphQL(fallbackQuery, { boardId });
        const allItems = data.boards?.[0]?.items_page?.items || [];
        
        const filtered = allItems.filter((item: any) => {
          const nameMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
          const columnMatch = item.column_values?.some((col: any) => 
            col.text?.toLowerCase().includes(searchQuery.toLowerCase())
          );
          return nameMatch || columnMatch;
        });

        return {
          boardId,
          query: searchQuery,
          items: filtered,
          count: filtered.length,
          note: 'Used client-side filtering',
        };
      }
    },
  },

  monday_get_groups: {
    description: 'Get all groups from a Monday.com board',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
    }),
    handler: async ({ boardId }: { boardId: string }) => {
      const query = `
        query ($boardId: [ID!]!) {
          boards(ids: $boardId) {
            groups {
              id
              title
              color
              position
            }
          }
        }
      `;

      const data = await mondayGraphQL(query, { boardId: [boardId] });
      
      if (!data.boards || data.boards.length === 0) {
        throw new Error(`Board not found: ${boardId}`);
      }

      return {
        boardId,
        groups: data.boards[0].groups || [],
      };
    },
  },

  monday_create_group: {
    description: 'Create a new group in a Monday.com board',
    inputSchema: z.object({
      boardId: z.string().describe('Board ID'),
      groupName: z.string().describe('Name of the new group'),
    }),
    handler: async ({ boardId, groupName }: { boardId: string; groupName: string }) => {
      const query = `
        mutation ($boardId: ID!, $groupName: String!) {
          create_group(board_id: $boardId, group_name: $groupName) {
            id
            title
          }
        }
      `;

      const data = await mondayGraphQL(query, { boardId, groupName });
      
      return {
        message: 'Group created successfully',
        group: data.create_group,
      };
    },
  },
};

// Register tools
Object.entries(mondayTools).forEach(([name, tool]) => {
  registerTool(name, 'monday', tool.description, tool.inputSchema);
});
