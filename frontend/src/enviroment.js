// Use Vite's built-in production flag and environment variables
const is_prod = import.meta.env.PROD;

// Primary: Use VITE_BACKEND_URL from .env files
// Fallback: Auto-detect based on build mode
const servers = import.meta.env.VITE_BACKEND_URL ||
    (is_prod ? "https://meetinvirtual.up.railway.app" : "http://localhost:3000");

export default servers;