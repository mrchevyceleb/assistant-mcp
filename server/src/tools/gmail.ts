import { z } from 'zod';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../lib/logger.js';

// Types
interface GmailAccount {
  email: string;
  tokens: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
  };
}

interface SendAsAlias {
  sendAsEmail: string;
  displayName: string;
  isPrimary: boolean;
  isDefault: boolean;
  verificationStatus: string;
}

// Token storage paths
const TOKEN_DIR = path.join(os.homedir(), '.config', 'gmail-mcp');
const ACCOUNTS_PATH = path.join(TOKEN_DIR, 'accounts.json');
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS || '';

// OAuth scopes required for send-as functionality
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

// Cache for OAuth clients per account
const clientCache: Map<string, { client: OAuth2Client; gmail: gmail_v1.Gmail }> = new Map();

// Cache for send-as aliases per account (refreshed periodically)
const sendAsCache: Map<string, { aliases: SendAsAlias[]; timestamp: number }> = new Map();
const SENDAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function ensureTokenDir(): Promise<void> {
  try {
    await fs.mkdir(TOKEN_DIR, { recursive: true });
  } catch (e) {
    // Directory exists
  }
}

async function loadAccounts(): Promise<Record<string, GmailAccount>> {
  try {
    const data = await fs.readFile(ACCOUNTS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function saveAccounts(accounts: Record<string, GmailAccount>): Promise<void> {
  await ensureTokenDir();
  await fs.writeFile(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2));
}

async function getOAuthCredentials(): Promise<{ client_id: string; client_secret: string; redirect_uris: string[] }> {
  if (!CREDENTIALS_PATH) {
    throw new Error('GOOGLE_OAUTH_CREDENTIALS environment variable not set');
  }
  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8'));
  return credentials.installed || credentials.web;
}

async function getAuthClient(account: string): Promise<{ client: OAuth2Client; gmail: gmail_v1.Gmail }> {
  // Check cache
  const cached = clientCache.get(account);
  if (cached) return cached;

  const accounts = await loadAccounts();
  const accountData = accounts[account];
  
  if (!accountData) {
    throw new Error(`Gmail account not connected: ${account}. Use gmail_add_account to connect it.`);
  }

  const credentials = await getOAuthCredentials();
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0]
  );

  oauth2Client.setCredentials(accountData.tokens);

  // Set up automatic token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      const accts = await loadAccounts();
      if (accts[account]) {
        accts[account].tokens = {
          access_token: newTokens.access_token || accts[account].tokens.access_token,
          refresh_token: newTokens.refresh_token || accts[account].tokens.refresh_token,
          expiry_date: newTokens.expiry_date || accts[account].tokens.expiry_date,
        };
        await saveAccounts(accts);
        logger.info(`Gmail tokens refreshed for ${account}`);
      }
    } catch (e) {
      logger.error('Failed to save refreshed Gmail tokens:', e);
    }
  });

  // Force refresh if expired
  if (accountData.tokens.expiry_date && accountData.tokens.expiry_date < Date.now()) {
    logger.info(`Gmail token expired for ${account}, refreshing...`);
    const { credentials: refreshedCreds } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshedCreds);
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const result = { client: oauth2Client, gmail };
  clientCache.set(account, result);
  
  return result;
}

/**
 * Get send-as aliases for an account, with caching
 */
async function getSendAsAliases(account: string): Promise<SendAsAlias[]> {
  // Check cache
  const cached = sendAsCache.get(account);
  if (cached && Date.now() - cached.timestamp < SENDAS_CACHE_TTL) {
    return cached.aliases;
  }

  const { gmail } = await getAuthClient(account);
  const response = await gmail.users.settings.sendAs.list({ userId: 'me' });
  
  const aliases: SendAsAlias[] = (response.data.sendAs || []).map((alias) => ({
    sendAsEmail: alias.sendAsEmail || '',
    displayName: alias.displayName || '',
    isPrimary: alias.isPrimary || false,
    isDefault: alias.isDefault || false,
    verificationStatus: alias.verificationStatus || 'accepted',
  }));

  sendAsCache.set(account, { aliases, timestamp: Date.now() });
  return aliases;
}

/**
 * Validate that a from address is allowed for the given account
 */
async function validateSendAsAddress(account: string, fromEmail: string): Promise<SendAsAlias> {
  const aliases = await getSendAsAliases(account);
  
  const normalizedFrom = fromEmail.toLowerCase().trim();
  const alias = aliases.find(a => a.sendAsEmail.toLowerCase() === normalizedFrom);
  
  if (!alias) {
    const availableAliases = aliases.map(a => a.sendAsEmail).join(', ');
    throw new Error(
      `Send-as address "${fromEmail}" is not configured for account ${account}. ` +
      `Available send-as addresses: ${availableAliases}`
    );
  }

  if (alias.verificationStatus !== 'accepted' && !alias.isPrimary) {
    throw new Error(
      `Send-as address "${fromEmail}" is not verified (status: ${alias.verificationStatus}). ` +
      `Please complete verification in Gmail settings before using this address.`
    );
  }

  return alias;
}

/**
 * Create MIME message with proper From header
 */
function createMimeMessage(options: {
  to: string[];
  subject: string;
  body: string;
  from?: string;
  fromName?: string;
  cc?: string[];
  bcc?: string[];
  isHtml?: boolean;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const lines: string[] = [];

  // From header
  if (options.from) {
    const fromHeader = options.fromName 
      ? `"${options.fromName.replace(/"/g, '\\"')}" <${options.from}>`
      : options.from;
    lines.push(`From: ${fromHeader}`);
  }

  // To header
  lines.push(`To: ${options.to.join(', ')}`);

  // CC header
  if (options.cc && options.cc.length > 0) {
    lines.push(`Cc: ${options.cc.join(', ')}`);
  }

  // BCC header
  if (options.bcc && options.bcc.length > 0) {
    lines.push(`Bcc: ${options.bcc.join(', ')}`);
  }

  // Subject
  lines.push(`Subject: ${options.subject || ''}`);

  // Reply headers
  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  if (options.references) {
    lines.push(`References: ${options.references}`);
  }

  // Content type
  const contentType = options.isHtml ? 'text/html' : 'text/plain';
  lines.push(`Content-Type: ${contentType}; charset=UTF-8`);
  lines.push('MIME-Version: 1.0');

  // Empty line before body
  lines.push('');

  // Body
  lines.push(options.body);

  return lines.join('\r\n');
}

/**
 * Get the default account (first one, or matt@mattjohnston.io if available)
 */
async function getDefaultAccount(): Promise<string> {
  const accounts = await loadAccounts();
  const accountEmails = Object.keys(accounts);
  
  if (accountEmails.length === 0) {
    throw new Error('No Gmail accounts connected. Use gmail_add_account to connect one.');
  }

  // Prefer matt@mattjohnston.io as default
  if (accounts['matt@mattjohnston.io']) {
    return 'matt@mattjohnston.io';
  }

  return accountEmails[0];
}

/**
 * Parse email headers from a Gmail message
 */
function getHeader(message: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = message.payload?.headers || [];
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || undefined;
}

// Tool definitions
export const gmailTools = {
  gmail_list_accounts: {
    description: 'List all connected Gmail accounts with their status and available send-as addresses',
    inputSchema: z.object({}),
    handler: async () => {
      const accounts = await loadAccounts();
      const accountList = [];

      for (const email of Object.keys(accounts)) {
        try {
          const aliases = await getSendAsAliases(email);
          accountList.push({
            email,
            status: 'connected',
            sendAsAddresses: aliases.map(a => ({
              email: a.sendAsEmail,
              displayName: a.displayName,
              isPrimary: a.isPrimary,
              isDefault: a.isDefault,
              verified: a.verificationStatus === 'accepted' || a.isPrimary,
            })),
          });
        } catch (e: any) {
          accountList.push({
            email,
            status: 'error',
            error: e.message,
          });
        }
      }

      return { accounts: accountList };
    },
  },

  gmail_add_account: {
    description: 'Generate an OAuth URL to add a new Gmail account. Open the URL in a browser, authorize, then use gmail_complete_auth with the code.',
    inputSchema: z.object({}),
    handler: async () => {
      const credentials = await getOAuthCredentials();
      const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        credentials.redirect_uris[0]
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: GMAIL_SCOPES,
        prompt: 'consent',
      });

      return {
        authUrl,
        instructions: 'Open this URL in a browser, authorize access, then copy the authorization code from the redirect URL and call gmail_complete_auth with it.',
      };
    },
  },

  gmail_complete_auth: {
    description: 'Complete Gmail OAuth flow by providing the authorization code from the browser redirect',
    inputSchema: z.object({
      code: z.string().describe('Authorization code from the OAuth callback URL'),
    }),
    handler: async ({ code }: { code: string }) => {
      const credentials = await getOAuthCredentials();
      const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        credentials.redirect_uris[0]
      );

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Get user's email address
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const email = profile.data.emailAddress;

      if (!email) {
        throw new Error('Could not determine email address from Gmail profile');
      }

      // Save account
      const accounts = await loadAccounts();
      accounts[email] = {
        email,
        tokens: {
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          expiry_date: tokens.expiry_date || 0,
        },
      };
      await saveAccounts(accounts);

      // Get send-as aliases
      const aliases = await getSendAsAliases(email);

      return {
        success: true,
        email,
        message: `Gmail account ${email} connected successfully`,
        sendAsAddresses: aliases.map(a => ({
          email: a.sendAsEmail,
          displayName: a.displayName,
          isPrimary: a.isPrimary,
          verified: a.verificationStatus === 'accepted' || a.isPrimary,
        })),
      };
    },
  },

  gmail_remove_account: {
    description: 'Remove a connected Gmail account from the system',
    inputSchema: z.object({
      email: z.string().email().describe('Email address of the account to remove'),
    }),
    handler: async ({ email }: { email: string }) => {
      const accounts = await loadAccounts();
      
      if (!accounts[email]) {
        throw new Error(`Account ${email} is not connected`);
      }

      delete accounts[email];
      await saveAccounts(accounts);
      clientCache.delete(email);
      sendAsCache.delete(email);

      return {
        success: true,
        message: `Account ${email} removed successfully`,
      };
    },
  },

  gmail_list_sendas: {
    description: 'List all send-as aliases (From addresses) for a Gmail account. Shows which addresses can be used with the "from" parameter in gmail_send and gmail_reply.',
    inputSchema: z.object({
      account: z.string().email().optional().describe('Account email (defaults to primary account)'),
    }),
    handler: async ({ account }: { account?: string }) => {
      const targetAccount = account || await getDefaultAccount();
      const aliases = await getSendAsAliases(targetAccount);

      return {
        account: targetAccount,
        sendAsAddresses: aliases.map(a => ({
          email: a.sendAsEmail,
          displayName: a.displayName,
          isPrimary: a.isPrimary,
          isDefault: a.isDefault,
          verified: a.verificationStatus === 'accepted' || a.isPrimary,
          canUseAsFrom: a.verificationStatus === 'accepted' || a.isPrimary,
        })),
      };
    },
  },

  gmail_send: {
    description: 
      'Send an email from a specific account. Supports plain text and HTML. ' +
      'Use the optional "from" parameter to send as a different address (must be a verified send-as alias for the account). ' +
      'Use "fromName" to set the display name for the From header. ' +
      'Default sender: matt@mattjohnston.io',
    inputSchema: z.object({
      to: z.array(z.string().email()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email body (plain text or HTML)'),
      account: z.string().email().optional().describe('Account to send from (defaults to matt@mattjohnston.io)'),
      from: z.string().email().optional().describe(
        'Send-as email address. Must be a verified alias for the account. ' +
        'Use gmail_list_sendas to see available addresses. ' +
        'If omitted, uses the account\'s default send-as address.'
      ),
      fromName: z.string().optional().describe(
        'Display name for the From header (e.g., "Jill Johnston"). ' +
        'If omitted with a "from" address, uses the alias\'s configured display name.'
      ),
      cc: z.array(z.string().email()).optional().describe('CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
      isHtml: z.boolean().optional().default(false).describe('If true, body is treated as HTML (default: plain text)'),
    }),
    handler: async (args: {
      to: string[];
      subject: string;
      body: string;
      account?: string;
      from?: string;
      fromName?: string;
      cc?: string[];
      bcc?: string[];
      isHtml?: boolean;
    }) => {
      const targetAccount = args.account || await getDefaultAccount();
      const { gmail } = await getAuthClient(targetAccount);

      // Determine the From address and name
      let fromEmail: string | undefined;
      let fromDisplayName: string | undefined;

      if (args.from) {
        // Validate the send-as address
        const alias = await validateSendAsAddress(targetAccount, args.from);
        fromEmail = alias.sendAsEmail;
        fromDisplayName = args.fromName || alias.displayName || undefined;
      } else if (args.fromName) {
        // fromName without from - use the account's default address with custom name
        const aliases = await getSendAsAliases(targetAccount);
        const defaultAlias = aliases.find(a => a.isDefault) || aliases.find(a => a.isPrimary);
        if (defaultAlias) {
          fromEmail = defaultAlias.sendAsEmail;
          fromDisplayName = args.fromName;
        }
      }
      // If neither from nor fromName specified, Gmail uses the default

      // Create MIME message
      const mimeMessage = createMimeMessage({
        to: args.to,
        subject: args.subject,
        body: args.body,
        from: fromEmail,
        fromName: fromDisplayName,
        cc: args.cc,
        bcc: args.bcc,
        isHtml: args.isHtml,
      });

      // Encode and send
      const encodedMessage = Buffer.from(mimeMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        sentFrom: fromEmail || targetAccount,
        sentAs: fromDisplayName ? `${fromDisplayName} <${fromEmail || targetAccount}>` : fromEmail || targetAccount,
      };
    },
  },

  gmail_reply: {
    description: 
      'Reply to a specific email message. Automatically handles threading (In-Reply-To, References, threadId). ' +
      'Use the optional "from" parameter to reply as a different address (must be a verified send-as alias for the account). ' +
      'Use "fromName" to set the display name for the From header. ' +
      'Supports explicit cc/bcc, an extra-recipients override, and replyAll to auto-preserve original Cc + other To recipients. ' +
      'Detects account from original message if not specified.',
    inputSchema: z.object({
      messageId: z.string().describe('Gmail message ID to reply to'),
      body: z.string().describe('Reply body (plain text or HTML)'),
      account: z.string().email().optional().describe('Account email (auto-detected from message if not specified)'),
      from: z.string().email().optional().describe(
        'Send-as email address for the reply. Must be a verified alias for the account. ' +
        'Use gmail_list_sendas to see available addresses. ' +
        'If omitted, uses the account\'s default send-as address.'
      ),
      fromName: z.string().optional().describe(
        'Display name for the From header (e.g., "Jill Johnston"). ' +
        'If omitted with a "from" address, uses the alias\'s configured display name.'
      ),
      isHtml: z.boolean().optional().default(false).describe('If true, body is treated as HTML'),
      cc: z.array(z.string().email()).optional().describe('Explicit CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
      extraTo: z.array(z.string().email()).optional().describe('Additional To recipients beyond the original sender'),
      replyAll: z.boolean().optional().default(false).describe(
        'If true and no explicit cc provided, auto-preserve the original Cc list and any original To recipients (minus the account itself)'
      ),
    }),
    handler: async (args: {
      messageId: string;
      body: string;
      account?: string;
      from?: string;
      fromName?: string;
      isHtml?: boolean;
      cc?: string[];
      bcc?: string[];
      extraTo?: string[];
      replyAll?: boolean;
    }) => {
      // Get the original message to extract headers
      let targetAccount = args.account;
      
      if (!targetAccount) {
        targetAccount = await getDefaultAccount();
      }

      const { gmail } = await getAuthClient(targetAccount);

      // Get original message
      const originalMessage = await gmail.users.messages.get({
        userId: 'me',
        id: args.messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References'],
      });

      const originalFrom = getHeader(originalMessage.data, 'From') || '';
      const originalTo = getHeader(originalMessage.data, 'To') || '';
      const originalCc = getHeader(originalMessage.data, 'Cc') || '';
      const originalSubject = getHeader(originalMessage.data, 'Subject') || '';
      const originalMessageId = getHeader(originalMessage.data, 'Message-ID') || '';
      const originalReferences = getHeader(originalMessage.data, 'References') || '';
      const threadId = originalMessage.data.threadId;

      // Parse original sender to get reply-to address
      const fromMatch = originalFrom.match(/<([^>]+)>/) || [null, originalFrom];
      const replyToAddress = fromMatch[1] || originalFrom;

      // Build recipients list
      const toRecipients = [replyToAddress];
      if (args.extraTo) {
        toRecipients.push(...args.extraTo);
      }

      // Handle reply-all CC
      let ccRecipients = args.cc || [];
      if (args.replyAll && !args.cc) {
        // Parse original To and Cc, excluding our account
        const parseAddresses = (str: string): string[] => {
          const matches = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          return matches.filter(addr => addr.toLowerCase() !== targetAccount!.toLowerCase());
        };

        const originalToAddrs = parseAddresses(originalTo);
        const originalCcAddrs = parseAddresses(originalCc);
        ccRecipients = [...new Set([...originalToAddrs, ...originalCcAddrs])];
      }

      // Build subject (add Re: if not present)
      const subject = originalSubject.startsWith('Re:') 
        ? originalSubject 
        : `Re: ${originalSubject}`;

      // Build references header
      const references = originalReferences 
        ? `${originalReferences} ${originalMessageId}`
        : originalMessageId;

      // Determine the From address and name
      let fromEmail: string | undefined;
      let fromDisplayName: string | undefined;

      if (args.from) {
        const alias = await validateSendAsAddress(targetAccount, args.from);
        fromEmail = alias.sendAsEmail;
        fromDisplayName = args.fromName || alias.displayName || undefined;
      } else if (args.fromName) {
        const aliases = await getSendAsAliases(targetAccount);
        const defaultAlias = aliases.find(a => a.isDefault) || aliases.find(a => a.isPrimary);
        if (defaultAlias) {
          fromEmail = defaultAlias.sendAsEmail;
          fromDisplayName = args.fromName;
        }
      }

      // Create MIME message
      const mimeMessage = createMimeMessage({
        to: toRecipients,
        subject,
        body: args.body,
        from: fromEmail,
        fromName: fromDisplayName,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        bcc: args.bcc,
        isHtml: args.isHtml,
        inReplyTo: originalMessageId,
        references,
      });

      // Encode and send
      const encodedMessage = Buffer.from(mimeMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        inReplyTo: args.messageId,
        sentFrom: fromEmail || targetAccount,
        sentAs: fromDisplayName ? `${fromDisplayName} <${fromEmail || targetAccount}>` : fromEmail || targetAccount,
        toRecipients,
        ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
      };
    },
  },

  gmail_get_messages: {
    description: 'Get recent emails from all connected accounts (or specific accounts) in chronological order. Returns a unified stream.',
    inputSchema: z.object({
      maxResults: z.number().optional().default(20).describe('Maximum total messages to return (default: 20)'),
      accounts: z.array(z.string().email()).optional().describe('Filter to specific account emails. If omitted, fetches from all accounts.'),
      labelIds: z.array(z.string()).optional().describe('Gmail label IDs to filter by (e.g. ["INBOX"], ["SENT"]). Default: ["INBOX"]'),
      query: z.string().optional().describe('Gmail search query (e.g. "is:unread", "from:someone@example.com")'),
    }),
    handler: async (args: {
      maxResults?: number;
      accounts?: string[];
      labelIds?: string[];
      query?: string;
    }) => {
      const allAccounts = await loadAccounts();
      const targetAccounts = args.accounts || Object.keys(allAccounts);
      const maxResults = args.maxResults || 20;
      const labelIds = args.labelIds || ['INBOX'];

      const messages: any[] = [];

      for (const account of targetAccounts) {
        try {
          const { gmail } = await getAuthClient(account);
          
          const listParams: any = {
            userId: 'me',
            maxResults: Math.ceil(maxResults / targetAccounts.length),
            labelIds,
          };

          if (args.query) {
            listParams.q = args.query;
          }

          const response = await gmail.users.messages.list(listParams);
          
          if (response.data.messages) {
            for (const msg of response.data.messages) {
              const fullMsg = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
              });

              messages.push({
                id: msg.id,
                threadId: msg.threadId,
                account,
                from: getHeader(fullMsg.data, 'From'),
                to: getHeader(fullMsg.data, 'To'),
                subject: getHeader(fullMsg.data, 'Subject'),
                date: getHeader(fullMsg.data, 'Date'),
                snippet: fullMsg.data.snippet,
                labelIds: fullMsg.data.labelIds,
              });
            }
          }
        } catch (e: any) {
          logger.error(`Error fetching messages from ${account}:`, e);
        }
      }

      // Sort by date descending
      messages.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });

      return {
        messages: messages.slice(0, maxResults),
        totalFetched: messages.length,
      };
    },
  },

  gmail_get_message: {
    description: 'Get a specific email message by ID. Use full=true to get the complete body text.',
    inputSchema: z.object({
      messageId: z.string().describe('Gmail message ID'),
      account: z.string().email().optional().describe('Email account that contains the message'),
      full: z.boolean().optional().default(false).describe('If true, returns the full message body (default: metadata only)'),
    }),
    handler: async (args: { messageId: string; account?: string; full?: boolean }) => {
      const targetAccount = args.account || await getDefaultAccount();
      const { gmail } = await getAuthClient(targetAccount);

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: args.messageId,
        format: args.full ? 'full' : 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'],
      });

      const message: any = {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds,
        from: getHeader(response.data, 'From'),
        to: getHeader(response.data, 'To'),
        cc: getHeader(response.data, 'Cc'),
        subject: getHeader(response.data, 'Subject'),
        date: getHeader(response.data, 'Date'),
        snippet: response.data.snippet,
      };

      if (args.full && response.data.payload) {
        // Extract body
        const getBody = (part: any): string => {
          if (part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
          if (part.parts) {
            // Prefer text/plain over text/html
            const textPart = part.parts.find((p: any) => p.mimeType === 'text/plain');
            if (textPart) return getBody(textPart);
            const htmlPart = part.parts.find((p: any) => p.mimeType === 'text/html');
            if (htmlPart) return getBody(htmlPart);
            // Try first part
            return getBody(part.parts[0]);
          }
          return '';
        };

        message.body = getBody(response.data.payload);
      }

      return message;
    },
  },

  gmail_search: {
    description: 'Search across all connected Gmail accounts using Gmail search syntax (e.g. "from:bob subject:meeting").',
    inputSchema: z.object({
      query: z.string().describe('Gmail search query'),
      maxResults: z.number().optional().default(20).describe('Maximum results to return'),
      accounts: z.array(z.string().email()).optional().describe('Specific accounts to search'),
    }),
    handler: async (args: { query: string; maxResults?: number; accounts?: string[] }) => {
      const allAccounts = await loadAccounts();
      const targetAccounts = args.accounts || Object.keys(allAccounts);
      const maxResults = args.maxResults || 20;

      const results: any[] = [];

      for (const account of targetAccounts) {
        try {
          const { gmail } = await getAuthClient(account);
          
          const response = await gmail.users.messages.list({
            userId: 'me',
            q: args.query,
            maxResults: Math.ceil(maxResults / targetAccounts.length),
          });

          if (response.data.messages) {
            for (const msg of response.data.messages) {
              const fullMsg = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
              });

              results.push({
                id: msg.id,
                threadId: msg.threadId,
                account,
                from: getHeader(fullMsg.data, 'From'),
                to: getHeader(fullMsg.data, 'To'),
                subject: getHeader(fullMsg.data, 'Subject'),
                date: getHeader(fullMsg.data, 'Date'),
                snippet: fullMsg.data.snippet,
              });
            }
          }
        } catch (e: any) {
          logger.error(`Error searching ${account}:`, e);
        }
      }

      // Sort by date descending
      results.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });

      return {
        results: results.slice(0, maxResults),
        query: args.query,
      };
    },
  },

  gmail_archive: {
    description: 'Archive a single email message (removes INBOX label)',
    inputSchema: z.object({
      messageId: z.string().describe('Gmail message ID'),
      account: z.string().email().optional().describe('Account email'),
    }),
    handler: async (args: { messageId: string; account?: string }) => {
      const targetAccount = args.account || await getDefaultAccount();
      const { gmail } = await getAuthClient(targetAccount);

      await gmail.users.messages.modify({
        userId: 'me',
        id: args.messageId,
        requestBody: {
          removeLabelIds: ['INBOX'],
        },
      });

      return {
        success: true,
        messageId: args.messageId,
        action: 'archived',
      };
    },
  },

  gmail_archive_batch: {
    description: 'Archive multiple email messages at once (removes INBOX label from all)',
    inputSchema: z.object({
      messageIds: z.array(z.string()).describe('Array of Gmail message IDs to archive'),
      account: z.string().email().optional().describe('Account email'),
    }),
    handler: async (args: { messageIds: string[]; account?: string }) => {
      const targetAccount = args.account || await getDefaultAccount();
      const { gmail } = await getAuthClient(targetAccount);

      const results = [];

      for (const messageId of args.messageIds) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
              removeLabelIds: ['INBOX'],
            },
          });
          results.push({ messageId, success: true });
        } catch (e: any) {
          results.push({ messageId, success: false, error: e.message });
        }
      }

      return {
        archived: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    },
  },

  gmail_summary: {
    description: 'Get unread email counts and recent subject lines for all connected Gmail accounts. Use this for quick inbox overview.',
    inputSchema: z.object({}),
    handler: async () => {
      const allAccounts = await loadAccounts();
      const summaries = [];

      for (const account of Object.keys(allAccounts)) {
        try {
          const { gmail } = await getAuthClient(account);
          
          // Get unread count
          const unreadResponse = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread in:inbox',
            maxResults: 1,
          });
          
          const unreadCount = unreadResponse.data.resultSizeEstimate || 0;

          // Get recent subjects
          const recentResponse = await gmail.users.messages.list({
            userId: 'me',
            labelIds: ['INBOX'],
            maxResults: 5,
          });

          const recentSubjects = [];
          if (recentResponse.data.messages) {
            for (const msg of recentResponse.data.messages.slice(0, 5)) {
              const fullMsg = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From'],
              });
              recentSubjects.push({
                subject: getHeader(fullMsg.data, 'Subject'),
                from: getHeader(fullMsg.data, 'From'),
              });
            }
          }

          summaries.push({
            account,
            unreadCount,
            recentSubjects,
          });
        } catch (e: any) {
          summaries.push({
            account,
            error: e.message,
          });
        }
      }

      return { summaries };
    },
  },
};
