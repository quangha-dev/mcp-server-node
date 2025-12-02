require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 8000,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || 'http://localhost:8082',
    PYTHON_SERVICE_URL: process.env.PYTHON_SERVICE_URL || 'http://localhost:8001'
};
