import {
  GOOGLE_VOICE_DISPLAY,
  SALES_FREIGHT_URL,
  SALES_REPLY_TO,
} from "@/lib/email-signature";

/**
 * Live call script for the Call Queue. Full American-English lines the agent
 * can read out loud, with the field each question is meant to capture.
 * Google Voice is the calling tool — this is the on-screen assist.
 */

export type ScriptStep = {
  label: string;
  say: string;
  capture?: string;
};

export type Objection = {
  when: string;
  say: string;
};

export type CallScript = {
  opening: ScriptStep[];
  discovery: ScriptStep[];
  offer: ScriptStep[];
  objections: Objection[];
  close: ScriptStep[];
};

function firstName(contact?: string | null): string {
  const n = (contact ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

export function buildCallScript(opts: {
  company?: string | null;
  contact?: string | null;
}): CallScript {
  const name = firstName(opts.contact);
  const co = (opts.company ?? "").trim() || "your trucking operation";

  return {
    opening: [
      {
        label: "Greeting",
        say: `Hi ${name}, this is Alpha Freight Network — the back-office dispatch team for Alpha Solutions. Did I catch you at an okay time for a quick minute?`,
      },
      {
        label: "Reason for the call",
        say: `Great — the reason I'm reaching out is we help owner-operators and small fleets like ${co} keep trucks loaded with better-paying freight, so you spend less time on the load boards and more time driving.`,
      },
    ],
    discovery: [
      {
        label: "Authority",
        say: `First, just so I point you the right way — do you run under your own MC and DOT authority, or are you leased on with a carrier right now?`,
        capture: "MC/DOT authority status",
      },
      {
        label: "Equipment / truck type",
        say: `And what are you running equipment-wise — a dry van, a reefer, a flatbed, or a step-deck?`,
        capture: "Truck / trailer type",
      },
      {
        label: "Trailer length",
        say: `Got it. What's the trailer length on that — a full 53-foot, or something shorter?`,
        capture: "Trailer length",
      },
      {
        label: "Capacity / fleet size",
        say: `Are you a single truck owner-operator, or do you have a few trucks we'd be covering?`,
        capture: "Number of trucks / capacity",
      },
      {
        label: "Home base / lanes",
        say: `Where are you based out of — what's your home ZIP code? And are there lanes or regions you prefer to run?`,
        capture: "Home ZIP + preferred lanes",
      },
      {
        label: "Contact name",
        say: `And who am I speaking with — can I get your full name for the file?`,
        capture: "Contact name",
      },
      {
        label: "Confirm email",
        say: `Perfect. I'd love to send you our quick onboarding form and our rate details. What's the best email to send that to? Let me read it back to make sure I've got it right.`,
        capture: "Best email (confirmed)",
      },
    ],
    offer: [
      {
        label: "The offer",
        say: `Here's how we work: we act as your dispatch and back office — we find and negotiate the loads, handle the broker paperwork, and keep your truck moving. Our dispatch fee is a straight percentage of the gross on each load, so we only make money when you get paid.`,
      },
      {
        label: "Fee framing",
        say: `Most owner-operators we work with run at an eight percent dispatch fee, and for drivers who commit to a longer-term agreement we can bring that down to six percent. There are no sign-up fees and no long contracts to get started.`,
      },
      {
        label: "What they get",
        say: `On top of dispatch, you get rate negotiation, carrier packet and setup handling, and someone in your corner when a broker gives you a hard time. Think of us as your office while you focus on the road.`,
      },
    ],
    objections: [
      {
        when: "I already have a dispatcher",
        say: `Totally understand — a lot of our best drivers came to us that way. All I'd ask is let us quote a couple of your lanes against what you're getting now. If we can't beat it, no harm done and you keep who you've got.`,
      },
      {
        when: "Your fee is too high",
        say: `I hear you. The way to look at it is the load we book at a better rate usually more than covers the fee — our job is to put more in your pocket after the percentage, not less. Let me show you on a real lane.`,
      },
      {
        when: "I'm busy / send me info",
        say: `Absolutely, I'll get that over to you right now by email. Let me confirm the best address, and I'll follow up in a day or two so it doesn't get buried.`,
      },
      {
        when: "How do I know you're legit",
        say: `Fair question. We're Alpha Freight Network, part of Alpha Solutions — everything's on our site at ${SALES_FREIGHT_URL}, and you can call or text us anytime at ${GOOGLE_VOICE_DISPLAY}.`,
      },
    ],
    close: [
      {
        label: "Confirm next step",
        say: `Here's what I'll do: I'm sending the onboarding form to the email we confirmed. Fill it out when you get a minute and we can have you set up and taking loads quickly.`,
      },
      {
        label: "Set the follow-up",
        say: `I'll give you a quick call back in a day or two to walk through your first loads. Sound fair, ${name}?`,
      },
      {
        label: "Leave contact",
        say: `And save this number — you can call or text our line at ${GOOGLE_VOICE_DISPLAY}, or email ${SALES_REPLY_TO} anytime. Appreciate you, ${name} — talk soon.`,
      },
    ],
  };
}
