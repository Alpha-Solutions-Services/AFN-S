/** Static Alpha dispatch pitch for Call Queue (editable later). */
export const DISPATCH_TALK_TRACK = {
  who: "Alpha Solutions — we provide professional dispatch for US carriers and owner-operators.",
  what:
    "We find loads, negotiate rates, and handle the paperwork so you stay driving. You keep your authority and your truck.",
  fee: "Typical fee is a competitive percentage of the load (ask your current rate card / confirm on the call).",
  ask: "Do you have active MC/DOT authority? How many trucks? What lanes do you prefer?",
  close:
    "If this sounds useful, I’ll email a short overview and we can set up onboarding.",
} as const;

export const DEFAULT_CAMPAIGN_OFFER = [
  "Alpha Solutions dispatch service for carriers and owner-operators.",
  DISPATCH_TALK_TRACK.what,
  DISPATCH_TALK_TRACK.fee,
  "Next step: reply to schedule a quick onboarding call.",
].join(" ");
