import {
  ALPHA_FREIGHT_PITCH,
  GOOGLE_VOICE_DISPLAY,
  SALES_FREIGHT_URL,
  SALES_REPLY_TO,
} from "@/lib/email-signature";

/** Static Alpha dispatch pitch for Call Queue. */
export const DISPATCH_TALK_TRACK = {
  who: `${ALPHA_FREIGHT_PITCH.brand} — ${ALPHA_FREIGHT_PITCH.tagline}.`,
  what: ALPHA_FREIGHT_PITCH.summary,
  fee: ALPHA_FREIGHT_PITCH.fee,
  ask: "Do you have active MC/DOT authority? How many trucks? What lanes do you prefer?",
  close: `If this sounds useful, call or text our Google Voice ${GOOGLE_VOICE_DISPLAY}, or email ${SALES_REPLY_TO}. Details: ${SALES_FREIGHT_URL}`,
  googleVoice: GOOGLE_VOICE_DISPLAY,
} as const;

/** Default campaign offer — full product pitch for AI drafts. */
export const DEFAULT_CAMPAIGN_OFFER = [
  ALPHA_FREIGHT_PITCH.brand,
  ALPHA_FREIGHT_PITCH.tagline,
  ALPHA_FREIGHT_PITCH.summary,
  ALPHA_FREIGHT_PITCH.fee,
  ALPHA_FREIGHT_PITCH.equipment,
  ALPHA_FREIGHT_PITCH.services,
  ALPHA_FREIGHT_PITCH.howItWorks,
  `Website: ${SALES_FREIGHT_URL}`,
  "Do not invent phone numbers or fees beyond this pitch.",
].join("\n");
