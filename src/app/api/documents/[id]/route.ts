import { db } from "@/lib/db";
import { documents, features, testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    const tcList = await db
      .select()
      .from(testCases)
      .where(eq(testCases.documentId, id));

    return Response.json({
      document: doc,
      features: featureList,
      testCases: tcList,
    });
  } catch (error) {
    console.error("Error fetching document:", error);
    return Response.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}
