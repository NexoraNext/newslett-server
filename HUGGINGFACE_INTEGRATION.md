# Hugging Face Integration Guide for Newslett

Strategies to integrate Hugging Face models into your backend **almost free** or **completely free**.

---

## 🆓 Completely Free Options

### 1. Hugging Face Inference API (Free Tier)

**Best for**: Low-traffic apps, development, prototyping

| Aspect | Details |
|--------|---------|
| **Cost** | Free (rate-limited) |
| **Rate Limit** | ~30,000 requests/month |
| **Models** | 200,000+ open-source models |
| **Latency** | 2-10 seconds (cold start) |

```javascript
// Example: Using HuggingFace Inference API
const HF_API_KEY = process.env.HF_API_KEY; // Free API key

async function summarizeText(text) {
  const response = await fetch(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: text })
    }
  );
  
  const result = await response.json();
  return result[0]?.summary_text;
}
```

**Recommended Models (Free Tier)**:
| Task | Model | Size |
|------|-------|------|
| Summarization | `facebook/bart-large-cnn` | 400MB |
| Summarization | `sshleifer/distilbart-cnn-12-6` | 300MB |
| Text Generation | `mistralai/Mistral-7B-Instruct-v0.2` | 14GB |
| Sentiment | `cardiffnlp/twitter-roberta-base-sentiment` | 125MB |
| Q&A | `deepset/roberta-base-squad2` | 125MB |

---

### 2. OpenRouter Free Models

**Already in your codebase!** Your `aiService.js` uses OpenRouter.

| Aspect | Details |
|--------|---------|
| **Cost** | Free |
| **Models** | Mistral 7B, Zephyr, OpenChat |
| **Rate Limit** | Generous free tier |

```javascript
// Already configured in backend/services/aiService.js
const FREE_MODELS = [
  'mistralai/mistral-7b-instruct:free',
  'huggingfaceh4/zephyr-7b-beta:free',
  'openchat/openchat-7b:free'
];
```

---

### 3. Run Locally (Completely Free)

**Best for**: Full control, privacy, no rate limits

**Requirements**: Mac M1/M2 with 16GB+ RAM or Linux with decent GPU

```javascript
// Option A: Ollama (easiest)
// Install: brew install ollama && ollama run mistral

const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'mistral',
    prompt: 'Summarize this news...'
  })
});

// Option B: llama.cpp (fastest inference)
// Install: brew install llama.cpp
```

**Recommended Local Models**:
| Model | RAM Required | Speed |
|-------|-------------|-------|
| Mistral 7B Q4 | 8GB | Fast |
| Llama 3.1 8B Q4 | 8GB | Fast |
| Phi-3.5 Mini | 4GB | Very Fast |
| Gemma 2B | 4GB | Very Fast |

---

## 💰 Almost Free Options (<$5/month)

### 1. Hugging Face Inference Endpoints (Serverless)

**Best for**: Production with moderate traffic

```
Cost: $0.06/hour when active (auto-scales to $0 when idle)
      → ~$1-3/month for typical usage
```

Setup:
1. Go to huggingface.co/inference-endpoints
2. Select model (e.g., `mistralai/Mistral-7B-Instruct-v0.2`)
3. Choose "Serverless" option
4. Pay only when endpoint is active

### 2. Modal.com Serverless

| Aspect | Details |
|--------|---------|
| **Free Tier** | $30/month credits |
| **GPU Access** | A10G, T4 |
| **Cold Start** | ~2-5 seconds |

```python
# Python serverless function
import modal
app = modal.App()

@app.function(gpu="T4")
def summarize(text: str) -> str:
    from transformers import pipeline
    summarizer = pipeline("summarization")
    return summarizer(text)[0]["summary_text"]
```

### 3. Replicate.com

| Aspect | Details |
|--------|---------|
| **Free Tier** | First few predictions free |
| **Cost** | ~$0.0001-0.001 per run |
| **Models** | Pre-deployed, instant |

```javascript
const Replicate = require('replicate');
const replicate = new Replicate();

const output = await replicate.run(
  "meta/llama-2-7b-chat:8e6975e5ed6174911a6ff3d60540dfd4844201974602551e10e9e87ab143d81e",
  { input: { prompt: "Summarize this article..." } }
);
```

---

## 🎯 Recommended Strategy for Newslett

### Phase 1: Free Tier (Now)
```
┌─────────────────────────────────────────────────────┐
│  Use OpenRouter Free Models (already configured!)  │
│  - Mistral 7B for summaries                         │
│  - Zephyr 7B for Q&A                                │
│  Cost: $0                                           │
└─────────────────────────────────────────────────────┘
```

### Phase 2: Optimize (When Needed)
```
┌─────────────────────────────────────────────────────┐
│  Add HuggingFace Inference API as fallback         │
│  - BART for fast summarization                      │
│  - RoBERTa for sentiment (mood classification)     │
│  Cost: $0 (free tier)                              │
└─────────────────────────────────────────────────────┘
```

### Phase 3: Scale (Future)
```
┌─────────────────────────────────────────────────────┐
│  HuggingFace Serverless Endpoints                  │
│  - Dedicated Mistral 7B endpoint                    │
│  - Auto-scales to zero when not in use             │
│  Cost: ~$2-5/month                                 │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation: Update gemmaApiService.js

Replace Gemma API with HuggingFace Inference:

```javascript
// services/huggingFaceService.js
const HF_API_KEY = process.env.HF_API_KEY;
const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

const huggingFaceService = {
  // Summarization using BART
  generateSummary: async (title, content) => {
    try {
      const response = await fetch(
        `${HF_BASE_URL}/facebook/bart-large-cnn`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: content.substring(0, 1024), // BART max 1024 tokens
            parameters: { max_length: 130, min_length: 30 }
          })
        }
      );
      
      const result = await response.json();
      return result[0]?.summary_text || content.substring(0, 200);
    } catch (error) {
      console.error('HuggingFace summarization failed:', error);
      return content.substring(0, 200); // Fallback
    }
  },
  
  // Q&A using RoBERTa
  answerQuestion: async (context, question) => {
    try {
      const response = await fetch(
        `${HF_BASE_URL}/deepset/roberta-base-squad2`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: { question, context: context.substring(0, 1024) }
          })
        }
      );
      
      const result = await response.json();
      return result.answer || "I couldn't find an answer.";
    } catch (error) {
      return "Unable to answer at this time.";
    }
  },
  
  // Sentiment/Mood using Twitter RoBERTa
  classifyMood: async (text) => {
    try {
      const response = await fetch(
        `${HF_BASE_URL}/cardiffnlp/twitter-roberta-base-sentiment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: text.substring(0, 512) })
        }
      );
      
      const result = await response.json();
      const topLabel = result[0]?.[0]?.label;
      
      const moodMap = {
        'LABEL_0': 'serious',   // negative
        'LABEL_1': 'neutral',   // neutral
        'LABEL_2': 'calm'       // positive
      };
      
      return moodMap[topLabel] || 'neutral';
    } catch (error) {
      return 'neutral';
    }
  }
};

module.exports = huggingFaceService;
```

---

## ⚡ Quick Start

1. **Get free HuggingFace API key**:
   - Go to https://huggingface.co/settings/tokens
   - Create new token (free account)
   - Add to `.env`: `HF_API_KEY=hf_xxxxx`

2. **Keep OpenRouter as primary** (already configured!)

3. **Add HuggingFace as fallback**:
   ```javascript
   // In your AI service
   const result = await openRouterCall(prompt);
   if (!result) {
     result = await huggingFaceCall(prompt); // Fallback
   }
   ```

---

## 📊 Cost Comparison

| Provider | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **OpenRouter** | ✅ Unlimited (free models) | $0.0001/token | Your current setup |
| **HuggingFace** | ✅ 30K requests/month | $0.06/hr | Specialized models |
| **Replicate** | ✅ First predictions | $0.0001/run | Quick testing |
| **Local (Ollama)** | ✅ Completely free | - | Full control |
| **Gemma API** | ❌ Requires credits | Pay-as-you-go | Google ecosystem |

**Recommendation**: Keep OpenRouter free models + add HuggingFace for specialized tasks = **$0/month**
