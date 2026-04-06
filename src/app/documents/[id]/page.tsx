"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

interface Feature {
  id: string;
  name: string;
  summary: string;
}

interface TestCase {
  id: string;
  featureId: string;
  title: string;
  objective: string;
  preconditions: string[];
  url: string | null;
  testData: { field: string; value: string }[];
  steps: string[];
  expectedResult: string;
  priority: "high" | "medium" | "low";
  testType: "ui_manual" | "api_auto" | "e2e_auto";
  missingInfo: string[];
  isEdited: boolean;
}

interface DocumentData {
  document: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  };
  features: Feature[];
  testCases: TestCase[];
}

const statusLabels: Record<string, { label: string; color: string }> = {
  uploaded: { label: "アップロード済み", color: "text-muted" },
  parsed: { label: "解析中...", color: "text-blue-400" },
  generating: { label: "テストケース生成中...", color: "text-accent" },
  completed: { label: "完了", color: "text-green-400" },
  failed: { label: "失敗", color: "text-red-400" },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "bg-red-500/20 text-red-400" },
  medium: { label: "Medium", color: "bg-yellow-500/20 text-yellow-400" },
  low: { label: "Low", color: "bg-green-500/20 text-green-400" },
};

const testTypeLabels: Record<string, string> = {
  ui_manual: "UI手動",
  api_auto: "API自動",
  e2e_auto: "E2E自動",
};

function EditPanel({
  tc,
  featureName,
  onSave,
  onClose,
}: {
  tc: TestCase;
  featureName: string;
  onSave: (tcId: string, data: Partial<TestCase>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: tc.title,
    objective: tc.objective,
    preconditions: tc.preconditions.join("\n"),
    url: tc.url || "",
    testData: JSON.stringify(tc.testData, null, 2),
    steps: tc.steps.join("\n"),
    expectedResult: tc.expectedResult,
    priority: tc.priority,
    testType: tc.testType,
  });
  const [saving, setSaving] = useState(false);

  const missingFields = new Set(
    tc.missingInfo.map((info) => info.split(":")[0].trim())
  );

  function fieldClass(fieldName: string) {
    return missingFields.has(fieldName)
      ? "border-warning/60 bg-warning/5"
      : "border-border";
  }

  async function handleSave() {
    setSaving(true);
    try {
      let parsedTestData = tc.testData;
      try {
        parsedTestData = JSON.parse(form.testData);
      } catch {
        // keep original if parse fails
      }

      await onSave(tc.id, {
        title: form.title,
        objective: form.objective,
        preconditions: form.preconditions.split("\n").filter(Boolean),
        url: form.url || null,
        testData: parsedTestData,
        steps: form.steps.split("\n").filter(Boolean),
        expectedResult: form.expectedResult,
        priority: form.priority as TestCase["priority"],
        testType: form.testType as TestCase["testType"],
      });
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={6} className="p-0">
        <div className="bg-card/80 border-t border-border p-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted">
              Feature: {featureName}
            </span>
            <span className="text-xs text-muted">ID: {tc.id}</span>
          </div>

          {tc.missingInfo.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
              <span className="font-semibold">情報不足: </span>
              {tc.missingInfo.join(" / ")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                タイトル
              </label>
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("title")}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                URL
              </label>
              <input
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="画面URL"
                className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("url")}`}
              />
              {missingFields.has("url") && (
                <p className="text-xs text-warning mt-1">
                  情報が不足しています
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              テスト目的
            </label>
            <textarea
              value={form.objective}
              onChange={(e) =>
                setForm((f) => ({ ...f, objective: e.target.value }))
              }
              rows={2}
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("objective")}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                前提条件（1行1項目）
              </label>
              <textarea
                value={form.preconditions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preconditions: e.target.value }))
                }
                rows={3}
                className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("preconditions")}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                テストデータ (JSON)
              </label>
              <textarea
                value={form.testData}
                onChange={(e) =>
                  setForm((f) => ({ ...f, testData: e.target.value }))
                }
                rows={3}
                className={`w-full bg-background border rounded-lg px-3 py-2 text-sm font-mono ${fieldClass("test_data")}`}
              />
              {missingFields.has("test_data") && (
                <p className="text-xs text-warning mt-1">
                  情報が不足しています
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              操作手順（1行1ステップ）
            </label>
            <textarea
              value={form.steps}
              onChange={(e) =>
                setForm((f) => ({ ...f, steps: e.target.value }))
              }
              rows={4}
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("steps")}`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              期待結果
            </label>
            <textarea
              value={form.expectedResult}
              onChange={(e) =>
                setForm((f) => ({ ...f, expectedResult: e.target.value }))
              }
              rows={2}
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${fieldClass("expected_result")}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                優先度
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    priority: e.target.value as "high" | "medium" | "low",
                  }))
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                テストタイプ
              </label>
              <select
                value={form.testType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    testType: e.target.value as
                      | "ui_manual"
                      | "api_auto"
                      | "e2e_auto",
                  }))
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="ui_manual">UI手動</option>
                <option value="api_auto">API自動</option>
                <option value="e2e_auto">E2E自動</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent text-background font-medium rounded-lg px-6 py-2 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={onClose}
              className="bg-background border border-border text-foreground rounded-lg px-6 py-2 text-sm hover:border-accent/50 transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DocumentData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while not completed/failed
  useEffect(() => {
    if (!data) return;
    const status = data.document.status;
    if (status === "completed" || status === "failed") return;

    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  async function handleSave(tcId: string, updates: Partial<TestCase>) {
    const res = await fetch(`/api/documents/${id}/test-cases/${tcId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Update failed");
    await fetchData();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted">読み込み中...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">ドキュメントが見つかりません</div>
      </div>
    );
  }

  const { document: doc, features, testCases } = data;
  const featureMap = new Map(features.map((f) => [f.id, f.name]));
  const status = statusLabels[doc.status] || statusLabels.uploaded;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-accent hover:underline text-sm">
            &larr; トップに戻る
          </Link>
          <h1 className="text-2xl font-bold mt-1">{doc.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium ${status.color}`}>
            {status.label}
          </span>
          {doc.status === "completed" && (
            <a
              href={`/api/documents/${id}/export`}
              className="bg-accent text-background font-medium rounded-lg px-4 py-2 text-sm hover:bg-accent-hover transition-colors"
            >
              CSVエクスポート
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Features */}
        {features.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">抽出された機能</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.id}
                  className="bg-card rounded-lg p-4 border border-border"
                >
                  <h3 className="font-medium text-accent">{f.name}</h3>
                  <p className="text-sm text-muted mt-1">{f.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Test Cases */}
        {testCases.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                テストケース ({testCases.length}件)
              </h2>
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-left">
                    <th className="px-4 py-3 font-medium">Feature</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">URL</th>
                    <th className="px-4 py-3 font-medium">Test Type</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">情報不足</th>
                  </tr>
                </thead>
                <tbody>
                  {testCases.map((tc) => {
                    const isExpanded = expandedId === tc.id;
                    const hasMissing = tc.missingInfo.length > 0;
                    const prio = priorityLabels[tc.priority];

                    return (
                      <React.Fragment key={tc.id}>
                        <tr
                          onClick={() =>
                            setExpandedId(isExpanded ? null : tc.id)
                          }
                          className="border-b border-border/50 hover:bg-background/30 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-accent">
                            {featureMap.get(tc.featureId) || "-"}
                          </td>
                          <td className="px-4 py-3">{tc.title}</td>
                          <td className="px-4 py-3 text-muted font-mono text-xs">
                            {tc.url || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {testTypeLabels[tc.testType] || tc.testType}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${prio.color}`}
                            >
                              {prio.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {hasMissing && (
                              <span
                                className="text-warning text-lg"
                                title={tc.missingInfo.join("\n")}
                              >
                                &#9888;
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <EditPanel
                            tc={tc}
                            featureName={
                              featureMap.get(tc.featureId) || "-"
                            }
                            onSave={handleSave}
                            onClose={() => setExpandedId(null)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Loading state */}
        {doc.status !== "completed" &&
          doc.status !== "failed" &&
          testCases.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-pulse text-accent text-lg mb-2">
                {status.label}
              </div>
              <p className="text-muted text-sm">
                テストケースを生成しています。しばらくお待ちください...
              </p>
            </div>
          )}

        {doc.status === "failed" && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="text-red-400 font-medium">
              テストケースの生成に失敗しました
            </p>
            <p className="text-muted text-sm mt-1">
              仕様書の内容を確認して再度お試しください
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
