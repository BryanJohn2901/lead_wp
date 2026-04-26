export interface RawLead {
  name: string;
  hasWebsite: boolean;
  websiteUrl: string | null;
  googleBusinessUrl: string | null;
  phoneRaw: string | null;
}

export interface Lead {
  name: string;
  hasWebsite: boolean;
  websiteUrl: string | null;
  googleBusinessUrl: string | null;
  phone: string;
  sentStatus: "pending" | "sent" | "failed";
}

export interface ScraperRequest {
  niche: string;
  location: string;
  maxResults?: number;
}

export interface ScraperResponse {
  leads: Lead[];
  total: number;
  discarded: number;
}
