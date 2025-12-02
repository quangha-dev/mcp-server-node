const projectTools = require('../tools/project-tools');
const ragBridge = require('../tools/rag-bridge');

/**
 * Đăng ký các "tool" (hành động) để dễ mở rộng.
 * Mỗi tool có:
 * - handler: hàm async (context) => { answer, params, backend_raw_data, final }
 * - requiresAuth: có cần token hay không
 */
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    register(name, toolConfig) {
        this.tools.set(name, toolConfig);
    }

    get(name) {
        return this.tools.get(name);
    }

    list() {
        return Array.from(this.tools.keys());
    }
}

const registry = new ToolRegistry();

// Đăng ký tool mặc định
registry.register('create_project', {
    requiresAuth: true,
    handler: projectTools.handleCreateProject.bind(projectTools),
});

registry.register('ask_knowledge', {
    requiresAuth: false,
    handler: async ({ question }) => ({
        answer: await ragBridge.queryKnowledge(question),
        action: 'ask_knowledge',
        params: {},
        backend_raw_data: null
    })
});

module.exports = {
    registry,
    registerTool: registry.register.bind(registry),
    getTool: registry.get.bind(registry),
    listTools: registry.list.bind(registry),
};
