const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('mcp_auth_token');
}

// Set auth token
export function setAuthToken(token: string): void {
  localStorage.setItem('mcp_auth_token', token);
}

// Clear auth token
export function clearAuthToken(): void {
  localStorage.removeItem('mcp_auth_token');
}

// Check if authenticated
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// Generic fetch wrapper with auth
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    clearAuthToken();
    throw new Error('Authentication expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

// Health check (no auth required)
export async function checkHealth(): Promise<{
  status: string;
  uptime: number;
  timestamp: string;
  tools: { total: number; categories: string[] };
}> {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}

// Validate token
export async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Dashboard
export interface DashboardData {
  health: {
    status: string;
    uptime: number;
    lastCheck: string;
  };
  stats: {
    last24h: {
      totalCalls: number;
      successfulCalls: number;
      errorRate: number;
      avgExecutionTime: number;
    };
    toolStats: Record<string, { calls: number; errors: number }>;
  };
  credentials: {
    count: number;
    services: string[];
  };
}

export async function getDashboard(): Promise<DashboardData> {
  return fetchWithAuth('/admin/api/dashboard');
}

// Credentials
export interface Credential {
  service: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listCredentials(): Promise<{ credentials: Credential[] }> {
  return fetchWithAuth('/admin/api/credentials');
}

export async function storeCredential(
  service: string,
  apiKey: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth('/admin/api/credentials', {
    method: 'POST',
    body: JSON.stringify({ service, apiKey, metadata }),
  });
}

export async function deleteCredential(service: string): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/admin/api/credentials/${encodeURIComponent(service)}`, {
    method: 'DELETE',
  });
}

export async function testCredential(service: string): Promise<{
  valid: boolean;
  message?: string;
  error?: string;
  keyLength?: number;
  keyPreview?: string;
}> {
  return fetchWithAuth(`/admin/api/credentials/${encodeURIComponent(service)}/test`, {
    method: 'POST',
  });
}

// Tools
export interface Tool {
  name: string;
  description: string;
  category: string;
  inputSchema: {
    required: string[];
    properties: string[];
  };
}

export async function listTools(): Promise<{
  total: number;
  categories: string[];
  tools: Tool[];
  byCategory: Record<string, Tool[]>;
}> {
  return fetchWithAuth('/admin/api/tools');
}

export async function testTool(
  name: string,
  args?: Record<string, unknown>
): Promise<{
  success: boolean;
  tool: string;
  executionTime: number;
  result?: unknown;
  error?: string;
}> {
  return fetchWithAuth(`/admin/api/tools/${encodeURIComponent(name)}/test`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args || {} }),
  });
}

// Usage stats
export interface UsageStats {
  period: {
    days: number;
    since: string;
  };
  totals: {
    calls: number;
    errors: number;
  };
  byTool: Record<string, { calls: number; errors: number; totalTime: number }>;
  byDay: Record<string, { calls: number; errors: number }>;
  byCategory: Record<string, { calls: number; errors: number }>;
}

export async function getUsageStats(days = 7): Promise<UsageStats> {
  return fetchWithAuth(`/admin/api/stats/usage?days=${days}`);
}
