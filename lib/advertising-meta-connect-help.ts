import { META_READ_ONLY_SCOPES } from "@/lib/advertising-constants";

/** Connect Meta §2 path choice — kids-friendly labels. */
export const META_CONNECT_PATHS = {
  haveToken: "have_token",
  prepare: "prepare",
} as const;

export type MetaConnectPath =
  (typeof META_CONNECT_PATHS)[keyof typeof META_CONNECT_PATHS];

/** Default to prepare — matches live go-live blocker (no eligible app / token yet). */
export const META_CONNECT_DEFAULT_PATH: MetaConnectPath =
  META_CONNECT_PATHS.prepare;

export const META_CONNECT_PATH_LABELS = {
  haveToken: "I already have a read-only token",
  prepare: "Help me prepare one",
} as const;

/** Exact Phase 1 scopes shown in UI and runbooks (space-joined for copy). */
export const META_READ_ONLY_SCOPES_LABEL = META_READ_ONLY_SCOPES.join(" and ");

export const META_CONNECT_NEVER_SHARE =
  "Never share this token in chat, email, Slack, or any other channel. Paste it only in the password field on this screen.";

export const META_CONNECT_PREPARE_STEPS = [
  {
    title: "Know which kind of Meta key you are making",
    body: "Meta calls this a token — a view-only access key. You can use a system user token (recommended for a shared Paid ads account) or a personal user token.",
  },
  {
    title: "System user token needs an eligible Meta app",
    body: "If Generate token stays greyed out for a system user, Meta has no eligible app assigned to that user. Assign an app the Business can use, then try again. EvoCRM cannot create that app for you.",
  },
  {
    title: "Personal user token needs a developer account and app",
    body: "A user token only works if the Facebook account is registered as a developer and has at least one Meta app. Without that, Graph API Explorer cannot issue a token.",
  },
  {
    title: "Allow only these two permissions",
    body: `Grant exactly ${META_READ_ONLY_SCOPES[0]} and ${META_READ_ONLY_SCOPES[1]}. Do not grant ads management, publish, spend, or any other write permissions.`,
  },
  {
    title: "Keep the token private",
    body: META_CONNECT_NEVER_SHARE,
  },
] as const;
