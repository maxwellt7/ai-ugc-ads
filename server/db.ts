import { desc, eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, briefs, InsertBrief, videoJobs, InsertVideoJob, stitchJobs, InsertStitchJob } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Brief helpers

export async function createBrief(data: InsertBrief) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(briefs).values(data);
  const insertId = result[0].insertId;
  return insertId;
}

export async function getBriefsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select({
      id: briefs.id,
      productName: briefs.productName,
      adGoal: briefs.adGoal,
      segmentCount: briefs.segmentCount,
      toneVibe: briefs.toneVibe,
      createdAt: briefs.createdAt,
    })
    .from(briefs)
    .where(eq(briefs.userId, userId))
    .orderBy(desc(briefs.createdAt));
}

export async function getBriefById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(briefs).where(eq(briefs.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// Video job helpers

export async function createVideoJob(data: InsertVideoJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(videoJobs).values(data);
  return result[0].insertId;
}

export async function getVideoJobsByBriefId(briefId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.briefId, briefId))
    .orderBy(videoJobs.segmentIndex);
}

export async function getVideoJobById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(videoJobs).where(eq(videoJobs.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateVideoJob(id: number, data: Partial<Pick<InsertVideoJob, "status" | "wavespeedTaskId" | "videoUrl" | "errorMessage" | "prompt" | "feedback">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(videoJobs).set(data).where(eq(videoJobs.id, id));
}

export async function getVideoJobByBriefAndSegment(briefId: number, segmentIndex: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(videoJobs)
    .where(and(eq(videoJobs.briefId, briefId), eq(videoJobs.segmentIndex, segmentIndex)))
    .orderBy(desc(videoJobs.createdAt))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/** Delete a video job so a fresh one can be created for the same segment */
export async function deleteVideoJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(videoJobs).where(eq(videoJobs.id, id));
}

// Stitch job helpers

export async function createStitchJob(data: InsertStitchJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(stitchJobs).values(data);
  return result[0].insertId;
}

export async function getStitchJobById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(stitchJobs).where(eq(stitchJobs.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getStitchJobByBriefId(briefId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(stitchJobs)
    .where(eq(stitchJobs.briefId, briefId))
    .orderBy(desc(stitchJobs.createdAt))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateStitchJob(id: number, data: Partial<Pick<InsertStitchJob, "status" | "shotstackRenderId" | "finalVideoUrl" | "errorMessage">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(stitchJobs).set(data).where(eq(stitchJobs.id, id));
}

/** Delete a stitch job so a fresh one can be created */
export async function deleteStitchJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(stitchJobs).where(eq(stitchJobs.id, id));
}

// Enhanced history: get video summary for a list of brief IDs
export async function getVideoSummaryByBriefIds(briefIds: number[]) {
  if (briefIds.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      briefId: videoJobs.briefId,
      totalJobs: sql<number>`COUNT(*)`,
      completedJobs: sql<number>`SUM(CASE WHEN ${videoJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
      failedJobs: sql<number>`SUM(CASE WHEN ${videoJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
    })
    .from(videoJobs)
    .where(sql`${videoJobs.briefId} IN (${sql.join(briefIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(videoJobs.briefId);

  return results;
}

export async function getStitchSummaryByBriefIds(briefIds: number[]) {
  if (briefIds.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      briefId: stitchJobs.briefId,
      status: stitchJobs.status,
      finalVideoUrl: stitchJobs.finalVideoUrl,
    })
    .from(stitchJobs)
    .where(sql`${stitchJobs.briefId} IN (${sql.join(briefIds.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(desc(stitchJobs.createdAt));

  // Deduplicate — keep only the latest stitch per brief
  const seen = new Set<number>();
  return results.filter((r) => {
    if (seen.has(r.briefId)) return false;
    seen.add(r.briefId);
    return true;
  });
}
