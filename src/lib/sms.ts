import { claimSmsSlot, releaseSmsSlot } from "./db";

// Text.lk SMS gateway. Set TEXTLK_API_TOKEN to turn messages on.
const API_URL = process.env.TEXTLK_API_URL || "https://app.text.lk/api/v3/sms/send";
const GAP_HOURS = Number(process.env.SMS_GAP_HOURS) || 5;

// Text.lk wants Sri Lankan numbers as 94XXXXXXXXX, so 0783100177 becomes 94783100177.
function toInternational(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
}

/**
 * Tells the print shop by SMS that a new design was uploaded. Sends at most one message
 * every SMS_GAP_HOURS hours: uploads inside that gap don't send another.
 */
export async function notifyNewDesign(orderId: number) {
  const token = process.env.TEXTLK_API_TOKEN;
  const to = process.env.SMS_TO;
  if (!token || !to) return;

  const previous = claimSmsSlot(GAP_HOURS * 60 * 60 * 1000);
  if (previous === false) return; // A message went out less than GAP_HOURS ago.

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: toInternational(to),
        sender_id: process.env.SMS_SENDER_ID || "amigotap",
        type: "plain",
        message: `amigotap uploaded a new design (order #${orderId}). Please proceed.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status !== "success") {
      throw new Error(data?.message ?? `HTTP ${res.status}`);
    }
  } catch (error) {
    // Give the slot back so the next upload tries again instead of waiting 5 hours.
    releaseSmsSlot(previous);
    console.error("Could not send the new design SMS", error);
  }
}
