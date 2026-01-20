// OpenRouter AI Service - for satirical content transformation
const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free models on OpenRouter
const FREE_MODELS = [
    'mistralai/mistral-7b-instruct:free',
    'huggingfaceh4/zephyr-7b-beta:free',
    'openchat/openchat-7b:free'
];

// Satirical transformation prompt
const SATIRE_PROMPT = `You are a Gen Z satirical news writer with dark humor. Transform this news headline and summary into satirical, meme-style content that's funny, nihilistic, and uses internet slang.

Rules:
1. Add relevant emojis (💀 🫠 😭 🔥 ☠️ 🤡 etc)
2. Use dark/absurdist humor about capitalism, existential dread, generational trauma
3. Include internet slang (fr fr, no cap, lowkey, tbh, bruh, it's giving, slay)
4. Make it relatable to stressed-out young adults
5. Keep the core news topic but make it funny
6. Max 280 chars for headline, max 400 chars for summary

Respond ONLY in this JSON format, nothing else:
{"headline": "satirical headline here", "summary": "satirical summary here"}`;

/**
 * Transform a single news article to satirical style
 */
async function transformToSatire(article) {
    if (!OPENROUTER_API_KEY) {
        console.log('⚠️ No OpenRouter API key - using original content');
        return article;
    }

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://newslet.app',
                'X-Title': 'Newslet Satirical News'
            },
            body: JSON.stringify({
                model: FREE_MODELS[0],
                messages: [
                    { role: 'system', content: SATIRE_PROMPT },
                    { role: 'user', content: `Headline: ${article.headline}\nSummary: ${article.summary}` }
                ],
                max_tokens: 500,
                temperature: 0.9
            })
        });

        if (!response.ok) {
            console.error('OpenRouter API error:', await response.text());
            return article;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return article;
        }

        try {
            const satirical = JSON.parse(content);
            return {
                ...article,
                headline: satirical.headline || article.headline,
                summary: satirical.summary || article.summary,
                isSatirical: true
            };
        } catch (parseError) {
            return article;
        }
    } catch (error) {
        console.error('❌ AI transformation failed:', error.message);
        return article;
    }
}

/**
 * Batch transform multiple articles (with rate limiting)
 */
async function transformBatch(articles, limit = 5) {
    console.log(`🎭 Transforming ${Math.min(articles.length, limit)} articles to satirical style...`);

    const results = [];
    const toTransform = articles.slice(0, limit);

    for (let i = 0; i < toTransform.length; i++) {
        const transformed = await transformToSatire(toTransform[i]);
        results.push(transformed);

        if (i < toTransform.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    const remaining = articles.slice(limit);
    console.log(`✅ Transformed ${results.filter(a => a.isSatirical).length} articles`);
    return [...results, ...remaining];
}

module.exports = {
    transformToSatire,
    transformBatch,
    FREE_MODELS
};
