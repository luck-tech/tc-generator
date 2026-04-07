import OpenAI from "openai";
import { db } from "./db";
import { documents, features, testCases } from "./db/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Model config (ai-test-generator準拠)
const MODEL_CONFIG = {
  parseSpec: { model: "gpt-4o-mini" as const, temperature: 0.1 },
  generateViewpoints: { model: "gpt-4o" as const, temperature: 0.2 },
  generateTestCases: { model: "gpt-4o" as const, temperature: 0.4 },
  scoreTestCase: { model: "gpt-4o-mini" as const, temperature: 0.0 },
};

const MAX_CHUNK_SIZE = 3000;
const MAX_BATCH_CHARS = 3000;
const SCORE_THRESHOLD = 7;
const MAX_RETRY = 2;

// ========== Structured Output Schemas ==========

const FEATURES_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "features_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        features: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              summary: { type: "string" },
              rules: { type: "array", items: { type: "string" } },
              source_sections: { type: "array", items: { type: "string" } },
              page_url: { type: ["string", "null"] },
            },
            required: ["name", "summary", "rules", "source_sections", "page_url"],
            additionalProperties: false,
          },
        },
      },
      required: ["features"],
      additionalProperties: false,
    },
  },
};

const VIEWPOINTS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "viewpoints_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        viewpoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "priority"],
            additionalProperties: false,
          },
        },
      },
      required: ["viewpoints"],
      additionalProperties: false,
    },
  },
};

const TEST_CASES_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "test_cases_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        test_cases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              viewpoint: { type: "string" },
              title: { type: "string" },
              objective: { type: "string" },
              preconditions: { type: "array", items: { type: "string" } },
              url: { type: ["string", "null"] },
              test_data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    value: { type: "string" },
                  },
                  required: ["field", "value"],
                  additionalProperties: false,
                },
              },
              steps: { type: "array", items: { type: "string" } },
              expected_result: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              test_type: {
                type: "string",
                enum: ["ui_manual", "api_auto", "e2e_auto"],
              },
              missing_info: { type: "array", items: { type: "string" } },
            },
            required: [
              "viewpoint",
              "title",
              "objective",
              "preconditions",
              "url",
              "test_data",
              "steps",
              "expected_result",
              "priority",
              "test_type",
              "missing_info",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["test_cases"],
      additionalProperties: false,
    },
  },
};

const SCORE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "score_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        score: { type: "number" },
        issues: { type: "array", items: { type: "string" } },
        fix_instructions: { type: "array", items: { type: "string" } },
      },
      required: ["passed", "score", "issues", "fix_instructions"],
      additionalProperties: false,
    },
  },
};

// ========== Page Schema ==========

const PAGES_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "pages_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["url", "name", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["pages"],
      additionalProperties: false,
    },
  },
};

// ========== Types ==========

interface Page {
  url: string;
  name: string;
  description: string;
}

interface ExtractedFeature {
  name: string;
  summary: string;
  rules: string[];
  source_sections: string[];
  page_url: string | null;
}

interface Viewpoint {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface GeneratedTC {
  viewpoint: string;
  title: string;
  objective: string;
  preconditions: string[];
  url: string | null;
  test_data: { field: string; value: string }[];
  steps: string[];
  expected_result: string;
  priority: "high" | "medium" | "low";
  test_type: "ui_manual" | "api_auto" | "e2e_auto";
  missing_info: string[];
}

interface ScoreResult {
  passed: boolean;
  score: number;
  issues: string[];
  fix_instructions: string[];
}

// ========== Coverage Hints ==========

const COVERAGE_HINTS: Record<string, string[]> = {
  "管理|CRUD|一覧|作成|編集|削除": [
    "ステータス遷移の網羅（正常遷移・不正遷移）",
    "大量データ登録時のページネーション・レイアウト",
    "同時編集・競合時の動作",
    "削除時の関連データへの影響",
    "権限別のアクセス制御（閲覧のみ/編集可）",
  ],
  "検索|フィルタ|絞り込み": [
    "部分一致・完全一致・大文字小文字の検索精度",
    "検索結果0件時の表示",
    "特殊文字入力時の動作",
    "検索条件の組み合わせ",
  ],
  "アップロード|ファイル|インポート": [
    "許可されたファイル形式以外のアップロード試行",
    "ファイルサイズ上限の検証",
    "0バイトファイルのアップロード",
    "アップロード中のキャンセル・リトライ",
  ],
  "認証|ログイン|OAuth|接続": [
    "認証フロー全体の正常完了",
    "認証エラー時のリダイレクト",
    "トークン期限切れ時の動作",
    "接続解除後の再接続",
  ],
  "表示|ダッシュボード|グラフ|チャート": [
    "データ0件時の空状態表示",
    "大量データ時のパフォーマンス・表示崩れ",
    "リアルタイム更新（ポーリング）の動作",
    "ブラウザリサイズ時のレスポンシブ表示",
  ],
  "モーダル|ダイアログ|ポップアップ": [
    "モーダル内での入力→確定→反映のフロー",
    "モーダル外クリックでの閉じる動作",
    "モーダル内のバリデーション",
    "複数モーダルの同時表示防止",
  ],
};

function getCoverageHints(featureName: string, summary: string): string[] {
  const text = `${featureName} ${summary}`.toLowerCase();
  const hints: string[] = [];
  for (const [pattern, items] of Object.entries(COVERAGE_HINTS)) {
    const keywords = pattern.split("|");
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      hints.push(...items);
    }
  }
  return hints;
}

// ========== Section Splitting ==========

function splitIntoSections(content: string): { id: string; text: string }[] {
  const lines = content.split("\n");
  const sections: { id: string; text: string }[] = [];
  let current = "";
  let sectionId = 1;

  for (const line of lines) {
    if (line.startsWith("##") && current.trim()) {
      if (current.length > MAX_CHUNK_SIZE) {
        const subChunks = splitBySize(current, MAX_CHUNK_SIZE);
        for (const chunk of subChunks) {
          sections.push({ id: `sec-${sectionId++}`, text: chunk });
        }
      } else {
        sections.push({ id: `sec-${sectionId++}`, text: current });
      }
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) {
    sections.push({ id: `sec-${sectionId++}`, text: current });
  }
  return sections;
}

function splitBySize(text: string, maxSize: number): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length > maxSize && current.trim()) {
      chunks.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function batchSections(
  sections: { id: string; text: string }[]
): { ids: string[]; text: string }[] {
  const batches: { ids: string[]; text: string }[] = [];
  let currentBatch = { ids: [] as string[], text: "" };

  for (const section of sections) {
    if (
      currentBatch.text.length + section.text.length > MAX_BATCH_CHARS &&
      currentBatch.text.trim()
    ) {
      batches.push(currentBatch);
      currentBatch = { ids: [], text: "" };
    }
    currentBatch.ids.push(section.id);
    currentBatch.text += section.text + "\n\n";
  }
  if (currentBatch.text.trim()) batches.push(currentBatch);
  return batches;
}

// ========== Step 0: Extract Pages ==========

async function extractPages(content: string): Promise<Page[]> {
  console.log("[Step 0] ページ一覧抽出中...");

  const response = await openai.chat.completions.create({
    model: MODEL_CONFIG.parseSpec.model,
    temperature: MODEL_CONFIG.parseSpec.temperature,
    response_format: PAGES_SCHEMA,
    messages: [
      {
        role: "system",
        content: `あなたは仕様書分析の専門家です。仕様書からWebアプリケーションのページ（画面）一覧とそのURLを抽出してください。

## ルール
- 仕様書に記載されているURLパスを正確に抽出する
- 動的パラメータを含むURL（例: /features/{id}）もそのまま抽出する
- モーダルやドロップダウン等のページ内コンポーネントはページとして抽出しない
- 共通レイアウト（サイドバー、ヘッダー等）は「共通」として1件にまとめる`,
      },
      {
        role: "user",
        content: `以下の仕様書からページ一覧をJSON形式で抽出してください。\n\n${content}`,
      },
    ],
  });

  const parsed = JSON.parse(
    response.choices[0].message.content || '{"pages":[]}'
  );
  const pages = parsed.pages || [];
  console.log(`  ${pages.length}ページを抽出`);
  for (const p of pages) {
    console.log(`    ${p.url} - ${p.name}`);
  }
  return pages;
}

// ========== Step 1: Extract Features ==========

async function extractFeatures(
  content: string,
  pages: Page[]
): Promise<ExtractedFeature[]> {
  const sections = splitIntoSections(content);
  const batches = batchSections(sections);

  console.log(
    `[Step 1] 機能抽出: ${sections.length}セクション → ${batches.length}バッチ`
  );

  const allFeatures: ExtractedFeature[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`  バッチ ${i + 1}/${batches.length}`);

    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.parseSpec.model,
      temperature: MODEL_CONFIG.parseSpec.temperature,
      response_format: FEATURES_SCHEMA,
      messages: [
        {
          role: "system",
          content: `あなたは仕様書分析の専門家です。仕様書セクションから、テスト対象となる機能を抽出してください。

## 機能の粒度
- featureは「システムが提供する振る舞いの単位」
- 1セクションに複数の機能があれば全て抽出
- セクションの一部しか記載がなくても機能候補として抽出してよい

## 重要: ページとの紐づけ
各機能は必ず以下のページ一覧のいずれかに属します。page_urlにはそのページのURLを設定してください。
どのページにも属さない場合はnullにしてください。

${pages.map((p) => `- ${p.url}: ${p.name}（${p.description}）`).join("\n")}`,
        },
        {
          role: "user",
          content: `以下のセクションから機能を抽出し、各機能をページに紐づけてJSON形式で出力してください。\n\nセクションID: ${batch.ids.join(", ")}\n\n${batch.text}`,
        },
      ],
    });

    const parsed = JSON.parse(
      response.choices[0].message.content || '{"features":[]}'
    );
    for (const f of parsed.features || []) {
      allFeatures.push({
        name: f.name,
        summary: f.summary,
        page_url: f.page_url || null,
        rules: f.rules || [],
        source_sections: f.source_sections || batch.ids,
      });
    }
    await sleep(300);
  }

  // Deduplicate by name
  const unique = new Map<string, ExtractedFeature>();
  for (const f of allFeatures) {
    const existing = unique.get(f.name);
    if (existing) {
      existing.rules = [...new Set([...existing.rules, ...f.rules])];
      existing.source_sections = [
        ...new Set([...existing.source_sections, ...f.source_sections]),
      ];
    } else {
      unique.set(f.name, f);
    }
  }

  const result = Array.from(unique.values());
  console.log(`  ${result.length}件の機能を抽出`);
  return result;
}

// ========== Step 2: Generate Viewpoints ==========

async function generateViewpoints(
  feature: ExtractedFeature
): Promise<Viewpoint[]> {
  const hints = getCoverageHints(feature.name, feature.summary);
  const hintsText =
    hints.length > 0
      ? `\n\n## 追加で検討すべき観点（Coverage Hints）\n${hints.map((h) => `- ${h}`).join("\n")}`
      : "";

  const response = await openai.chat.completions.create({
    model: MODEL_CONFIG.generateViewpoints.model,
    temperature: MODEL_CONFIG.generateViewpoints.temperature,
    response_format: VIEWPOINTS_SCHEMA,
    messages: [
      {
        role: "system",
        content: `あなたはテスト設計の専門家です。機能仕様からテスト観点を網羅的に生成してください。

## 観点の漏れを防ぐためのチェックリスト
- 入力: 正常値、異常値、境界値、型違い、最大/最小、空文字、null
- 状態遷移: 初回/完了遷移、戻る操作、連続操作、不正遷移
- データ整合性: DB保存内容、更新/削除の影響、他画面との整合性
- ロール/権限: 管理者、一般ユーザー、未認証、権限の有無
- エラー: タイムアウト、API失敗、通信制御、バリデーション
- UI/UX: 表示崩れ、ローディング、ボタン活性/非活性、空状態表示
- パフォーマンス: 大量データ、連続操作、同時アクセス`,
      },
      {
        role: "user",
        content: `以下の機能のテスト観点をJSON形式で網羅的に生成してください。

機能名: ${feature.name}
概要: ${feature.summary}
ビジネスルール: ${feature.rules.join("; ")}
${hintsText}`,
      },
    ],
  });

  const parsed = JSON.parse(
    response.choices[0].message.content || '{"viewpoints":[]}'
  );
  return parsed.viewpoints || [];
}

// ========== Step 3: Generate Test Cases ==========

async function generateTestCase(
  feature: ExtractedFeature,
  viewpoint: Viewpoint,
  otherViewpoints: Viewpoint[],
  fixContext?: { issues: string[]; fix_instructions: string[] }
): Promise<GeneratedTC[]> {
  const otherVPText =
    otherViewpoints.length > 0
      ? `\n\n## 同じ機能の他のテスト観点（重複を避けてください）\n${otherViewpoints.map((v) => `- ${v.title}`).join("\n")}`
      : "";

  const fixText = fixContext
    ? `\n\n## 前回の品質問題（修正してください）\n問題: ${fixContext.issues.join("; ")}\n修正指示: ${fixContext.fix_instructions.join("; ")}`
    : "";

  const response = await openai.chat.completions.create({
    model: MODEL_CONFIG.generateTestCases.model,
    temperature: MODEL_CONFIG.generateTestCases.temperature,
    response_format: TEST_CASES_SCHEMA,
    messages: [
      {
        role: "system",
        content: `あなたはWebシステムの手動テストケースを作成するシニアQAリードです。

## テストケース品質基準（最重要）
- stepsは最低3ステップ以上。第三者がそのまま実行できる具体的な操作手順を書く
  - NG:「表示を確認する」
  - OK:「1. Features一覧ページ（/features）を開く」「2. 検索バーに"ユーザー認証"と入力する」
- preconditionsは具体的に書く
  - NG:「ログイン済み」
  - OK:「管理者権限を持つユーザーでログイン済み」「Featureが3件以上登録されている」
- expected_resultは観測可能で具体的
  - NG:「正しく表示される」
  - OK:「検索結果にFeature名"ユーザー認証"が表示され、CUカバレッジ率が%付きで表示される」
- urlはこの機能が属するページのURLを設定すること（下記に記載あり）。ページURLが提供されている場合は必ずそれを使うこと
- test_dataは具体的な値を含める
- 1つのテスト観点から、必要に応じて複数のテストケースを生成してよい

## test_type判定ルール
- URLがあり画面操作系 → "ui_manual"
- APIのリクエスト/レスポンス系 → "api_auto"
- 複数画面をまたぐフロー系 → "e2e_auto"

## missing_infoの記録
仕様書から取得できなかった情報を具体的に記録`,
      },
      {
        role: "user",
        content: `以下の観点に対してテストケースをJSON形式で生成してください。

機能名: ${feature.name}
ページURL: ${feature.page_url || "（不明）"}
概要: ${feature.summary}
ビジネスルール: ${feature.rules.join("; ")}

テスト観点: ${viewpoint.title}
観点の説明: ${viewpoint.description}
優先度: ${viewpoint.priority}
${otherVPText}${fixText}`,
      },
    ],
  });

  const parsed = JSON.parse(
    response.choices[0].message.content || '{"test_cases":[]}'
  );
  return parsed.test_cases || [];
}

// ========== Scorer ==========

async function scoreTestCase(tc: GeneratedTC): Promise<ScoreResult> {
  const response = await openai.chat.completions.create({
    model: MODEL_CONFIG.scoreTestCase.model,
    temperature: MODEL_CONFIG.scoreTestCase.temperature,
    response_format: SCORE_SCHEMA,
    messages: [
      {
        role: "system",
        content: `あなたはテストケースの品質を採点する審査AIです。

## 採点基準（合計10点満点）
- steps (0-3点): 4ステップ以上で具体的な画面遷移・操作・確認 → 3点
- preconditions (0-2点): 権限、データ件数、画面状態など3項目以上 → 2点
- expected_result (0-3点): 画面状態・文言・数値が60文字以上で具体的 → 3点
- title_objective (0-2点): titleが15文字以上かつobjectiveが25文字以上 → 2点`,
      },
      {
        role: "user",
        content: `以下のテストケースを採点し、JSON形式で結果を返してください:
タイトル: ${tc.title}
目的: ${tc.objective}
前提条件: ${tc.preconditions.join("; ")}
手順: ${tc.steps.join("; ")}
期待結果: ${tc.expected_result}`,
      },
    ],
  });

  const parsed = JSON.parse(
    response.choices[0].message.content ||
      '{"passed":true,"score":10,"issues":[],"fix_instructions":[]}'
  );
  return {
    passed: parsed.score >= SCORE_THRESHOLD,
    score: parsed.score,
    issues: parsed.issues || [],
    fix_instructions: parsed.fix_instructions || [],
  };
}

// ========== Main Generation ==========

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runGeneration(documentId: string): Promise<void> {
  try {
    await db
      .update(documents)
      .set({ status: "parsed" })
      .where(eq(documents.id, documentId));

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
    if (!doc) throw new Error("Document not found");

    // Step 0: Extract pages
    const pages = await extractPages(doc.content);

    // Step 1: Extract features (batched, with page mapping)
    const extractedFeatures = await extractFeatures(doc.content, pages);

    const savedFeatures: { id: string; feature: ExtractedFeature }[] = [];
    for (const f of extractedFeatures) {
      const [saved] = await db
        .insert(features)
        .values({
          documentId,
          name: f.name,
          summary: f.summary,
          rules: f.rules,
        })
        .returning();
      savedFeatures.push({ id: saved.id, feature: f });
    }

    console.log(`[Step 1] ${savedFeatures.length}件の機能をDB保存`);

    await db
      .update(documents)
      .set({ status: "generating" })
      .where(eq(documents.id, documentId));

    // Step 2 & 3: Per feature → viewpoints → per viewpoint → TC (with scoring)
    let totalTCs = 0;

    for (const { id: featureId, feature } of savedFeatures) {
      console.log(`\n[Step 2] 機能: ${feature.name}`);

      const viewpoints = await generateViewpoints(feature);
      console.log(`  観点: ${viewpoints.length}件`);
      await sleep(300);

      for (let vi = 0; vi < viewpoints.length; vi++) {
        const vp = viewpoints[vi];
        const otherVPs = viewpoints.filter((_, j) => j !== vi);

        console.log(
          `  [Step 3] 観点 ${vi + 1}/${viewpoints.length}: ${vp.title}`
        );

        let tcs = await generateTestCase(feature, vp, otherVPs);
        await sleep(300);

        // Score and retry
        for (let tci = 0; tci < tcs.length; tci++) {
          const tc = tcs[tci];
          const scoreResult = await scoreTestCase(tc);

          if (!scoreResult.passed) {
            console.log(
              `    TC "${tc.title.substring(0, 20)}..." スコア${scoreResult.score}/10 → 再生成`
            );

            for (let retry = 0; retry < MAX_RETRY; retry++) {
              const improved = await generateTestCase(feature, vp, otherVPs, {
                issues: scoreResult.issues,
                fix_instructions: scoreResult.fix_instructions,
              });
              if (improved.length > 0) {
                const newScore = await scoreTestCase(improved[0]);
                if (newScore.passed) {
                  tcs[tci] = improved[0];
                  console.log(
                    `    再生成成功: スコア${newScore.score}/10`
                  );
                  break;
                }
              }
              await sleep(300);
            }
          }
        }

        // Save TCs to DB
        for (const tc of tcs) {
          await db.insert(testCases).values({
            documentId,
            featureId,
            title: tc.title,
            objective: tc.objective,
            preconditions: tc.preconditions,
            url: tc.url,
            testData: tc.test_data,
            steps: tc.steps,
            expectedResult: tc.expected_result,
            priority: tc.priority,
            testType: tc.test_type,
            missingInfo: tc.missing_info,
          });
          totalTCs++;
        }
        await sleep(200);
      }
    }

    console.log(`\n[完了] ${totalTCs}件のテストケースを生成`);

    await db
      .update(documents)
      .set({ status: "completed" })
      .where(eq(documents.id, documentId));
  } catch (error) {
    console.error("Generation failed:", error);
    await db
      .update(documents)
      .set({ status: "failed" })
      .where(eq(documents.id, documentId));
  }
}
