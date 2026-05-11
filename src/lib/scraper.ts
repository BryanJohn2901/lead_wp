import { chromium } from "playwright";
import type { RawLead } from "@/types/lead";

const DEFAULT_MAX_RESULTS = 30;
// Captures formats: (11) 99876-5432 | (11) 9 9876-5432 | 11 9876-5432 | 11998765432
const PHONE_REGEX = /\(?\d{2}\)?\s?\d?\s?\d{4}[-\s]?\d{4}/;

function getMaxResultsFromEnv(): number {
  const parsed = Number(process.env.SCRAPER_MAX_RESULTS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.floor(parsed);
}

export async function scrapeGoogleMaps(
  niche: string,
  location: string,
  maxResultsOverride?: number,
): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true });
  const maxResults =
    typeof maxResultsOverride === "number" && Number.isFinite(maxResultsOverride)
      ? Math.max(1, Math.floor(maxResultsOverride))
      : getMaxResultsFromEnv();

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "pt-BR",
    });
    const page = await context.newPage();

    const query = encodeURIComponent(`${niche} ${location}`);
    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    // Handle Google consent/cookie dialog if shown
    const consentButton = page
      .locator(
        "#L2AGLb, button[aria-label='Accept all'], button[aria-label='Aceitar tudo'], button[jsname='b3VHJd']",
      )
      .first();
    if (await consentButton.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await consentButton.click().catch(() => undefined);
      await page.waitForTimeout(1_500);
    }

    await page.waitForSelector('div[role="feed"]', { timeout: 30_000 });

    let unchangedCount = 0;
    let previousCardsCount = 0;

    while (true) {
      const cardsCount = await page.locator("div.Nv2PK").count();
      if (cardsCount >= maxResults) {
        break;
      }

      const reachedEnd = await page
        .locator("text=Você chegou ao final da lista")
        .first()
        .isVisible()
        .catch(() => false);
      if (reachedEnd) {
        break;
      }

      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        }
      });
      await page.waitForTimeout(2_500);

      const updatedCount = await page.locator("div.Nv2PK").count();
      if (updatedCount === previousCardsCount) {
        unchangedCount += 1;
      } else {
        unchangedCount = 0;
      }
      previousCardsCount = updatedCount;

      if (unchangedCount >= 5) {
        break;
      }
    }

    const rawLeads = await page.$$eval(
      "div.Nv2PK",
      (cards, args) => {
        const regex = new RegExp(args.phoneRegexSource);
        const results: {
          name: string;
          hasWebsite: boolean;
          websiteUrl: string | null;
          googleBusinessUrl: string | null;
          phoneRaw: string | null;
        }[] = [];

        for (const card of cards) {
          if (results.length >= args.max) {
            break;
          }

          try {
            const nameElement = card.querySelector(".qBF1Pd");
            const mapsLinkForName = card.querySelector("a.hfpxzc") as HTMLAnchorElement | null;
            const name =
              nameElement?.textContent?.trim() ||
              mapsLinkForName?.getAttribute("aria-label")?.trim() ||
              "";
            if (!name) {
              continue;
            }

            const text = card.textContent ?? "";
            const phoneMatch = text.match(regex);
            const phoneRaw = phoneMatch?.[0]?.trim() ?? null;
            const websiteLink = card.querySelector(
              'a[data-value="Website"]',
            ) as HTMLAnchorElement | null;
            const websiteUrl = websiteLink?.href ?? null;
            const hasWebsite = Boolean(websiteUrl);
            const mapsLink = card.querySelector("a.hfpxzc") as HTMLAnchorElement | null;
            const googleBusinessUrl = mapsLink?.href ?? null;

            results.push({
              name,
              hasWebsite,
              websiteUrl,
              googleBusinessUrl,
              phoneRaw,
            });
          } catch {
            continue;
          }
        }

        return results;
      },
      { max: maxResults, phoneRegexSource: PHONE_REGEX.source },
    );

    return rawLeads;
  } finally {
    await browser.close();
  }
}
