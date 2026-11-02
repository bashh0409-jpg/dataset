export const generatorLocales = ["en-US", "en-GB", "en-ZA"] as const;
export type GeneratorLocale = (typeof generatorLocales)[number];

export const generatorIndustries = [
  "general",
  "ecommerce",
  "healthcare",
  "finance",
  "logistics",
  "saas",
] as const;
export type GeneratorIndustry = (typeof generatorIndustries)[number];

export const localeLabels: Record<GeneratorLocale, string> = {
  "en-US": "English (United States)",
  "en-GB": "English (United Kingdom)",
  "en-ZA": "English (South Africa)",
};

export const industryLabels: Record<GeneratorIndustry, string> = {
  general: "General",
  ecommerce: "E-commerce",
  healthcare: "Healthcare",
  finance: "Finance",
  logistics: "Logistics",
  saas: "SaaS",
};

const localeSignals: Record<Exclude<GeneratorLocale, "en-US">, RegExp> = {
  "en-GB":
    /\b(?:united kingdom|great britain|britain|british|england|scotland|wales|northern ireland|uk|gb|london|birmingham|bristol|edinburgh|glasgow|leeds|liverpool|manchester|oxford|york|royal mail|postcode|pound sterling|gbp)\b/i,
  "en-ZA":
    /\b(?:south africa|south african|za|cape town|durban|johannesburg|pretoria|gqeberha|bloemfontein|east london|polokwane|kimberley|mbombela|gauteng|western cape|kwazulu[- ]?natal|courier guy|rand|zar)\b/i,
};

const industrySignals: Record<Exclude<GeneratorIndustry, "general">, RegExp> = {
  ecommerce:
    /\b(?:e[ -]?commerce|online store|retail|shopping cart|catalog|checkout|product(?:s| listing)?|orders?)\b/i,
  healthcare:
    /\b(?:healthcare|health care|medical|clinic|hospital|patients?|prescriptions?|diagnosis|appointments?|pharmacy)\b/i,
  finance:
    /\b(?:finance|financial|banking|banks?|payments?|invoices?|transactions?|loans?|credit|debit|account balance)\b/i,
  logistics:
    /\b(?:logistics|shipments?|shipping|deliveries|delivery|carriers?|tracking|freight|parcels?|warehouses?|fulfillment)\b/i,
  saas:
    /\b(?:saas|software as a service|subscriptions?|workspace|user plan|support tickets?|api usage)\b/i,
};

export function inferGeneratorLocale(text: string): GeneratorLocale {
  if (localeSignals["en-ZA"].test(text)) return "en-ZA";
  if (localeSignals["en-GB"].test(text)) return "en-GB";
  return "en-US";
}

export function inferGeneratorIndustry(
  text: string,
  tableNames: string[] = [],
): GeneratorIndustry {
  const context = `${text} ${tableNames.join(" ")}`;
  const matches = (Object.entries(industrySignals) as [
    Exclude<GeneratorIndustry, "general">,
    RegExp,
  ][]).filter(([, pattern]) => pattern.test(context));
  return matches.length === 1 ? matches[0]![0] : "general";
}

export function inferGenerationPacks(text: string, tableNames: string[] = []) {
  return {
    locale: inferGeneratorLocale(text),
    industry: inferGeneratorIndustry(text, tableNames),
  };
}

export const citiesByLocale: Record<GeneratorLocale, string[]> = {
  "en-US": [
    "Austin",
    "Boston",
    "Chicago",
    "Denver",
    "Miami",
    "Nashville",
    "New York",
    "Portland",
    "Seattle",
    "Washington",
  ],
  "en-GB": [
    "Birmingham",
    "Bristol",
    "Edinburgh",
    "Glasgow",
    "Leeds",
    "Liverpool",
    "London",
    "Manchester",
    "Oxford",
    "York",
  ],
  "en-ZA": [
    "Cape Town",
    "Durban",
    "Johannesburg",
    "Pretoria",
    "Gqeberha",
    "Bloemfontein",
    "East London",
    "Polokwane",
    "Kimberley",
    "Mbombela",
  ],
};

export const carriersByLocale: Record<GeneratorLocale, string[]> = {
  "en-US": ["UPS", "FedEx", "USPS", "DHL"],
  "en-GB": ["Royal Mail", "DPD", "Evri", "DHL"],
  "en-ZA": ["The Courier Guy", "Pargo", "Aramex", "DHL"],
};

const companyNamesByIndustry: Record<GeneratorIndustry, string[]> = {
  general: [
    "Northstar Analytics",
    "Harborline Software",
    "Summit Retail Group",
    "Cedar Grove Health",
    "Brightpath Logistics",
    "Clearwater Financial",
    "Evergreen Design Studio",
    "Redwood Systems",
  ],
  ecommerce: [
    "Openfield Market",
    "Maple Street Goods",
    "Parkside Outfitters",
    "Everyday Supply Co.",
  ],
  healthcare: [
    "Cedar Grove Health",
    "Oakwell Medical Group",
    "Clearview Family Clinic",
    "Northstar Health Services",
  ],
  finance: [
    "Clearwater Financial",
    "Pinecrest Credit Union",
    "Harborline Payments",
    "Westbridge Capital",
  ],
  logistics: [
    "Brightpath Logistics",
    "Harborline Freight",
    "Northstar Distribution",
    "Westbridge Delivery",
  ],
  saas: [
    "Harborline Software",
    "Redwood Systems",
    "Silverline Technologies",
    "Lighthouse Digital",
  ],
};

const productNamesByIndustry: Record<GeneratorIndustry, string[]> = {
  general: [
    "Insulated Stainless Steel Bottle",
    "Wireless Charging Stand",
    "Lightweight Travel Backpack",
    "Classic Ceramic Coffee Mug",
    "Adjustable Desk Lamp",
    "Portable Laptop Stand",
  ],
  ecommerce: [
    "Everyday Cotton T-Shirt",
    "Insulated Stainless Steel Bottle",
    "Lightweight Travel Backpack",
    "Classic Ceramic Coffee Mug",
    "Foldable Market Tote",
    "Waterproof Hiking Jacket",
  ],
  healthcare: [
    "Digital Thermometer",
    "Reusable Cold Pack",
    "First Aid Kit",
    "Blood Pressure Monitor",
    "Pill Organizer",
    "Medical Examination Gloves",
  ],
  finance: [
    "Everyday Checking Account",
    "Fixed-Rate Savings Account",
    "Business Debit Card",
    "Personal Loan",
    "Travel Rewards Card",
  ],
  logistics: [
    "Standard Parcel Delivery",
    "Express Document Service",
    "Tracked Small Parcel",
    "Pallet Freight Delivery",
    "International Parcel Service",
  ],
  saas: [
    "Starter Plan",
    "Team Plan",
    "Business Plan",
    "Analytics Add-on",
    "Priority Support",
  ],
};

export function getIndustryForTable(
  industry: GeneratorIndustry,
  tableName: string,
): GeneratorIndustry {
  if (industry !== "general") return industry;
  const table = tableName.toLowerCase();
  if (/shipment|shipping|delivery|carrier|tracking|freight/.test(table)) {
    return "logistics";
  }
  if (/patient|clinic|hospital|health|medical|appointment/.test(table)) {
    return "healthcare";
  }
  if (/payment|invoice|bank|finance|transaction|account/.test(table)) {
    return "finance";
  }
  if (/product|cart|order|catalog|store|shop/.test(table)) {
    return "ecommerce";
  }
  if (/subscription|workspace|software|saas|support_ticket/.test(table)) {
    return "saas";
  }
  return "general";
}

export function getIndustryCompanyNames(industry: GeneratorIndustry) {
  return companyNamesByIndustry[industry];
}

export function getIndustryProductNames(industry: GeneratorIndustry) {
  return productNamesByIndustry[industry];
}
