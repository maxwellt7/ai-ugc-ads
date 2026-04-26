import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

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
  pinterestLinks: json("pinterestLinks"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Brief = typeof briefs.$inferSelect;
export type InsertBrief = typeof briefs.$inferInsert;
