/**
 * Repair drip suppressions wrongly created from Resend Transient (soft) bounces.
 *
 * Production evidence (Grosvenor Vistas Lead engagement Funnel):
 * - Transient bounces (mailbox full, temp DNS) were stored as hard_bounce suppressions
 * - Enrollments then skipped+deferred daily forever (400+ skip rows)
 *
 * Usage:
 *   MONGODB_URI=... npx tsx scripts/repair-transient-bounce-suppressions.ts --dry-run
 *   MONGODB_URI=... npx tsx scripts/repair-transient-bounce-suppressions.ts
 *
 * Also accepts MONGO_URL. Defaults to database `evocrm` when the URI has no db path.
 */
import mongoose from "mongoose";

import { isPermanentResendBounce } from "../server/utils/resend-bounce";

type BouncePayload = {
  type?: string;
  subType?: string;
  message?: string;
};

function resolveMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URL?.trim();
  if (!uri) {
    throw new Error("Set MONGODB_URI or MONGO_URL.");
  }
  return uri;
}

function withDefaultDb(uri: string): string {
  // mongodb+srv://.../ without path → append evocrm
  try {
    const parsed = new URL(uri);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/evocrm";
      return parsed.toString();
    }
  } catch {
    // leave as-is for non-standard URIs
  }
  return uri;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const uri = withDefaultDb(resolveMongoUri());

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Mongo connection has no database.");
  }

  console.log(
    JSON.stringify({
      dryRun,
      database: db.databaseName,
      at: new Date().toISOString(),
    }),
  );

  const suppressions = await db
    .collection("emailsuppressions")
    .find({ reason: "hard_bounce", source: "webhook" })
    .toArray();

  const removedEmails = new Set<string>();
  let removed = 0;
  let kept = 0;
  let unknown = 0;

  for (const suppression of suppressions) {
    const email = String(suppression.email || "").toLowerCase().trim();
    const contactId = suppression.contactId ?? null;

    const bounceEvents = await db
      .collection("emailevents")
      .find({
        eventType: "bounced",
        ...(contactId ? { contactId } : {}),
      })
      .sort({ eventTimestamp: -1 })
      .limit(20)
      .toArray();

    const matching = bounceEvents.filter((event) => {
      if (contactId && event.contactId?.toString() === contactId.toString()) {
        return true;
      }
      const metaEmail =
        typeof event.metadata?.email === "string"
          ? event.metadata.email.toLowerCase()
          : typeof event.metadata?.to === "string"
            ? event.metadata.to.toLowerCase()
            : null;
      return metaEmail === email;
    });

    if (matching.length === 0) {
      unknown += 1;
      console.log(
        JSON.stringify({
          action: "keep_unknown",
          email,
          reason: "no_bounce_event_found",
        }),
      );
      continue;
    }

    const latest = matching[0];
    const bounce = (latest.rawPayload as { data?: { bounce?: BouncePayload } } | null)
      ?.data?.bounce;

    if (isPermanentResendBounce(bounce)) {
      kept += 1;
      continue;
    }

    console.log(
      JSON.stringify({
        action: dryRun ? "would_remove" : "remove",
        email,
        bounceType: bounce?.type ?? null,
        bounceSubType: bounce?.subType ?? null,
        eventAt: latest.eventTimestamp,
      }),
    );

    removedEmails.add(email);
    if (!dryRun) {
      await db.collection("emailsuppressions").deleteOne({ _id: suppression._id });
    }
    removed += 1;
  }

  // Fail active enrollments still stuck on remaining permanent hard_bounce suppressions
  // so they stop clogging the cron due queue.
  const remainingHard = await db
    .collection("emailsuppressions")
    .find({ reason: { $in: ["hard_bounce", "complaint"] } })
    .toArray();

  let enrollmentsFailed = 0;
  for (const suppression of remainingHard) {
    const email = String(suppression.email || "").toLowerCase().trim();
    if (removedEmails.has(email)) {
      continue;
    }
    const leads = await db
      .collection("leads")
      .find({
        workspaceId: suppression.workspaceId,
        $or: [{ email }, { emailNormalized: email }],
      })
      .project({ _id: 1 })
      .toArray();

    if (leads.length === 0) {
      continue;
    }

    const leadIds = leads.map((lead) => lead._id);
    const filter = {
      leadId: { $in: leadIds },
      status: "active",
    };

    if (dryRun) {
      const count = await db.collection("campaignenrollments").countDocuments(filter);
      enrollmentsFailed += count;
    } else {
      const result = await db.collection("campaignenrollments").updateMany(filter, {
        $set: {
          status: "failed",
          failedAt: new Date(),
          failureReason: `Recipient is suppressed (${suppression.reason}).`,
          sendClaimExpiresAt: null,
        },
      });
      enrollmentsFailed += result.modifiedCount;
    }
  }

  console.log(
    JSON.stringify({
      summary: {
        dryRun,
        suppressionsScanned: suppressions.length,
        removed,
        keptPermanent: kept,
        unknownKept: unknown,
        enrollmentsFailed,
      },
    }),
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
