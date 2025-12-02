const axios = require('axios');
const config = require('../config/env');

/**
 * Cầu nối gọi sang Python RAG Service
 */
class RagBridge {
    async queryKnowledge(query) {
        try {
            // Gọi sang Python Service (Port 8001)
            const resp = await axios.post(`${config.PYTHON_SERVICE_URL}/ask`, {
                question: query
            });
            return resp.data.answer;
        } catch (error) {
            console.error("❌ Python RAG Error:", error.message);
            return "Xin lỗi, hệ thống tra cứu tài liệu đang bảo trì (Python Service chưa chạy).";
        }
    }
}

module.exports = new RagBridge();