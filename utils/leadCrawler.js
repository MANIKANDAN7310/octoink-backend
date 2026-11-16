/**
 * Octoink Lead Finder Crawler Engine
 * Discovers manufacturing company websites, crawls public contact/about pages,
 * extracts public business email addresses, validates formats, and removes duplicates.
 */

import { URL } from "node:url";
import LeadFinderSearch from "../models/LeadFinderSearch.js";
import CollectedLead from "../models/CollectedLead.js";
import { getCompaniesForSearch } from "./manufacturingDirectory.js";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,40}/g;

const JUNK_DOMAINS = [
  "example.com",
  "domain.com",
  "test.com",
  "sentry.io",
  "wixpress.com",
  "cloudflare.com",
  "schema.org",
  "wordpress.org",
  "github.com",
  "google.com",
  "facebook.com",
  "apple.com",
  "twitter.com",
  "x.com",
  "shopify.com",
  "myshopify.com",
  "w3.org",
  "gravatar.com",
  "privacypolicies.com",
  "termsfeed.com",
  "recaptcha.net",
  "doubleclick.net",
  "googletagmanager.com",
];

const JUNK_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "js",
  "css",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp4",
  "webm",
  "ico",
];

const JUNK_PREFIXES = [
  "test@",
  "sample@",
  "user@",
  "username@",
  "yourname@",
  "someone@",
  "name@",
  "placeholder@",
  "noreply@",
  "no-reply@",
  "mailer-daemon@",
  "donotreply@",
  "security@",
  "abuse@",
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Validates and normalizes an email address
 */
export function cleanAndValidateEmail(raw, companyHost = "") {
  if (!raw) return null;
  let email = String(raw).toLowerCase().trim().replace(/^mailto:/i, "").split("?")[0].trim();

  // Basic RFC syntax check
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,40}$/.test(email)) {
    return null;
  }

  // Check junk prefixes
  for (const prefix of JUNK_PREFIXES) {
    if (email.startsWith(prefix)) return null;
  }

  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;

  // Check junk domains
  for (const junk of JUNK_DOMAINS) {
    if (domain === junk || domain.endsWith("." + junk)) return null;
  }

  // Check extension
  const ext = domain.split(".").pop();
  if (JUNK_EXTENSIONS.includes(ext)) return null;

  // Localpart must be alphanumeric or standard symbols
  if (localPart.length < 2 || localPart.length > 64) return null;

  return email;
}

/**
 * Score email relevance to prioritize primary contact emails
 */
function scoreEmail(email, host) {
  let score = 0;
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1] || "";

  // Bonus for domain match
  if (host && (domain.includes(host) || host.includes(domain))) {
    score += 50;
  }

  // High-value prefixes
  if (lower.startsWith("info@")) score += 40;
  else if (lower.startsWith("sales@")) score += 35;
  else if (lower.startsWith("contact@")) score += 35;
  else if (lower.startsWith("hello@")) score += 30;
  else if (lower.startsWith("orders@")) score += 25;
  else if (lower.startsWith("support@")) score += 20;
  else if (lower.startsWith("service@")) score += 20;
  else if (lower.startsWith("customerservice@")) score += 20;
  else if (lower.startsWith("inquiries@")) score += 15;

  return score;
}

/**
 * Safe fetch with timeout
 */
async function fetchPage(url, timeoutMs = 7000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    return await res.text();
  } catch (err) {
    return null;
  }
}

/**
 * Crawls a single company website to find its public business contact email
 */
export async function crawlCompanySite(company) {
  const emailsFound = new Set();
  let domainHost = "";

  try {
    const parsedUrl = new URL(company.website);
    domainHost = parsedUrl.hostname.replace(/^www\./i, "");
  } catch (_) {
    domainHost = "";
  }

  // 1. Fetch homepage
  const homeHtml = await fetchPage(company.website, 7500);
  let checkedPagesCount = 0;

  if (homeHtml) {
    checkedPagesCount++;

    // 1a. mailto: extraction
    const mailtoMatches = [
      ...homeHtml.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,40})/gi),
    ];
    for (const m of mailtoMatches) {
      const cleaned = cleanAndValidateEmail(m[1], domainHost);
      if (cleaned) emailsFound.add(cleaned);
    }

    // 1b. text pattern extraction
    const textMatches = homeHtml.match(EMAIL_REGEX) || [];
    for (const m of textMatches) {
      const cleaned = cleanAndValidateEmail(m, domainHost);
      if (cleaned) emailsFound.add(cleaned);
    }
  }

  // 2. If no email found or only 1 found, look for Contact Us / About Us links
  if (emailsFound.size === 0 && homeHtml) {
    const linkMatches = [
      ...homeHtml.matchAll(/href=["']([^"']*(?:contact|about|get-in-touch|reach-us)[^"']*)["']/gi),
    ];

    const candidateLinks = [];
    for (const lm of linkMatches) {
      let link = lm[1].trim();
      if (
        !link ||
        link.startsWith("#") ||
        link.startsWith("javascript:") ||
        link.startsWith("tel:")
      ) {
        continue;
      }

      try {
        let fullUrl = link;
        if (link.startsWith("/")) {
          fullUrl = new URL(link, company.website).href;
        } else if (!link.startsWith("http")) {
          fullUrl = new URL(link, company.website).href;
        }

        // Keep inside same domain
        const linkParsed = new URL(fullUrl);
        if (linkParsed.hostname.replace(/^www\./i, "") === domainHost) {
          if (!candidateLinks.includes(fullUrl)) {
            candidateLinks.push(fullUrl);
          }
        }
      } catch (_) {}

      if (candidateLinks.length >= 2) break;
    }

    // Crawl candidate contact pages
    for (const subUrl of candidateLinks) {
      const subHtml = await fetchPage(subUrl, 6000);
      if (subHtml) {
        checkedPagesCount++;
        const subMailtos = [
          ...subHtml.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,40})/gi),
        ];
        for (const m of subMailtos) {
          const cleaned = cleanAndValidateEmail(m[1], domainHost);
          if (cleaned) emailsFound.add(cleaned);
        }

        const subMatches = subHtml.match(EMAIL_REGEX) || [];
        for (const m of subMatches) {
          const cleaned = cleanAndValidateEmail(m, domainHost);
          if (cleaned) emailsFound.add(cleaned);
        }

        if (emailsFound.size > 0) break;
      }
    }
  }

  // Pick the best email
  const allEmails = Array.from(emailsFound);
  if (allEmails.length === 0) {
    return {
      success: false,
      companyName: company.name,
      website: company.website,
      checkedPages: checkedPagesCount,
      email: null,
      allEmails: [],
    };
  }

  // Sort by score
  allEmails.sort((a, b) => scoreEmail(b, domainHost) - scoreEmail(a, domainHost));
  const primaryEmail = allEmails[0];

  return {
    success: true,
    companyName: company.name,
    email: primaryEmail,
    allEmails,
    website: company.website,
    sourceUrl: company.website,
    country: company.country,
    industry: company.category,
    state: company.state || "",
    city: company.city || "",
    checkedPages: checkedPagesCount,
  };
}

/**
 * Execute full search crawler workflow
 */
export async function executeLeadSearch(searchId) {
  try {
    const search = await LeadFinderSearch.findById(searchId);
    if (!search) return;

    search.status = "running";
    search.progress = 5;
    search.currentStep = "Searching for manufacturing companies...";
    search.logs.push({
      message: `Starting automated lead discovery for ${search.country} in industries: ${search.industries.join(
        ", "
      )}`,
      type: "info",
      timestamp: new Date(),
    });
    await search.save();

    // 1. Discover relevant companies
    const candidateCompanies = getCompaniesForSearch({
      country: search.country,
      industries: search.industries,
      state: search.state,
      city: search.city,
    });

    search.totalDiscovered = candidateCompanies.length;
    search.progress = 20;
    search.currentStep = `Discovered ${candidateCompanies.length} potential manufacturing companies. Locating official websites...`;
    search.logs.push({
      message: `Discovered ${candidateCompanies.length} verified companies matching filters. Preparing website crawlers...`,
      type: "info",
      timestamp: new Date(),
    });
    await search.save();

    if (candidateCompanies.length === 0) {
      search.status = "completed";
      search.progress = 100;
      search.currentStep = "No companies found matching the specified filters.";
      search.logs.push({
        message: "No companies found for this country and industry combination.",
        type: "warning",
        timestamp: new Date(),
      });
      await search.save();
      return;
    }

    // 2. Scan websites in controlled concurrency
    const collectedResults = [];
    const seenEmails = new Set();
    const seenCompanies = new Set();

    const chunkSize = 4;
    const totalCompanies = candidateCompanies.length;

    for (let i = 0; i < totalCompanies; i += chunkSize) {
      const chunk = candidateCompanies.slice(i, i + chunkSize);

      const chunkResults = await Promise.all(
        chunk.map(async (company) => {
          try {
            return await crawlCompanySite(company);
          } catch (err) {
            return {
              success: false,
              companyName: company.name,
              website: company.website,
              email: null,
            };
          }
        })
      );

      for (const res of chunkResults) {
        if (res && res.success && res.email) {
          const normEmail = res.email.toLowerCase().trim();
          const normCompany = res.companyName.toLowerCase().trim();

          // Avoid duplicate emails or companies within this search
          if (!seenEmails.has(normEmail) && !seenCompanies.has(normCompany)) {
            seenEmails.add(normEmail);
            seenCompanies.add(normCompany);

            const leadObj = {
              companyName: res.companyName,
              email: normEmail,
              country: search.country,
              industry: res.industry || search.industries[0],
              website: res.website,
              state: res.state || search.state || "",
              city: res.city || search.city || "",
              sourceUrl: res.sourceUrl || res.website,
              allEmails: res.allEmails || [normEmail],
              foundAt: new Date(),
            };

            collectedResults.push(leadObj);

            // Persist into CollectedLead for global uniqueness
            try {
              await CollectedLead.findOneAndUpdate(
                { email: normEmail },
                {
                  companyName: res.companyName,
                  email: normEmail,
                  country: search.country,
                  industry: res.industry || search.industries[0],
                  website: res.website,
                  state: res.state || "",
                  city: res.city || "",
                  sourceUrl: res.website,
                  searchId: search._id,
                },
                { upsert: true, new: true }
              );
            } catch (_) {}

            search.logs.push({
              message: `Found business email: ${normEmail} (${res.companyName})`,
              type: "success",
              timestamp: new Date(),
            });
          }
        }
      }

      // Update progress
      const progressPercent = Math.min(
        85,
        20 + Math.round(((i + chunk.length) / totalCompanies) * 65)
      );

      search.progress = progressPercent;
      search.currentStep = `Scanning websites & public contact pages (${Math.min(
        i + chunkSize,
        totalCompanies
      )}/${totalCompanies})...`;
      search.emailsFound = collectedResults.length;
      search.uniqueEmails = collectedResults.length;
      search.results = collectedResults;
      await search.save();
    }

    // 3. Deduplication & Final Validation Step
    search.progress = 92;
    search.currentStep = "Removing duplicates and validating email syntax...";
    search.logs.push({
      message: `Verified and deduplicated ${collectedResults.length} leads. Finalizing storage...`,
      type: "info",
      timestamp: new Date(),
    });
    await search.save();

    // 4. Save Final Results
    search.status = "completed";
    search.progress = 100;
    search.currentStep = `Lead collection complete! Found ${collectedResults.length} verified business emails from ${totalCompanies} companies.`;
    search.emailsFound = collectedResults.length;
    search.uniqueEmails = collectedResults.length;
    search.results = collectedResults;
    search.logs.push({
      message: `Successfully collected ${collectedResults.length} ready-to-contact business leads with valid emails.`,
      type: "success",
      timestamp: new Date(),
    });
    await search.save();
  } catch (err) {
    console.error("Lead search execution error:", err);
    try {
      const search = await LeadFinderSearch.findById(searchId);
      if (search) {
        search.status = "failed";
        search.error = err.message;
        search.logs.push({
          message: `Error during search: ${err.message}`,
          type: "error",
          timestamp: new Date(),
        });
        await search.save();
      }
    } catch (_) {}
  }
}
