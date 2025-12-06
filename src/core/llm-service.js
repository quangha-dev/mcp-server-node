const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');

// Heuristic nhanh khi LLM lỗi hoặc chậm
function heuristicIntent(question) {
    const text = (question || '').toLowerCase();
    const createKeywords = ['tạo dự án', 'tao du an', 'tạo project', 'create project', 'du an moi', 'dự án mới'];
    if (createKeywords.some(k => text.includes(k))) {
        return 'create_project';
    }
    return 'NO_TOOL';
}

let model;
function getModel() {
    if (!config.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing. Set it in the environment before starting the server.');
    }
    if (!model) {
        const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: config.GEMINI_MODEL });
    }
    return model;
}

class LLMService {
    /**
     * Phân tích ý định người dùng và trích xuất thông tin
     */
    async analyzeIntent(question, currentSession, history) {
        console.log(`🔍 AI Analyzing: "${question}"`);

        // Format lịch sử chat
        let historyContext = "";
        if (history && history.length > 0) {
            historyContext = "--- Conversation History ---\n" +
                history.map(m => `[${m.role}]: ${m.content}`).join('\n') +
                "\n----------------------------\n";
        }

        const prompt = `
        Bạn là trợ lý AI quản lý dự án (Orchestrator Agent).
        Nhiệm vụ: Trích xuất thông tin MỚI từ câu nói người dùng để điền vào form hoặc xác định Tool cần gọi.

        === TRẠNG THÁI HIỆN TẠI (Session Context) ===
        ${JSON.stringify(currentSession)}

        === CÁC TOOL HỖ TRỢ ===
        1. create_project: Tạo dự án mới.
           - Params cần: company_id, workspace_id, name, code, start_date, end_date, priority, description.
        2. ask_knowledge: Hỏi về quy trình, tài liệu (RAG).
           - Params: query (câu hỏi của user).

        === QUY TẮC ===
        1. **Context Memory:** Đọc kỹ History. Nếu thông tin đã có, giữ nguyên.
        2. **Map Name:** Nếu user nhập tên (vd "TechVision"), điền vào field ID tương ứng (System sẽ tự map).
        3. **Short Answer:** Nếu System vừa hỏi "Chọn Workspace nào?" và user đáp "ABC", hiểu là workspace_id = "ABC".
        4. **Routing:** Nếu câu hỏi về kiến thức (vd "Quy trình nghỉ phép"), trả về action "ask_knowledge".

        Input: "${question}"
        ${historyContext}

        Trả về JSON duy nhất: { "action": "create_project" | "ask_knowledge" | "NO_TOOL", "params": { ... } }
        `;

        try {
            const result = await getModel().generateContent(prompt);
            const text = result.response.text();

            // --- SỬA LỖI: Xử lý chuỗi JSON an toàn ---
            // Tìm chuỗi JSON trong cặp dấu ```json ... ``` hoặc lấy toàn bộ text nếu không có markdown
            const match = text.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonStr = match ? match[1] : text;
            // ----------------------------------------

            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("❌ Gemini Analysis Error:", e.message);
            // Fallback an toàn: dùng heuristic để cố gắng chọn tool hợp lý
            return { action: heuristicIntent(question), params: {} };
        }
    }

    /**
     * Sinh câu trả lời cuối cùng cho người dùng
     */
    async generateResponse(question, systemResult) {
        const prompt = `
        User hỏi: "${question}"
        Kết quả hệ thống thực hiện (JSON): ${JSON.stringify(systemResult)}

        Viết câu trả lời tiếng Việt, ngắn gọn, thân thiện, dạng mô tả dễ đọc.
        Ưu tiên liệt kê thông tin chính (Tên dự án, Mã, Công ty, Workspace, Ngày bắt đầu/kết thúc, ID) bằng câu tự nhiên.
        KHÔNG trả về JSON, KHÔNG dùng markdown, không gói trong code block.
        `;
        try {
            const result = await getModel().generateContent(prompt);
            return result.response.text();
        } catch (e) {
            return JSON.stringify(systemResult);
        }
    }

    /**
     * Sinh câu hỏi bổ sung để lấy các trường còn thiếu
     */
    async generateFollowup(missingFields = [], sessionSnapshot = {}) {
        const prompt = `
        Bạn là trợ lý AI đang thu thập thông tin để tạo dự án.
        Các trường còn thiếu: ${missingFields.join(', ')}.
        Ngữ cảnh hiện có: ${JSON.stringify(sessionSnapshot)}.
        Viết câu hỏi tiếng Việt tự nhiên, thân thiện, ngắn gọn (giọng chat).
        Nếu thiếu nhiều trường, gộp hỏi trong 1-2 câu, tránh liệt kê khô khan.
        Tránh mệnh lệnh "vui lòng/please", chỉ hỏi như hội thoại bình thường.
        `;
        try {
            const result = await getModel().generateContent(prompt);
            return result.response.text();
        } catch (e) {
            // Fallback: chuỗi tĩnh
            return `Mình cần thêm thông tin: ${missingFields.join(', ')}. Bạn bổ sung giúp nhé?`;
        }
    }
}

module.exports = new LLMService();
