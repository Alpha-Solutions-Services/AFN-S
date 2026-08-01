import {
  GOOGLE_VOICE_DISPLAY,
  SALES_REPLY_TO,
} from "@/lib/email-signature";

/** Static Alpha dispatch pitch for Call Queue (editable later). */
export const DISPATCH_TALK_TRACK = {
  who: "Alpha Solutions — we provide professional dispatch for US carriers and owner-operators.",
  what:
    "We find loads, negotiate rates, and handle the paperwork so you stay driving. You keep your authority and your truck.",
  fee: "Typical fee is a competitive percentage of the load (ask your current rate card / confirm on the call).",
  ask: "Do you have active MC/DOT authority? How many trucks? What lanes do you prefer?",
  close: `If this sounds useful, call or text our Google Voice ${GOOGLE_VOICE_DISPLAY}, or email ${SALES_REPLY_TO}.`,
  googleVoice: GOOGLE_VOICE_DISPLAY,
} as const;

export const DEFAULT_CAMPAIGN_OFFER = [
  "Alpha Solutions / Alpha Freight Network dispatch for US carriers and owner-operators.",
  DISPATCH_TALK_TRACK.what,
  "We help with load finding and rate negotiation for semis and box trucks.",
  "Do not invent phone numbers — contact is Google Voice only.",
  `Carriers can call/text Google Voice ${GOOGLE_VOICE_DISPLAY} or reply by email.`,
].join(" ");
