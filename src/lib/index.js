// Entry point to export core pieces for easier extension
module.exports = {
    aiGateway: require('../core/ai-gateway'),
    mcpServer: require('../core/mcp-server'),
    llmService: require('../core/llm-service'),
    sessionManager: require('../core/session-manager'),
    tools: require('../core/tool-registry'),
    dateUtils: require('../utils/date-parser'),
    httpClient: require('../utils/http-client'),
};
