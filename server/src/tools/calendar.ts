import { z } from 'zod';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Types
interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  location?: string;
  htmlLink?: string;
}

// OAuth client setup
let oauth2Client: OAuth2Client | null = null;
let calendar: any = null;

const TOKEN_PATH = path.join(os.homedir(), '.config', 'google-calendar-mcp', 'tokens.json');
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS || '';

async function getAuthClient(): Promise<OAuth2Client> {
  if (oauth2Client && calendar) return oauth2Client;

  try {
    // Load credentials
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Load tokens
    const tokenData = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
    const tokens = tokenData.normal || tokenData;
    
    oauth2Client.setCredentials(tokens);

    // Set up automatic token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      try {
        const existingData = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
        const updatedTokens = {
          ...existingData,
          normal: {
            ...(existingData.normal || {}),
            ...newTokens,
          }
        };
        await fs.writeFile(TOKEN_PATH, JSON.stringify(updatedTokens, null, 2));
        console.log('Calendar tokens refreshed and saved');
      } catch (e) {
        console.error('Failed to save refreshed tokens:', e);
      }
    });

    // Force token refresh if expired
    const expiryDate = tokens.expiry_date;
    if (expiryDate && expiryDate < Date.now()) {
      console.log('Calendar token expired, refreshing...');
      const { credentials: refreshedCreds } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshedCreds);
    }

    calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    return oauth2Client;
  } catch (error: any) {
    console.error('Calendar auth error details:', error);
    if (error.message?.includes('unauthorized_client')) {
      throw new Error(`Calendar OAuth token expired or revoked. Re-run calendar authorization to get a fresh token. Original error: ${error.message}`);
    }
    throw new Error(`Calendar authentication failed: ${error.message}`);
  }
}

// Tool definitions
export const calendarTools = {
  list_calendars: {
    description: 'List all available Google calendars for the authenticated account',
    inputSchema: z.object({}),
    handler: async () => {
      await getAuthClient();
      const res = await calendar.calendarList.list();
      return {
        calendars: res.data.items?.map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary || false,
          timeZone: cal.timeZone,
        })) || [],
      };
    },
  },

  list_events: {
    description: 'List upcoming events from a calendar. Shows events from now onwards by default.',
    inputSchema: z.object({
      calendarId: z.string().optional().describe('Calendar ID (defaults to primary calendar)'),
      maxResults: z.number().optional().describe('Maximum number of events to return (default: 10)'),
      timeMin: z.string().optional().describe('Start time (ISO 8601 format)'),
      timeMax: z.string().optional().describe('End time (ISO 8601 format)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();
      const res = await calendar.events.list({
        calendarId: args.calendarId || 'primary',
        timeMin: args.timeMin || new Date().toISOString(),
        timeMax: args.timeMax,
        maxResults: args.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return {
        events: res.data.items?.map((event: any) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end,
          attendees: event.attendees,
          location: event.location,
          htmlLink: event.htmlLink,
        })) || [],
      };
    },
  },

  create_event: {
    description: 'Create a new calendar event',
    inputSchema: z.object({
      summary: z.string().describe('Event title'),
      description: z.string().optional().describe('Event description'),
      start: z.string().describe('Start time (ISO 8601 format)'),
      end: z.string().describe('End time (ISO 8601 format)'),
      attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
      location: z.string().optional().describe('Event location'),
      calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();

      const event = {
        summary: args.summary,
        description: args.description,
        location: args.location,
        start: {
          dateTime: args.start,
          timeZone: 'America/Chicago', // TODO: Make this configurable
        },
        end: {
          dateTime: args.end,
          timeZone: 'America/Chicago',
        },
        attendees: args.attendees?.map((email: string) => ({ email })),
      };

      const res = await calendar.events.insert({
        calendarId: args.calendarId || 'primary',
        requestBody: event,
      });

      return {
        success: true,
        event: {
          id: res.data.id,
          summary: res.data.summary,
          start: res.data.start,
          end: res.data.end,
          htmlLink: res.data.htmlLink,
        },
      };
    },
  },

  get_event: {
    description: 'Get details of a specific calendar event',
    inputSchema: z.object({
      eventId: z.string().describe('Event ID'),
      calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();
      const res = await calendar.events.get({
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
      });

      return {
        id: res.data.id,
        summary: res.data.summary,
        description: res.data.description,
        start: res.data.start,
        end: res.data.end,
        attendees: res.data.attendees,
        location: res.data.location,
        htmlLink: res.data.htmlLink,
        organizer: res.data.organizer,
      };
    },
  },

  update_event: {
    description: 'Update an existing calendar event',
    inputSchema: z.object({
      eventId: z.string().describe('Event ID to update'),
      summary: z.string().optional().describe('New event title'),
      description: z.string().optional().describe('New event description'),
      start: z.string().optional().describe('New start time (ISO 8601 format)'),
      end: z.string().optional().describe('New end time (ISO 8601 format)'),
      attendees: z.array(z.string()).optional().describe('New list of attendee emails'),
      location: z.string().optional().describe('New event location'),
      calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();

      // First get the existing event
      const existing = await calendar.events.get({
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
      });

      // Build update object with only provided fields
      const updates: any = { ...existing.data };

      if (args.summary) updates.summary = args.summary;
      if (args.description) updates.description = args.description;
      if (args.location) updates.location = args.location;
      if (args.start) {
        updates.start = { dateTime: args.start, timeZone: 'America/Chicago' };
      }
      if (args.end) {
        updates.end = { dateTime: args.end, timeZone: 'America/Chicago' };
      }
      if (args.attendees) {
        updates.attendees = args.attendees.map((email: string) => ({ email }));
      }

      const res = await calendar.events.update({
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
        requestBody: updates,
      });

      return {
        success: true,
        event: {
          id: res.data.id,
          summary: res.data.summary,
          start: res.data.start,
          end: res.data.end,
          htmlLink: res.data.htmlLink,
        },
      };
    },
  },

  delete_event: {
    description: 'Delete a calendar event',
    inputSchema: z.object({
      eventId: z.string().describe('Event ID to delete'),
      calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();
      await calendar.events.delete({
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
      });

      return {
        success: true,
        message: `Event ${args.eventId} deleted successfully`,
      };
    },
  },

  get_freebusy: {
    description: 'Check free/busy time for one or more calendars to find available slots',
    inputSchema: z.object({
      timeMin: z.string().describe('Start time to check (ISO 8601 format)'),
      timeMax: z.string().describe('End time to check (ISO 8601 format)'),
      calendarIds: z.array(z.string()).optional().describe('Calendar IDs to check (defaults to primary)'),
    }),
    handler: async (args: any) => {
      await getAuthClient();

      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: args.timeMin,
          timeMax: args.timeMax,
          items: (args.calendarIds || ['primary']).map((id: string) => ({ id })),
        },
      });

      return {
        calendars: res.data.calendars,
      };
    },
  },
};
