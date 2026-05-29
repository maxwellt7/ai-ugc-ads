import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    externalAuthProvider: varchar("externalAuthProvider", { length: 32 }),
    externalAuthId: varchar("externalAuthId", { length: 191 }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    externalProviderIdIdx: uniqueIndex("users_external_provider_id_idx").on(
      table.externalAuthProvider,
      table.externalAuthId
    ),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const briefs = mysqlTable("briefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  productDescription: text("productDescription").notNull(),
  targetAudienceAge: varchar("targetAudienceAge", { length: 100 }).notNull(),
  targetAudienceGender: varchar("targetAudienceGender", { length: 100 }).notNull(),
  targetAudienceLifestyle: varchar("targetAudienceLifestyle", { length: 255 }).notNull(),
  adGoal: mysqlEnum("adGoal", ["awareness", "conversion", "retention"]).notNull(),
  toneVibe: varchar("toneVibe", { length: 255 }).notNull(),
  segmentCount: int("segmentCount").notNull(),
  scriptConcept: text("scriptConcept").notNull(),
  productImageUrl: text("productImageUrl"),
  imageAnalysis: text("imageAnalysis"),
  generatedBrief: text("generatedBrief").notNull(),
  editedBrief: text("editedBrief"),
  creatorImageUrl: text("creatorImageUrl"),
  intakeMode: mysqlEnum("intakeMode", ["description", "script"]).default("description").notNull(),
  adStyle: mysqlEnum("adStyle", ["ugc", "animated", "direct_response"]).default("ugc").notNull(),
  pinterestLinks: json("pinterestLinks"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Brief = typeof briefs.$inferSelect;
export type InsertBrief = typeof briefs.$inferInsert;

export const videoJobs = mysqlTable("video_jobs", {
  id: int("id").autoincrement().primaryKey(),
  briefId: int("briefId").notNull(),
  userId: int("userId").notNull(),
  segmentIndex: int("segmentIndex").notNull(),
  prompt: text("prompt").notNull(),
  wavespeedTaskId: varchar("wavespeedTaskId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "created", "processing", "completed", "failed"]).default("pending").notNull(),
  videoUrl: text("videoUrl"),
  errorMessage: text("errorMessage"),
  aspectRatio: varchar("aspectRatio", { length: 20 }).default("9:16").notNull(),
  resolution: varchar("resolution", { length: 10 }).default("720p").notNull(),
  duration: int("duration").default(15).notNull(),
  feedback: text("feedback"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  audioQcStatus: mysqlEnum("audioQcStatus", ["pending", "passed", "failed", "skipped"]).default("pending"),
  audioQcTranscript: text("audioQcTranscript"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoJob = typeof videoJobs.$inferSelect;
export type InsertVideoJob = typeof videoJobs.$inferInsert;

export const stitchJobs = mysqlTable("stitch_jobs", {
  id: int("id").autoincrement().primaryKey(),
  briefId: int("briefId").notNull(),
  userId: int("userId").notNull(),
  shotstackRenderId: varchar("shotstackRenderId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "queued", "fetching", "rendering", "saving", "done", "failed"]).default("pending").notNull(),
  finalVideoUrl: text("finalVideoUrl"),
  errorMessage: text("errorMessage"),
  segmentCount: int("segmentCount").notNull(),
  thumbstopperUrl: text("thumbstopperUrl"),
  thumbstopperText: text("thumbstopperText"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  aspectRatio: varchar("aspectRatio", { length: 20 }).default("9:16").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StitchJob = typeof stitchJobs.$inferSelect;
export type InsertStitchJob = typeof stitchJobs.$inferInsert;
