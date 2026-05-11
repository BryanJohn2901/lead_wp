import type { Lead } from "@/types/lead";

export async function dispatchWebhook(leads: Lead[]): Promise<boolean> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("WEBHOOK_URL não definida. Leads não enviados.");
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leads,
        dispatchedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    return response.ok;
  } catch (error: unknown) {
    console.error("Falha no envio ao webhook:", error);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
