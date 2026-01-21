import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function hubspotFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const apiKey = await getCredential('hubspot');
  
  const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const hubspotTools = {
  hubspot_list_contacts: {
    description: 'List contacts from HubSpot CRM with optional filters',
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().default(10),
      after: z.string().optional().describe('Pagination cursor'),
    }),
    handler: async ({ limit = 10, after }: { limit?: number; after?: string }) => {
      let url = `/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,phone,company`;
      if (after) url += `&after=${after}`;
      
      const data = await hubspotFetch(url);
      
      return {
        contacts: data.results || [],
        total: data.total || 0,
        paging: data.paging || null,
      };
    },
  },

  hubspot_get_contact: {
    description: 'Get a specific contact by ID or email',
    inputSchema: z.object({
      contactId: z.string().optional().describe('Contact ID'),
      email: z.string().email().optional().describe('Contact email'),
    }),
    handler: async ({ contactId, email }: { contactId?: string; email?: string }) => {
      if (!contactId && !email) {
        throw new Error('Either contactId or email is required');
      }

      let data;
      if (contactId) {
        data = await hubspotFetch(`/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone,company,lifecyclestage`);
      } else {
        data = await hubspotFetch(`/crm/v3/objects/contacts/${email}?idProperty=email&properties=firstname,lastname,email,phone,company,lifecyclestage`);
      }

      return data;
    },
  },

  hubspot_create_contact: {
    description: 'Create a new contact in HubSpot',
    inputSchema: z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
    }),
    handler: async ({ email, firstName, lastName, phone, company }: { 
      email: string; 
      firstName?: string; 
      lastName?: string; 
      phone?: string; 
      company?: string; 
    }) => {
      const properties: Record<string, string> = { email };
      if (firstName) properties.firstname = firstName;
      if (lastName) properties.lastname = lastName;
      if (phone) properties.phone = phone;
      if (company) properties.company = company;

      const data = await hubspotFetch('/crm/v3/objects/contacts', {
        method: 'POST',
        body: JSON.stringify({ properties }),
      });

      return {
        message: 'Contact created successfully',
        contact: data,
      };
    },
  },

  hubspot_list_deals: {
    description: 'List deals from HubSpot CRM',
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().default(10),
      after: z.string().optional(),
    }),
    handler: async ({ limit = 10, after }: { limit?: number; after?: string }) => {
      let url = `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate,pipeline`;
      if (after) url += `&after=${after}`;
      
      const data = await hubspotFetch(url);
      
      return {
        deals: data.results || [],
        total: data.total || 0,
        paging: data.paging || null,
      };
    },
  },

  hubspot_create_deal: {
    description: 'Create a new deal in HubSpot',
    inputSchema: z.object({
      dealName: z.string(),
      amount: z.number().optional(),
      dealStage: z.string().optional(),
      closeDate: z.string().optional().describe('ISO date string'),
      pipeline: z.string().optional().default('default'),
    }),
    handler: async ({ dealName, amount, dealStage, closeDate, pipeline = 'default' }: {
      dealName: string;
      amount?: number;
      dealStage?: string;
      closeDate?: string;
      pipeline?: string;
    }) => {
      const properties: Record<string, any> = {
        dealname: dealName,
        pipeline,
      };
      if (amount) properties.amount = amount.toString();
      if (dealStage) properties.dealstage = dealStage;
      if (closeDate) properties.closedate = closeDate;

      const data = await hubspotFetch('/crm/v3/objects/deals', {
        method: 'POST',
        body: JSON.stringify({ properties }),
      });

      return {
        message: 'Deal created successfully',
        deal: data,
      };
    },
  },

  hubspot_list_companies: {
    description: 'List companies from HubSpot CRM',
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().default(10),
      after: z.string().optional(),
    }),
    handler: async ({ limit = 10, after }: { limit?: number; after?: string }) => {
      let url = `/crm/v3/objects/companies?limit=${limit}&properties=name,domain,industry,phone,city,state`;
      if (after) url += `&after=${after}`;
      
      const data = await hubspotFetch(url);
      
      return {
        companies: data.results || [],
        total: data.total || 0,
        paging: data.paging || null,
      };
    },
  },

  hubspot_search: {
    description: 'Search HubSpot CRM for contacts, deals, or companies',
    inputSchema: z.object({
      objectType: z.enum(['contacts', 'deals', 'companies']),
      query: z.string().describe('Search query'),
      limit: z.number().min(1).max(100).optional().default(10),
    }),
    handler: async ({ objectType, query, limit = 10 }: {
      objectType: 'contacts' | 'deals' | 'companies';
      query: string;
      limit?: number;
    }) => {
      const data = await hubspotFetch(`/crm/v3/objects/${objectType}/search`, {
        method: 'POST',
        body: JSON.stringify({
          query,
          limit,
        }),
      });

      return {
        objectType,
        results: data.results || [],
        total: data.total || 0,
      };
    },
  },
};

// Register tools
Object.entries(hubspotTools).forEach(([name, tool]) => {
  registerTool(name, 'hubspot', tool.description, tool.inputSchema);
});
