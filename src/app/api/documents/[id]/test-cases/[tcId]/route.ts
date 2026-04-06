import { db } from "@/lib/db";
import { testCases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  try {
    const { id, tcId } = await params;
    const body = await request.json();

    const allowedFields = [
      "title",
      "objective",
      "preconditions",
      "url",
      "testData",
      "steps",
      "expectedResult",
      "priority",
      "testType",
      "missingInfo",
    ] as const;

    const updates: Record<string, unknown> = { isEdited: true };
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const [updated] = await db
      .update(testCases)
      .set(updates)
      .where(and(eq(testCases.id, tcId), eq(testCases.documentId, id)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Test case not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (error) {
    console.error("Error updating test case:", error);
    return Response.json(
      { error: "Failed to update test case" },
      { status: 500 }
    );
  }
}
