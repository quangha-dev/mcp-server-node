const llmService = require('./llm-service');
const sessionManager = require('./session-manager');
const { extractDateRange, normalizeDateString } = require('../utils/date-parser');
const { getTool } = require('./tool-registry');

// Utils phân loại intent và hợp nhất tham số
function hasCreateState(session) {
    return session._pending_confirmation ||
        ['name', 'code', 'company_id', 'workspace_id', 'start_date', 'end_date'].some(k => session[k]);
}

function parseNameCode(question) {
    const res = {};
    if (!question) return res;
    const nameMatch = question.match(/t(?:ê|e)n\s+là\s+([^,.;\n]+)/i);
    if (nameMatch) res.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    const codeMatch = question.match(/mã\s+code\s+(?:là\s+)?([^,.;\n]+)/i) || question.match(/\bcode\s+(?:là\s+)?([^,.;\n]+)/i);
    if (codeMatch) res.code = codeMatch[1].trim().replace(/^["']|["']$/g, '');
    return res;
}

class AIGateway {
    async processRequest(question, history, token) {
        const currentSession = sessionManager.getSession(token);
        let plan = await llmService.analyzeIntent(question, currentSession, history);
        // Nếu đang trong luồng tạo project mà LLM trả NO_TOOL, ép về create_project
        if (plan.action === "NO_TOOL" && hasCreateState(currentSession)) {
            plan.action = "create_project";
            plan.params = plan.params || {};
        }
        console.log("👉 Gateway Routing:", plan.action);

        const tool = getTool(plan.action);
        if (!tool) {
            const answer = await llmService.generateResponse(question, "NO_TOOL");
            return { answer, action: "NO_TOOL", params: currentSession, backend_raw_data: null };
        }
        if (tool.requiresAuth && !token) {
            return { answer: "Vui lòng đăng nhập để thực hiện.", action: plan.action };
        }

        // Chuẩn bị context chung cho tool
        const baseSession = sessionManager.getSession(token) || {};
        const dateHints = extractDateRange(question);
        const nameCodeHints = parseNameCode(question);

        const cleanedParams = { ...(plan.params || {}) };
        const lowerQ = (question || '').toLowerCase();
        const nameKeywords = ['tên', 'ten', 'project', 'dự án', 'du an'];
        const hasNameKeyword = nameKeywords.some(k => lowerQ.includes(k));
        if (cleanedParams.name && !hasNameKeyword) delete cleanedParams.name;

        const mergedParams = { ...baseSession, ...cleanedParams, ...nameCodeHints };
        if (!mergedParams.start_date && dateHints.start_date) mergedParams.start_date = dateHints.start_date;
        if (!mergedParams.end_date && dateHints.end_date) mergedParams.end_date = dateHints.end_date;
        if (mergedParams.start_date) mergedParams.start_date = normalizeDateString(mergedParams.start_date);
        if (mergedParams.end_date) mergedParams.end_date = normalizeDateString(mergedParams.end_date);

        // Xác định các trường thay đổi trong lượt này
        const changeKeys = ['name', 'code', 'start_date', 'end_date', 'company_id', 'workspace_id', 'company_name', 'workspace_name'];
        const changes = changeKeys.filter(k => mergedParams[k] && mergedParams[k] !== baseSession[k]);

        const context = {
            question,
            history,
            token,
            session: mergedParams,
            changes
        };

        const result = await tool.handler(context);
        // tool.handler có trách nhiệm cập nhật session nếu cần
        return result;
    }
}

module.exports = new AIGateway();
