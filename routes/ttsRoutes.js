const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../middleware/logger');

// Python service URL (running locally)
const TTS_SERVICE_URL = 'http://localhost:8888';

/**
 * @route   POST /api/tts/generate
 * @desc    Generate TTS audio stream
 * @access  Public (for now)
 */
router.post('/generate', async (req, res) => {
    try {
        const { text, voice, speed } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'Text is required'
            });
        }

        logger.info(`Forwarding TTS request: ${text.substring(0, 30)}...`);

        // Stream response from Python service
        const response = await axios({
            method: 'post',
            url: `${TTS_SERVICE_URL}/generate`,
            data: {
                text,
                voice: voice || 'af_heart',
                speed: speed || 1.0
            },
            responseType: 'stream'
        });

        // Set headers
        res.setHeader('Content-Type', 'audio/wav');

        // Pipe the stream directly to the client
        response.data.pipe(res);

    } catch (error) {
        logger.error('TTS Proxy Error:', error.message);

        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                message: 'TTS Service is currently unavailable (starting up...)'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to generate audio'
        });
    }
});

module.exports = router;
