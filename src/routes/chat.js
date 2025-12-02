const express = require('express');
const router = express.Router();
const aiGateway = require('../core/ai-gateway');

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Gửi tin nhắn đến AI Chatbot
 *     description: API chính để giao tiếp với AI. Hỗ trợ tạo dự án, hỏi đáp thông tin (RAG).
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *                 example: "Tôi muốn tạo dự án Marketing mới"
 *                 description: Câu hỏi hoặc yêu cầu của người dùng
 *               history:
 *                 type: array
 *                 description: Lịch sử hội thoại để AI giữ ngữ cảnh
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, model]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Phản hồi thành công từ AI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                 action:
 *                   type: string
 *                 params:
 *                   type: object
 *                 backend_raw_data:
 *                   type: object
 *       400:
 *         description: Thiếu câu hỏi hoặc payload không hợp lệ
 *       401:
 *         description: Thiếu hoặc sai token
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/', async (req, res) => {
    const start = Date.now();
    try {
        const { question, history } = req.body || {};
        if (!question || typeof question !== 'string') {
            return res.status(400).json({ answer: 'Vui lòng gửi trường question (string).', action: 'invalid_request' });
        }

        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ answer: 'Thiếu header Authorization (Bearer token).', action: 'unauthorized' });
        }

        // Gọi Gateway xử lý toàn bộ logic phức tạp (Phân tích, Gọi Tool, RAG...)
        const result = await aiGateway.processRequest(question, history, token);

        console.log(`⏱ Total Latency: ${(Date.now() - start) / 1000}s`);
        res.json(result);

    } catch (error) {
        console.error("🔥 System Error:", error);
        res.status(500).json({
            answer: "Hệ thống đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.",
            error: error.message
        });
    }
});

module.exports = router;
