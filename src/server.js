const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const mcpServer = require('./core/mcp-server');
const config = require('./config/env');

// Fix đường dẫn tuyệt đối cho Windows để Swagger tìm thấy file routes
// Thay thế dấu \ (backslashes) thành / (forward slashes)
const routesPath = path.join(__dirname, './routes/*.js').replace(/\\/g, '/');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'AI MCP Orchestrator API',
            version: '1.0.0',
            description: 'API Documentation for AI Chatbot System (Node.js)',
        },
        servers: [{ url: `http://localhost:${config.PORT}` }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [routesPath], 
};

async function bootstrap() {
    try {
        console.log("🔄 Starting MCP Orchestrator...");
        
        // Debug: In ra đường dẫn mà Swagger đang quét
        console.log(`🔍 Swagger looking for APIs in: ${routesPath}`);

        const specs = swaggerJsdoc(swaggerOptions);
        console.log(`🔍 Swagger Paths Found: ${Object.keys(specs.paths || {}).length}`);
        
        await mcpServer.start(config.PORT, specs);
        
        console.log("--------------------------------------------------");
        console.log(`✅ Server is ready at: http://localhost:${config.PORT}`);
        console.log(`📄 Swagger Docs:     http://localhost:${config.PORT}/api-docs`);
        console.log(`🔗 Connected to Backend: ${config.BACKEND_BASE_URL}`);
        console.log(`🧠 AI Model: ${config.GEMINI_MODEL}`);
        console.log("--------------------------------------------------");
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

bootstrap();