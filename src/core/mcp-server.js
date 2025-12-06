const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const chatRoute = require('../routes/chat');

class MCPServer {
    constructor() {
        this.app = express();
        this._configureMiddleware();
        this._configureRoutes();
    }

    _configureMiddleware() {
        this.app.use(cors());
        // Parse JSON body; catch malformed JSON and return a clean 400 response
        this.app.use(bodyParser.json({
            verify: (req, res, buf) => {
                // Keep raw body for debugging if needed
                req.rawBody = buf?.toString();
            }
        }));
        this.app.use((err, req, res, next) => {
            if (err instanceof SyntaxError && 'body' in err) {
                return res.status(400).json({
                    error: 'Invalid JSON payload. Please ensure body is valid JSON and escape special characters.',
                    details: err.message
                });
            }
            next(err);
        });
    }

    _configureRoutes() {
        this.app.get('/health', (req, res) => res.json({ status: 'ok', role: 'Orchestrator' }));
        this.app.use('/chat', chatRoute);
    }

    start(port, swaggerSpecs = null) {
        if (swaggerSpecs) {
            this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
            // Fix lỗi Cannot GET /api-docs/ (trailing slash)
            this.app.get('/api-docs/', (req, res) => res.redirect('/api-docs'));
            console.log("📚 Swagger UI enabled at /api-docs");
        }
        return new Promise((resolve) => {
            this.app.listen(port, () => {
                resolve();
            });
        });
    }
}

module.exports = new MCPServer();
