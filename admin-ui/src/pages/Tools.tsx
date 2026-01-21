import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  X,
} from 'lucide-react';
import { listTools, testTool } from '../api/client';
import type { Tool } from '../api/client';

export default function Tools() {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [testModal, setTestModal] = useState<Tool | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    executionTime: number;
    result?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: listTools,
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleTest = async (tool: Tool) => {
    setTestModal(tool);
    setTestResult(null);
    setTesting(true);

    try {
      const result = await testTool(tool.name);
      setTestResult({
        success: result.success,
        executionTime: result.executionTime,
        result: result.result as Record<string, unknown> | undefined,
        error: result.error,
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        executionTime: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  // Filter tools by search
  const filteredByCategory = toolsQuery.data?.byCategory || {};
  const categories = Object.keys(filteredByCategory).filter((category) => {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    return filteredByCategory[category].some(
      (tool) =>
        tool.name.toLowerCase().includes(lowerSearch) ||
        tool.description.toLowerCase().includes(lowerSearch)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        <span className="text-gray-500">
          {toolsQuery.data?.total || 0} tools across {toolsQuery.data?.categories?.length || 0} categories
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={20}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools..."
          className="input pl-10"
        />
      </div>

      {/* Tool Categories */}
      {toolsQuery.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => {
            const tools = filteredByCategory[category].filter((tool) => {
              if (!search) return true;
              const lowerSearch = search.toLowerCase();
              return (
                tool.name.toLowerCase().includes(lowerSearch) ||
                tool.description.toLowerCase().includes(lowerSearch)
              );
            });

            if (tools.length === 0) return null;

            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="card p-0 overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown size={20} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={20} className="text-gray-400" />
                    )}
                    <span className="font-semibold capitalize">{category}</span>
                    <span className="text-sm text-gray-500">
                      ({tools.length} tools)
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {tools.map((tool, index) => (
                      <div
                        key={tool.name}
                        className={`p-4 ${
                          index < tools.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-mono text-sm font-medium">
                              {tool.name}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                              {tool.description}
                            </p>
                            {tool.inputSchema.required.length > 0 && (
                              <p className="text-xs text-gray-400 mt-2">
                                Required: {tool.inputSchema.required.join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleTest(tool)}
                            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium ml-4"
                          >
                            <Play size={16} />
                            Test
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Test Modal */}
      {testModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Test: {testModal.name}</h2>
              <button
                onClick={() => {
                  setTestModal(null);
                  setTestResult(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-4">{testModal.description}</p>

              {testing ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-primary-600" />
                  <span className="ml-2">Running test...</span>
                </div>
              ) : testResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <>
                        <CheckCircle className="text-green-600" size={20} />
                        <span className="text-green-600 font-medium">Success</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="text-red-600" size={20} />
                        <span className="text-red-600 font-medium">Failed</span>
                      </>
                    )}
                    <span className="text-gray-400 text-sm">
                      ({testResult.executionTime}ms)
                    </span>
                  </div>

                  {testResult.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-red-700 text-sm">{testResult.error}</p>
                    </div>
                  )}

                  {testResult.result && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <pre className="text-sm overflow-auto max-h-64">
                        {JSON.stringify(testResult.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Click "Run Test" to execute this tool with empty arguments
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => {
                  setTestModal(null);
                  setTestResult(null);
                }}
                className="btn-secondary"
              >
                Close
              </button>
              <button
                onClick={() => handleTest(testModal)}
                disabled={testing}
                className="btn-primary flex items-center gap-2"
              >
                {testing && <Loader2 size={16} className="animate-spin" />}
                Run Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
