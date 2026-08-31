import mongoose, { type InferSchemaType, Schema } from "mongoose";

const leadFinancialSituationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    declaredAnnualIncome: { type: Number, default: null },
    employmentType: { type: String, default: null },
    availableDepositEquity: { type: Number, default: null },
    targetPurchasePrice: { type: Number, default: null },
    financingNeed: { type: Number, default: null },
    existingCommitments: { type: String, default: null },
    affordabilityNotes: { type: String, default: null },
    currency: { type: String, required: true },
    source: { type: String, default: null },
    asOfDate: { type: String, default: null },
    confidence: { type: String, default: null },
    assessorNotes: { type: String, default: null },
    marketIncomeEstimate: { type: Schema.Types.Mixed, default: null },
    revisions: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

leadFinancialSituationSchema.index(
  { workspaceId: 1, leadId: 1 },
  { unique: true },
);

export type LeadFinancialSituationDocument = InferSchemaType<
  typeof leadFinancialSituationSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const LeadFinancialSituationModel =
  (mongoose.models.LeadFinancialSituation as mongoose.Model<LeadFinancialSituationDocument>) ??
  mongoose.model<LeadFinancialSituationDocument>(
    "LeadFinancialSituation",
    leadFinancialSituationSchema,
  );
