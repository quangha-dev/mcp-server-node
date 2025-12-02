const backend = require('../utils/http-client');
const llmService = require('../core/llm-service');
const sessionManager = require('../core/session-manager');
const { normalizeDateString } = require('../utils/date-parser');

class ProjectTools {
    constructor() {
        this.requiredParams = ["company_id", "workspace_id", "name", "code", "start_date", "end_date"];
    }

    /**
     * Tool entry: xử lý create_project
     */
    async handleCreateProject({ question, token, session, changes = [] }) {
        this.sanitizeNameCode(session);
        // Bước 1: resolve context (company/workspace)
        const guideMsg = await this.resolveContext(session, token, question);
        if (guideMsg) {
            sessionManager.updateSession(token, session);
            return { answer: guideMsg, action: "create_project", params: session };
        }

        // Bước 2: kiểm tra thiếu trường
        const missing = this.getMissingParams(session);
        if (missing.length > 0) {
            const followup = await llmService.generateFollowup(missing, session);
            sessionManager.updateSession(token, session);
            return { answer: followup, action: "create_project", params: session };
        }

        // Bước 2.1: validate dữ liệu đã có
        const validation = this.validateParams(session);
        if (!validation.valid) {
            sessionManager.updateSession(token, session);
            return { answer: validation.message, action: "create_project", params: session };
        }

        // Bước 3: xác nhận
        if (!session._pending_confirmation) {
            session._pending_confirmation = true;
            sessionManager.updateSession(token, session);
            const summary = this.buildSummary(session);
            return { answer: `Xác nhận tạo dự án với thông tin sau: ${summary}. Trả lời "đồng ý" để tạo hoặc "hủy" để chỉnh sửa.`, action: "create_project", params: session };
        }

        // Bước 4: xử lý xác nhận/chỉnh sửa
        const isYes = (q) => {
            const t = (q || "").toLowerCase();
            return ['đồng ý', 'dong y', 'xác nhận', 'xac nhan', 'yes', 'ok', 'oke', 'đúng', 'dung', 'tạo', 'tao'].some(k => t.includes(k));
        };
        const isNo = (q) => {
            const t = (q || "").toLowerCase();
            return ['không', 'khong', 'hủy', 'huy', 'cancel', 'stop', 'bo qua'].some(k => t.includes(k));
        };
        const isEdit = (q) => {
            const t = (q || "").toLowerCase();
            return ['sửa', 'sua', 'chỉnh', 'doi', 'đổi', 'update', 'chinh sua', 'sửa lại', 'đổi lại'].some(k => t.includes(k));
        };

        if (session._pending_confirmation) {
            if (isNo(question)) {
                sessionManager.clearSession(token);
                return { answer: "Đã hủy thao tác tạo dự án. Bạn có thể cung cấp lại thông tin mới.", action: "create_project", params: {} };
            }
            // Nếu user có gửi thay đổi (fields mới) trong khi chờ xác nhận, cập nhật và tóm tắt lại
            if (changes.length > 0 || isEdit(question)) {
                session._pending_confirmation = true;
                const summary = this.buildSummary(session);
                sessionManager.updateSession(token, session);
                return { answer: `Đã cập nhật thông tin. Kiểm tra lại: ${summary}. Trả lời "đồng ý" để tạo hoặc "hủy" để dừng.`, action: "create_project", params: session };
            }
            if (!isYes(question)) {
                const summary = this.buildSummary(session);
                sessionManager.updateSession(token, session);
                return { answer: `Vui lòng xác nhận "đồng ý" để tạo dự án hoặc "hủy" để dừng. Thông tin hiện tại: ${summary}`, action: "create_project", params: session };
            }
        }

        // Bước 5: gọi API tạo
        const result = await this.executeCreate(session, token);
        let finalAnswer;
        if (result.success) {
            session._pending_confirmation = false;
            const systemPayload = {
                action: 'create_project',
                project: result.data.data,
                params: session
            };
            try {
                const aiAnswer = await llmService.generateResponse(question, systemPayload);
                const text = (aiAnswer || '').trim();
                if (text.startsWith('{') || text.startsWith('[')) {
                    finalAnswer = this.prettyProjectResponse(systemPayload.project, session);
                } else {
                    finalAnswer = text;
                }
            } catch (e) {
                finalAnswer = this.prettyProjectResponse(systemPayload.project, session);
            }
            sessionManager.clearSession(token);
        } else {
            const msg = typeof result.error === 'string'
                ? result.error
                : (result.error?.message || JSON.stringify(result.error));
            if (msg && msg.toLowerCase().includes('code already exists')) {
                session._pending_confirmation = false;
                sessionManager.updateSession(token, session);
                finalAnswer = `Mã dự án "${session.code}" đã tồn tại trong workspace. Vui lòng nhập mã code khác.`;
            } else {
                finalAnswer = `⚠️ Lỗi hệ thống: ${msg}`;
            }
        }

        return { answer: finalAnswer, action: "create_project", params: result.success ? {} : session, backend_raw_data: result };
    }

    validateParams(sessionData) {
        const errors = [];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (sessionData.start_date && !dateRegex.test(sessionData.start_date)) {
            errors.push('Ngày bắt đầu phải ở định dạng yyyy-MM-dd.');
        }
        if (sessionData.end_date && !dateRegex.test(sessionData.end_date)) {
            errors.push('Ngày kết thúc phải ở định dạng yyyy-MM-dd.');
        }
        if (sessionData.start_date && sessionData.end_date) {
            const s = new Date(sessionData.start_date);
            const e = new Date(sessionData.end_date);
            if (s > e) errors.push('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        }
        if (sessionData.name && sessionData.name.length < 2) {
            errors.push('Tên dự án cần tối thiểu 2 ký tự.');
        }
        if (sessionData.code && sessionData.code.length < 2) {
            errors.push('Mã code cần tối thiểu 2 ký tự.');
        }
        if (errors.length > 0) {
            return { valid: false, message: errors.join(' ') };
        }
        return { valid: true };
    }

    /**
     * Map tên -> ID và hỏi người dùng nếu thiếu
     */
    async resolveContext(sessionData, token, rawQuestion = '') {
        try {
            const resp = await backend.get('/api/users/me', { headers: { Authorization: token } });

            if (!resp.data || !resp.data.success) {
                return "Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại và thử lại.";
            }

            const user = resp.data.data;
            const companies = user.companyMemberships || [];
            const workspaces = user.workspaceMemberships || [];

            const normalize = (str) => String(str || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();

            // Company mapping
            if (sessionData.company_id && isNaN(sessionData.company_id)) {
                const searchName = normalize(sessionData.company_id);
                const found = companies.find(c => {
                    const n = normalize(c.companyName);
                    return n.includes(searchName) || searchName.includes(n);
                });
                if (found) {
                    sessionData.company_id = String(found.companyId);
                    sessionData.company_name = found.companyName;
                } else {
                    sessionData.company_id = null;
                    sessionData.company_name = null;
                }
            }

            if (!sessionData.company_id && rawQuestion) {
                const qn = normalize(rawQuestion);
                const foundQ = companies.find(c => qn.includes(normalize(c.companyName)));
                if (foundQ) {
                    sessionData.company_id = String(foundQ.companyId);
                    sessionData.company_name = foundQ.companyName;
                }
            }

            if (!sessionData.company_id) {
                if (companies.length === 1) {
                    sessionData.company_id = String(companies[0].companyId);
                    sessionData.company_name = companies[0].companyName;
                } else {
                    const list = companies.map(c => `- ${c.companyName}`).join('\n');
                    return `Bạn muốn tạo dự án cho công ty nào? Bạn chỉ có quyền trong các công ty sau:\n${list}`;
                }
            }

            // Workspace mapping (after company)
            const cid = parseInt(sessionData.company_id);
            const validWorkspaces = workspaces.filter(w => w.companyId === cid);

            if (sessionData.workspace_id && isNaN(sessionData.workspace_id)) {
                const searchWs = normalize(sessionData.workspace_id);
                const foundWs = validWorkspaces.find(w => {
                    const n = normalize(w.workspaceName);
                    return n.includes(searchWs) || searchWs.includes(n);
                });
                if (foundWs) {
                    sessionData.workspace_id = String(foundWs.workspaceId);
                    sessionData.workspace_name = foundWs.workspaceName;
                } else {
                    sessionData.workspace_id = null;
                    sessionData.workspace_name = null;
                }
            }

            if (!sessionData.workspace_id && rawQuestion) {
                const qn = normalize(rawQuestion);
                const foundWsQ = validWorkspaces.find(w => qn.includes(normalize(w.workspaceName)));
                if (foundWsQ) {
                    sessionData.workspace_id = String(foundWsQ.workspaceId);
                    sessionData.workspace_name = foundWsQ.workspaceName;
                }
            }

            if (!sessionData.workspace_id) {
                if (validWorkspaces.length === 1) {
                    sessionData.workspace_id = String(validWorkspaces[0].workspaceId);
                    sessionData.workspace_name = validWorkspaces[0].workspaceName;
                } else if (validWorkspaces.length === 0) {
                    return "Công ty này chưa có Workspace nào bạn có quyền.";
                } else {
                    const list = validWorkspaces.map(w => `- ${w.workspaceName}`).join('\n');
                    return `Trong công ty này, bạn chỉ có quyền ở các Workspace sau. Bạn chọn Workspace nào?\n${list}`;
                }
            }

            return null;
        } catch (error) {
            console.error("❌ Context Resolve Error:", error.message);
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                return "Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại và thử lại.";
            }
            return `Lỗi kết nối Backend: ${error.message}`;
        }
    }

    getMissingParams(sessionData) {
        return this.requiredParams.filter(p => !sessionData[p]);
    }

    buildSummary(data) {
        const companyLabel = data.company_name || data.company_id || '(chưa có)';
        const workspaceLabel = data.workspace_name || data.workspace_id || '(chưa có)';
        return [
            `Tên: ${data.name || '(chưa có)'}`,
            `Code: ${data.code || '(chưa có)'}`,
            `Công ty: ${companyLabel}`,
            `Workspace: ${workspaceLabel}`,
            `Bắt đầu: ${data.start_date || '(chưa có)'}`,
            `Kết thúc: ${data.end_date || '(chưa có)'}`
        ].join(' | ');
    }

    prettyProjectResponse(project, sessionData) {
        const companyLabel = sessionData.company_name || sessionData.company_id || '(không rõ công ty)';
        const workspaceLabel = sessionData.workspace_name || sessionData.workspace_id || '(không rõ workspace)';
        return `Dự án "${project.name}" (ID: ${project.id}) đã tạo thành công với mã "${project.projectCode}". Công ty: ${companyLabel}; Workspace: ${workspaceLabel}; Bắt đầu: ${project.startDate}; Kết thúc: ${project.dueDate || sessionData.end_date || 'không có'}.`;
    }

    sanitizeNameCode(sessionData) {
        const cutWords = /(mã\s+code|ma\s+code|code|bắt\s+đầu|bat\s+dau|kết\s+thúc|ket\s+thuc)/i;
        if (sessionData.name && cutWords.test(sessionData.name)) {
            sessionData.name = sessionData.name.split(cutWords)[0].trim();
        }
        if (sessionData.code && cutWords.test(sessionData.code)) {
            sessionData.code = sessionData.code.split(cutWords)[0].trim();
        }
    }

    async executeCreate(sessionData, token) {
        try {
            const url = `/api/companies/${sessionData.company_id}/workspaces/${sessionData.workspace_id}/projects`;

            const payload = {
                name: sessionData.name,
                projectCode: sessionData.code || sessionData.name.toUpperCase().replace(/\s+/g, '').substring(0, 10),
                description: sessionData.description || "",
                startDate: normalizeDateString(sessionData.start_date) || new Date().toISOString().split('T')[0],
                endDate: normalizeDateString(sessionData.end_date) || new Date().toISOString().split('T')[0],
                priority: sessionData.priority || "LOW",
                managerId: 0,
                projectTypeId: 0,
                boardConfig: {},
                coverImageUrl: "",
                goal: ""
            };

            console.log("🚀 Calling Backend API:", url);

            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('data', JSON.stringify(payload), { contentType: 'application/json' });

            const resp = await backend.post(url, formData, {
                headers: {
                    Authorization: token,
                    ...formData.getHeaders()
                }
            });

            return { success: true, data: resp.data };
        } catch (error) {
            return {
                success: false,
                error: error.response ? error.response.data : error.message
            };
        }
    }
}

module.exports = new ProjectTools();
