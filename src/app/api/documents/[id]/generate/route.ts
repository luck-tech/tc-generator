import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runGeneration } from "@/lib/generate";

export async function POST(
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

    if (doc.status !== "uploaded") {
      return Response.json(
        { error: "Document is already being processed or completed" },
        { status: 400 }
      );
    }

    // Fire and forget - run generation in background
    runGeneration(id).catch((err) =>
      console.error("Background generation error:", err)
    );

    return Response.json({ message: "Generation started", documentId: id });
  } catch (error) {
    console.error("Error starting generation:", error);
    return Response.json(
      { error: "Failed to start generation" },
      { status: 500 }
    );
  }
}
