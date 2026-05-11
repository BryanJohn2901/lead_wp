import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { scrapeGoogleMaps } from "@/lib/scraper";
import type { Lead, ScraperRequest, ScraperResponse } from "@/types/lead";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ScraperResponse | ErrorResponse>> {
  try {
    const body = (await request.json()) as Partial<ScraperRequest>;
    const niche = body.niche?.trim();
    const location = body.location?.trim();
    const maxResults =
      typeof body.maxResults === "number" && Number.isFinite(body.maxResults)
        ? body.maxResults
        : undefined;

    if (!niche || !location) {
      return NextResponse.json(
        { error: "Campos 'niche' e 'location' são obrigatórios." },
        { status: 400 },
      );
    }

    const rawLeads = await scrapeGoogleMaps(niche, location, maxResults);

    const leads: Lead[] = [];
    let discarded = 0;

    for (const rawLead of rawLeads) {
      if (!rawLead.phoneRaw) {
        discarded += 1;
        continue;
      }

      const phone = normalizePhone(rawLead.phoneRaw);
      if (!phone) {
        discarded += 1;
        continue;
      }

      leads.push({
        name: rawLead.name,
        hasWebsite: rawLead.hasWebsite,
        websiteUrl: rawLead.websiteUrl,
        googleBusinessUrl: rawLead.googleBusinessUrl,
        phone,
        sentStatus: "pending",
      });
    }

    return NextResponse.json({
      leads,
      total: leads.length,
      discarded,
    });
  } catch (error: unknown) {
    console.error("Erro na rota /api/scraper:", error);
    return NextResponse.json(
      { error: "Falha ao processar scraping de leads." },
      { status: 500 },
    );
  }
}
