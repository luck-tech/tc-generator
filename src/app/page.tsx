"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("タイトルと仕様書の内容を入力してください");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, fileName }),
      });

      if (!docRes.ok) throw new Error("ドキュメントの作成に失敗しました");
      const doc = await docRes.json();

      const genRes = await fetch(`/api/documents/${doc.id}/generate`, {
        method: "POST",
      });

      if (!genRes.ok) throw new Error("生成の開始に失敗しました");

      router.push(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      if (!title) {
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-2xl font-bold text-accent">TC Generator</h1>
        <p className="text-sm text-muted mt-1">
          仕様書からテストケースを自動生成
        </p>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-3xl bg-card rounded-xl p-8 shadow-lg"
        >
          <h2 className="text-xl font-semibold mb-6">仕様書をアップロード</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-300 rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              タイトル
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="仕様書のタイトル"
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              ファイルアップロード（Markdownファイル）
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.markdown"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer"
            >
              {fileName ? fileName : "ファイルを選択"}
            </button>
          </div>

          <div className="mb-6">
            <label
              htmlFor="content"
              className="block text-sm font-medium mb-2"
            >
              仕様書テキスト
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="仕様書の内容をここに貼り付けてください..."
              rows={16}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono text-sm resize-y"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-background font-semibold rounded-lg py-3 hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "処理中..." : "生成開始"}
          </button>
        </form>
      </main>
    </div>
  );
}
