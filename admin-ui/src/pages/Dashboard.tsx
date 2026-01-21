import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Key,
  Zap,
} from 'lucide-react';
import { getDashboard, checkHealth } from '../api/client';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function Dashboard() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 30000,
  });

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 60000,
  });

  const health = healthQuery.data;
  const dashboard = dashboardQuery.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Health status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Status */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Server Status</p>
              {healthQuery.isLoading ? (
                <p className="text-lg font-semibold text-gray-400">Loading...</p>
              ) : health?.status === 'healthy' ? (
                <p className="text-lg font-semibold text-green-600 flex items-center gap-2">
                  <CheckCircle size={20} /> Healthy
                </p>
              ) : (
                <p className="text-lg font-semibold text-red-600 flex items-center gap-2">
                  <XCircle size={20} /> Unhealthy
                </p>
              )}
            </div>
            <Activity className="text-gray-400" size={32} />
          </div>
        </div>

        {/* Uptime */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Uptime</p>
              <p className="text-lg font-semibold">
                {health ? formatUptime(health.uptime) : '—'}
              </p>
            </div>
            <Clock className="text-gray-400" size={32} />
          </div>
        </div>

        {/* Tools */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Available Tools</p>
              <p className="text-lg font-semibold">
                {health?.tools?.total || '—'}
              </p>
            </div>
            <Zap className="text-gray-400" size={32} />
          </div>
        </div>

        {/* Credentials */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Stored Credentials</p>
              <p className="text-lg font-semibold">
                {dashboard?.credentials?.count || '—'}
              </p>
            </div>
            <Key className="text-gray-400" size={32} />
          </div>
        </div>
      </div>

      {/* 24h Stats */}
      {dashboard && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Last 24 Hours</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Calls</p>
              <p className="text-2xl font-bold">{dashboard.stats.last24h.totalCalls}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Successful</p>
              <p className="text-2xl font-bold text-green-600">
                {dashboard.stats.last24h.successfulCalls}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Error Rate</p>
              <p className="text-2xl font-bold text-red-600">
                {dashboard.stats.last24h.errorRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Response</p>
              <p className="text-2xl font-bold">
                {dashboard.stats.last24h.avgExecutionTime}ms
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Tools */}
      {dashboard && Object.keys(dashboard.stats.toolStats).length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Tool Activity (24h)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-2">Tool</th>
                  <th className="pb-2 text-right">Calls</th>
                  <th className="pb-2 text-right">Errors</th>
                  <th className="pb-2 text-right">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboard.stats.toolStats)
                  .sort(([, a], [, b]) => b.calls - a.calls)
                  .slice(0, 10)
                  .map(([tool, stats]) => (
                    <tr key={tool} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-sm">{tool}</td>
                      <td className="py-2 text-right">{stats.calls}</td>
                      <td className="py-2 text-right text-red-600">
                        {stats.errors > 0 ? stats.errors : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {((stats.calls - stats.errors) / stats.calls * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stored Credentials */}
      {dashboard && dashboard.credentials.services.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Stored Credentials</h2>
          <div className="flex flex-wrap gap-2">
            {dashboard.credentials.services.map((service) => (
              <span
                key={service}
                className="px-3 py-1 bg-gray-100 rounded-full text-sm"
              >
                {service}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
