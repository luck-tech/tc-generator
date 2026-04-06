import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, fileName } = body as {
      title: string;
      content: string;
      fileName?: string;
    };

    if (!title || !content) {
      return Response.json(
        { error: "title and content are required" },
        { status: 400 }
      );
    }

    const [doc] = await db
      .insert(documents)
      .values({
        title,
        content,
        fileName: fileName || null,
        status: "uploaded",
      })
      .returning();

    return Response.json(doc, { status: 201 });
  } catch (error) {
    console.error("Error creating document:", error);
    return Response.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}
