/**
 * Centralized app URLs from environment.
 * Set FRONTEND_URL and API_URL in .env for local vs production.
 * - FRONTEND_URL: where the React app is served (e.g. https://triphog.net or http://localhost:5173)
 * - API_URL: backend public base URL (e.g. https://api.triphog.net or http://localhost:21098)
 * No trailing slash.
 */

const getFrontendUrl = () => {
  const url = (process.env.FRONTEND_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
  return url;
};

const getApiUrl = () => {
  const url = (process.env.API_URL || "http://localhost:21098").trim().replace(/\/+$/, "");
  return url;
};

/** Base URL for uploads (same as API_URL) */
const getUploadsBaseUrl = () => getApiUrl();

/** CORS allowed origins: FRONTEND_URL, API_URL, and common locals */
const getAllowedOrigins = () => {
  const frontend = getFrontendUrl();
  const api = getApiUrl();
  const list = [
    frontend,
    api,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  if (frontend.startsWith("https://")) {
    const www = frontend.replace(/^https:\/\/(?!www\.)/, "https://www.");
    if (www !== frontend) list.push(www);
  }
  return [...new Set(list)];
};

module.exports = {
  getFrontendUrl,
  getApiUrl,
  getUploadsBaseUrl,
  getAllowedOrigins,
};
