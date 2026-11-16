import LeadFinderSearch from "../models/LeadFinderSearch.js";
import { executeLeadSearch } from "../utils/leadCrawler.js";
import * as XLSX from "xlsx";

/**
 * Start a new automatic lead search
 * POST /api/lead-finder/search
 */
export const startSearch = async (req, res) => {
  try {
    const { country, industries, state = "", city = "" } = req.body;

    if (!country || !country.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please select a country to search.",
      });
    }

    let industryList = [];
    if (Array.isArray(industries)) {
      industryList = industries.filter((i) => i && i.trim());
    } else if (typeof industries === "string") {
      industryList = industries.split(",").map((i) => i.trim()).filter(Boolean);
    }

    if (industryList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one manufacturing category.",
      });
    }

    const newSearch = new LeadFinderSearch({
      country: country.trim(),
      industries: industryList,
      state: state.trim(),
      city: city.trim(),
      status: "running",
      progress: 5,
      currentStep: "Initializing lead discovery engine...",
      logs: [
        {
          message: `Search initiated for ${country.trim()} - ${industryList.join(", ")}`,
          type: "info",
          timestamp: new Date(),
        },
      ],
    });

    await newSearch.save();

    // Run the crawler asynchronously in the background
    setImmediate(() => {
      executeLeadSearch(newSearch._id);
    });

    res.status(201).json({
      success: true,
      searchId: newSearch._id,
      message: "Lead discovery started successfully.",
    });
  } catch (err) {
    console.error("Error starting lead search:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to start lead search",
    });
  }
};

/**
 * Get search progress and live status
 * GET /api/lead-finder/progress/:id
 */
export const getSearchProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const search = await LeadFinderSearch.findById(id);

    if (!search) {
      return res.status(404).json({
        success: false,
        message: "Search session not found.",
      });
    }

    res.json({
      success: true,
      search: {
        _id: search._id,
        country: search.country,
        industries: search.industries,
        state: search.state,
        city: search.city,
        status: search.status,
        progress: search.progress,
        currentStep: search.currentStep,
        totalDiscovered: search.totalDiscovered,
        emailsFound: search.emailsFound,
        uniqueEmails: search.uniqueEmails,
        results: search.results,
        logs: search.logs.slice(-15), // Last 15 logs for live feed
        createdAt: search.createdAt,
      },
    });
  } catch (err) {
    console.error("Error fetching search progress:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch search progress",
    });
  }
};

/**
 * Get full search results
 * GET /api/lead-finder/results/:id
 */
export const getSearchResults = async (req, res) => {
  try {
    const { id } = req.params;
    const search = await LeadFinderSearch.findById(id);

    if (!search) {
      return res.status(404).json({
        success: false,
        message: "Search session not found.",
      });
    }

    res.json({
      success: true,
      search,
    });
  } catch (err) {
    console.error("Error fetching search results:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch search results",
    });
  }
};

/**
 * Get search history list
 * GET /api/lead-finder/history
 */
export const getSearchHistory = async (req, res) => {
  try {
    const history = await LeadFinderSearch.find()
      .select("country industries state city status progress totalDiscovered emailsFound uniqueEmails createdAt")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      history,
    });
  } catch (err) {
    console.error("Error fetching search history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch search history",
    });
  }
};

/**
 * Get a specific search history item to reopen results
 * GET /api/lead-finder/history/:id
 */
export const getSearchHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const search = await LeadFinderSearch.findById(id);

    if (!search) {
      return res.status(404).json({
        success: false,
        message: "Search record not found.",
      });
    }

    res.json({
      success: true,
      search,
    });
  } catch (err) {
    console.error("Error reopening search history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve search record",
    });
  }
};

/**
 * Delete a search record
 * DELETE /api/lead-finder/history/:id
 */
export const deleteSearchHistory = async (req, res) => {
  try {
    const { id } = req.params;
    await LeadFinderSearch.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Search history item removed successfully.",
    });
  } catch (err) {
    console.error("Error deleting search history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete search record",
    });
  }
};

/**
 * Export collected leads to Excel or CSV
 * GET /api/lead-finder/export/:id
 */
export const exportSearchResults = async (req, res) => {
  try {
    const { id } = req.params;
    const format = (req.query.format || "xlsx").toLowerCase();

    const search = await LeadFinderSearch.findById(id);
    if (!search) {
      return res.status(404).json({
        success: false,
        message: "Search not found for export.",
      });
    }

    const results = search.results || [];
    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No leads available to export for this search.",
      });
    }

    // Format rows: Company Name | Email | Country | Industry | Website
    // Ensure deduplication of emails
    const seenEmails = new Set();
    const rows = [];

    for (const r of results) {
      const email = (r.email || "").toLowerCase().trim();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);

      rows.push({
        "Company Name": r.companyName || "",
        "Email": email,
        "Country": r.country || search.country || "",
        "Industry": r.industry || (search.industries && search.industries[0]) || "",
        "Website": r.website || "",
      });
    }

    // Generate clear, sanitized filename: e.g. USA_Medal_Manufacturers_Leads.xlsx
    const cleanCountry = (search.country || "Global")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 20);
    const cleanIndustry = (search.industries && search.industries[0]
      ? search.industries[0].replace(/[^a-zA-Z0-9]/g, "_")
      : "Manufacturing"
    ).slice(0, 30);

    const baseName = `${cleanCountry}_${cleanIndustry}_Leads`;

    if (format === "csv") {
      // Export as CSV
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${baseName}.csv"`
      );
      return res.send(csvOutput);
    } else {
      // Export as Excel (.xlsx)
      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Set column widths for clean readability
      worksheet["!cols"] = [
        { wch: 30 }, // Company Name
        { wch: 35 }, // Email
        { wch: 20 }, // Country
        { wch: 30 }, // Industry
        { wch: 40 }, // Website
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Collected Leads");

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${baseName}.xlsx"`
      );
      return res.send(buffer);
    }
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate export file",
    });
  }
};
