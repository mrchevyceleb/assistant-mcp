import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import {
  listCredentials,
  storeCredential,
  deleteCredential,
  testCredential,
} from '../api/client';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

export default function Credentials() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newService, setNewService] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; message?: string }>>({});

  const credentialsQuery = useQuery({
    queryKey: ['credentials'],
    queryFn: listCredentials,
  });

  const storeMutation = useMutation({
    mutationFn: ({ service, apiKey }: { service: string; apiKey: string }) =>
      storeCredential(service, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setShowAddForm(false);
      setNewService('');
      setNewApiKey('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newService && newApiKey) {
      storeMutation.mutate({ service: newService, apiKey: newApiKey });
    }
  };

  const handleTest = async (service: string) => {
    try {
      const result = await testCredential(service);
      setTestResults((prev) => ({
        ...prev,
        [service]: { valid: result.valid, message: result.message || result.error },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [service]: { valid: false, message: err.message },
      }));
    }
  };

  const handleDelete = (service: string) => {
    if (confirm(`Delete credential for "${service}"?`)) {
      deleteMutation.mutate(service);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Credentials</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Credential
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Add New Credential</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Name
              </label>
              <input
                type="text"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                placeholder="e.g., openai, github, stripe"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Enter API key..."
                  className="input pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={storeMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                {storeMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Save Credential
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewService('');
                  setNewApiKey('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>

            {storeMutation.isError && (
              <p className="text-red-600 text-sm">
                {(storeMutation.error as Error).message}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Credentials Table */}
      <div className="card">
        {credentialsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : credentialsQuery.data?.credentials?.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No credentials stored yet. Click "Add Credential" to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Last Updated</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentialsQuery.data?.credentials?.map((cred) => (
                  <tr key={cred.service} className="border-b border-gray-100">
                    <td className="py-4">
                      <span className="font-medium">{cred.service}</span>
                    </td>
                    <td className="py-4 text-sm text-gray-500">
                      {formatDate(cred.updated_at)}
                    </td>
                    <td className="py-4">
                      {testResults[cred.service] ? (
                        testResults[cred.service].valid ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle size={16} /> Valid
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-sm">
                            <XCircle size={16} /> Invalid
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400 text-sm">Not tested</span>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleTest(cred.service)}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleDelete(cred.service)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
