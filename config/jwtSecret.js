// Centralized JWT Secret configuration
// This ensures all parts of the application use the same JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || "sdfd345ef_dfdf";

// Log the JWT_SECRET being used (first 10 chars only for security)
if (process.env.JWT_SECRET) {
  console.log("🔐 Using JWT_SECRET from environment variable");
} else {
  console.log("🔐 Using default JWT_SECRET (no env var set)");
}
console.log("🔐 JWT_SECRET preview:", JWT_SECRET.substring(0, 10) + "...");

module.exports = JWT_SECRET;

