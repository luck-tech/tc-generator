import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  json,
} from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  fileName: text("file_name"),
  content: text("content").notNull(),
  status: text("status", {
    enum: ["uploaded", "parsed", "generating", "completed", "failed"],
  })
    .notNull()
    .default("uploaded"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const features = pgTable("features", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  rules: json("rules").$type<string[]>().default([]),
});

export const testCases = pgTable("test_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  featureId: uuid("feature_id")
    .notNull()
    .references(() => features.id),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  preconditions: json("preconditions").$type<string[]>().notNull().default([]),
  url: text("url"),
  testData: json("test_data")
    .$type<{ field: string; value: string }[]>()
    .notNull()
    .default([]),
  steps: json("steps").$type<string[]>().notNull().default([]),
  expectedResult: text("expected_result").notNull(),
  priority: text("priority", {
    enum: ["high", "medium", "low"],
  }).notNull(),
  testType: text("test_type", {
    enum: ["ui_manual", "api_auto", "e2e_auto"],
  }).notNull(),
  missingInfo: json("missing_info").$type<string[]>().notNull().default([]),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type Feature = typeof features.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
