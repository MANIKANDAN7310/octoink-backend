import express from "express";
import {
  startSearch,
  getSearchProgress,
  getSearchResults,
  getSearchHistory,
  getSearchHistoryById,
  deleteSearchHistory,
  exportSearchResults,
} from "../controllers/leadFinderController.js";

const router = express.Router();

// 1. Start a new search
router.post("/search", startSearch);

// 2. Poll search progress
router.get("/progress/:id", getSearchProgress);

// 3. Get search results
router.get("/results/:id", getSearchResults);

// 4. Search history list
router.get("/history", getSearchHistory);

// 5. Reopen specific search history
router.get("/history/:id", getSearchHistoryById);

// 6. Delete a search history item
router.delete("/history/:id", deleteSearchHistory);

// 7. Download Excel or CSV
router.get("/export/:id", exportSearchResults);

export default router;
