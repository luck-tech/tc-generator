import { db } from "@/lib/db";
import { testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const tcList = await db
      .select()
      .from(testCases)
      .where(eq(testCases.documentId, id));

    return Response.json(tcList);
  } catch (error) {
    console.error("Error fetching test cases:", error);
    return Response.json(
      { error: "Failed to fetch test cases" },
      { status: 500 }
    );
  }
}
