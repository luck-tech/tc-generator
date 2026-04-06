import OpenAI from "openai";
import { db } from "./db";
import { documents, features, testCases } from "./db/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ExtractedFeature {
  name: string;
  summary: string;
  rules: string[];
}

interface Viewpoint {
  featureName: string;
  viewpoints: string[];
}

interface GeneratedTC {
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

async function extractFeatures(content: string): Promise<ExtractedFeature[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `あなたは仕様書分析の専門家です。与えられた仕様書テキストから機能を抽出してください。

以下のJSON形式で出力してください:
{
  "features": [
    {
      "name": "機能名",
      "summary": "機能の概要説明",
      "rules": ["ビジネスルール1", "ビジネスルール2"]
    }
  ]
}

注意:
- 1つの仕様書から複数の機能を抽出すること
- 各機能のビジネスルール・制約を漏れなく抽出すること
- 機能名は簡潔に、概要説明は具体的に記述すること`,
      },
      {
        role: "user",
        content: `以下の仕様書から機能を抽出してください:\n\n${content}`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  return parsed.features || [];
}

async function generateViewpoints(
  feature: ExtractedFeature,
  specContent: string
): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `あなたはテスト設計の専門家です。機能仕様からテスト観点を網羅的に生成してください。

テスト観点には以下を含めること:
- 正常系テスト（基本操作、境界値）
- 異常系テスト（バリデーション、エラーハンドリング）
- 状態遷移テスト
- セキュリティ観点
- UIの表示確認

以下のJSON形式で出力してください:
{
  "viewpoints": ["テスト観点1", "テスト観点2", ...]
}`,
      },
      {
        role: "user",
        content: `機能名: ${feature.name}
概要: ${feature.summary}
ビジネスルール: ${feature.rules.join(", ")}

元の仕様書:
${specContent}

この機能のテスト観点を生成してください。`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  return parsed.viewpoints || [];
}

async function generateTestCasesFromViewpoints(
  feature: ExtractedFeature,
  viewpoints: string[],
  specContent: string
): Promise<GeneratedTC[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `あなたはテストケース設計の専門家です。テスト観点からテストケースを生成してください。

各テストケースは以下の品質基準を満たすこと:
1. titleは日本語15文字以上で具体的に記述
2. objectiveは日本語25文字以上でテストの目的を明確に記述
3. preconditionsは具体的に（ログイン状態、データ状態、画面状態を明記）
4. urlは仕様書に画面URLの記載があれば設定、なければnull
5. test_dataは具体的な値を含む（例: {"field": "email", "value": "test@example.com"}）
6. stepsは3ステップ以上、具体的な操作手順を記述
7. expected_resultは観測可能で具体的、60文字以上
8. priorityはテストの重要度に応じてhigh/medium/lowを設定
9. test_typeの判定ルール:
   - URLがあり画面操作系 → "ui_manual"
   - API系 → "api_auto"
   - 複数画面をまたぐフロー系 → "e2e_auto"
10. missing_info: 仕様書から取得できなかった情報を記録
    - 例: ["url: 画面URLが仕様書に記載なし", "test_data: テストデータの具体値が仕様書に記載なし"]

以下のJSON形式で出力してください:
{
  "test_cases": [
    {
      "title": "テストケースタイトル",
      "objective": "テスト目的",
      "preconditions": ["前提条件1", "前提条件2"],
      "url": "/path/to/page" or null,
      "test_data": [{"field": "フィールド名", "value": "具体値"}],
      "steps": ["手順1", "手順2", "手順3"],
      "expected_result": "期待結果（60文字以上の具体的な記述）",
      "priority": "high",
      "test_type": "ui_manual",
      "missing_info": []
    }
  ]
}`,
      },
      {
        role: "user",
        content: `機能名: ${feature.name}
概要: ${feature.summary}
ビジネスルール: ${feature.rules.join(", ")}

テスト観点:
${viewpoints.map((v, i) => `${i + 1}. ${v}`).join("\n")}

元の仕様書:
${specContent}

各テスト観点に対して1つ以上のテストケースを生成してください。`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  return parsed.test_cases || [];
}

export async function runGeneration(documentId: string): Promise<void> {
  try {
    // Update status to parsed
    await db
      .update(documents)
      .set({ status: "parsed" })
      .where(eq(documents.id, documentId));

    // Get document content
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!doc) throw new Error("Document not found");

    // Step 1: Extract features
    const extractedFeatures = await extractFeatures(doc.content);

    // Save features to DB
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

    // Update status to generating
    await db
      .update(documents)
      .set({ status: "generating" })
      .where(eq(documents.id, documentId));

    // Step 2 & 3: For each feature, generate viewpoints then test cases
    for (const { id: featureId, feature } of savedFeatures) {
      const viewpoints = await generateViewpoints(feature, doc.content);
      const tcs = await generateTestCasesFromViewpoints(
        feature,
        viewpoints,
        doc.content
      );

      // Save test cases to DB
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
      }
    }

    // Update status to completed
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
