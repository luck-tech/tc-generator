import { db } from "@/lib/db";
import { testCases, features, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!doc) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const featureList = await db
      .select()
      .from(features)
      .where(eq(features.documentId, id));

    const featureMap = new Map(featureList.map((f) => [f.id, f.name]));

    const tcList = await db
      .select()
      .from(testCases)
      .where(eq(testCases.documentId, id));

    const headers = [
      "ID",
      "Feature",
      "Title",
      "Objective",
      "Preconditions",
      "URL",
      "Test Data",
      "Steps",
      "Expected Result",
      "Priority",
      "Test Type",
      "Missing Info",
    ];

    const rows = tcList.map((tc) => [
      tc.id,
      featureMap.get(tc.featureId) || "",
      tc.title,
      tc.objective,
      (tc.preconditions as string[]).join(" / "),
      tc.url || "",
      (tc.testData as { field: string; value: string }[])
        .map((d) => `${d.field}: ${d.value}`)
        .join(" / "),
      (tc.steps as string[]).map((s, i) => `${i + 1}. ${s}`).join(" / "),
      tc.expectedResult,
      tc.priority,
      tc.testType,
      (tc.missingInfo as string[]).join(" / "),
    ]);

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    const bom = "\uFEFF";
    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${doc.title}_test_cases.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting CSV:", error);
    return Response.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
