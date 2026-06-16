import mongoose, { type InferSchemaType, Schema } from "mongoose";

const SENDING_DOMAIN_STATUSES = [
  "pending",
  "verified",
  "failed",
  "needs_attention",
] as const;

const DNS_RECORD_STATUSES = ["missing", "pending", "valid", "invalid"] as const;

const dnsRecordSchema = new Schema(
  {
    record: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    priority: { type: Number, default: null },
    ttl: { type: String, trim: true, default: null },
    status: { type: String, enum: DNS_RECORD_STATUSES, default: "pending" },
  },
  { _id: false },
);

const sendingDomainSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    domain: { type: String, required: true, trim: true, lowercase: true },
    provider: { type: String, enum: ["resend"], default: "resend" },
    providerDomainId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: SENDING_DOMAIN_STATUSES,
      default: "pending",
    },
    spfStatus: { type: String, enum: DNS_RECORD_STATUSES, default: "missing" },
    dkimStatus: { type: String, enum: DNS_RECORD_STATUSES, default: "missing" },
    dmarcStatus: { type: String, enum: DNS_RECORD_STATUSES, default: "missing" },
    defaultSenderEmail: { type: String, trim: true, default: null },
    dnsRecords: { type: [dnsRecordSchema], default: [] },
    lastCheckedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sendingDomainSchema.index({ workspaceId: 1 });
sendingDomainSchema.index({ workspaceId: 1, domain: 1 }, { unique: true });
sendingDomainSchema.index({ workspaceId: 1, status: 1 });
sendingDomainSchema.index({ providerDomainId: 1 });

export type SendingDomainDocument = InferSchemaType<typeof sendingDomainSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SendingDomainModel =
  (mongoose.models.SendingDomain as mongoose.Model<SendingDomainDocument>) ??
  mongoose.model<SendingDomainDocument>("SendingDomain", sendingDomainSchema);
