export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Random delay between sends to avoid spam detection (3–8 seconds). */
export function sendDelayWithJitter(): number {
  return 3000 + Math.floor(Math.random() * 5000);
}
