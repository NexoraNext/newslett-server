#!/usr/bin/env node
/**
 * Brain CLI - Interactive Terminal Interface
 * 
 * Talk to the Newslett AI Brain directly from your terminal.
 * Run with: node brain-cli.js
 */

require('dotenv').config();

const readline = require('readline');
const brainService = require('./services/brainService');
const decisionMakerService = require('./services/decisionMakerService');
const multilingualService = require('./services/multilingualService');
const huggingFaceService = require('./services/huggingFaceService');

// Colors
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function printBanner() {
    console.clear();
    console.log(`
${CYAN}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ${BOLD}🧠 NEWSLETT BRAIN CLI${RESET}${CYAN}                                          ║
║   ${DIM}Interactive AI Terminal Interface${RESET}${CYAN}                             ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${RESET}
`);
}

function printHelp() {
    console.log(`
${BOLD}Available Commands:${RESET}

  ${GREEN}process <article>${RESET}  - Process an article through the brain
  ${GREEN}decide <text>${RESET}      - Get Phi-2 decision (PROCESS/SKIP/CACHE)
  ${GREEN}detect <text>${RESET}      - Detect language of text
  ${GREEN}translate <text>${RESET}   - Translate text to English
  ${GREEN}summarize <text>${RESET}   - Generate summary using BART
  ${GREEN}mood <text>${RESET}        - Classify mood/sentiment using RoBERTa
  ${GREEN}status${RESET}             - Show brain status
  ${GREEN}help${RESET}               - Show this help
  ${GREEN}clear${RESET}              - Clear screen
  ${GREEN}exit${RESET}               - Exit the CLI

${DIM}Tip: You can paste multi-line text, then press Enter twice to submit.${RESET}
`);
}

async function showStatus() {
    console.log(`\n${BOLD}🧠 Brain Status${RESET}\n`);

    const status = brainService.getStatus();

    console.log(`${CYAN}Brain Enabled:${RESET} ${status.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`\n${BOLD}Services:${RESET}`);

    // Decision Maker
    const dm = status.services.decisionMaker;
    console.log(`  ${GREEN}Decision Maker (Phi-2):${RESET}`);
    console.log(`    Model: ${dm.model}`);
    console.log(`    Enabled: ${dm.enabled ? '✅' : '❌'}`);
    console.log(`    Cache: ${dm.cacheSize}/${dm.maxCacheSize} entries`);

    // Multilingual
    const ml = status.services.multilingual;
    console.log(`\n  ${GREEN}Multilingual (Qwen 2.5):${RESET}`);
    console.log(`    Model: ${ml.model}`);
    console.log(`    Enabled: ${ml.enabled ? '✅' : '❌'}`);
    console.log(`    Languages: ${ml.supportedLanguages}`);

    // HuggingFace
    const hf = status.services.huggingFace;
    console.log(`\n  ${GREEN}Heavy Lifting (HuggingFace):${RESET}`);
    console.log(`    Enabled: ${hf.enabled ? '✅' : '❌'}`);
    console.log(`    Models: BART, RoBERTa, MiniLM`);

    console.log('');
}

async function processArticle(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: process <article title and content>${RESET}`);
        return;
    }

    console.log(`\n${BLUE}🧠 Processing article through brain...${RESET}\n`);

    try {
        const parts = text.split('|');
        const title = parts[0].trim();
        const content = parts.length > 1 ? parts[1].trim() : title;

        const result = await brainService.processArticle({
            title,
            content,
            source: 'CLI Input'
        });

        console.log(`${GREEN}Decision:${RESET} ${result.decision}`);
        console.log(`${GREEN}Source Language:${RESET} ${result.sourceLanguage}`);
        console.log(`${GREEN}Processed:${RESET} ${result.processed ? '✅' : '❌'}`);

        if (result.summary) {
            console.log(`\n${GREEN}Summary:${RESET}\n${result.summary}`);
        }

        if (result.mood) {
            console.log(`\n${GREEN}Mood:${RESET} ${result.mood}`);
        }

        if (result.whyThisMatters) {
            console.log(`\n${GREEN}Why This Matters:${RESET}\n${result.whyThisMatters}`);
        }

        console.log(`\n${DIM}Processing time: ${result.processingTime}ms${RESET}`);

        if (result.errors.length > 0) {
            console.log(`\n${RED}Errors:${RESET} ${result.errors.join(', ')}`);
        }
    } catch (error) {
        console.log(`${RED}Error: ${error.message}${RESET}`);
    }
}

async function makeDecision(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: decide <article text>${RESET}`);
        return;
    }

    console.log(`\n${BLUE}🧠 Phi-2 is thinking...${RESET}\n`);

    try {
        const decision = await decisionMakerService.makeDecision(text, text);

        const emoji = {
            'PROCESS': '✅',
            'SKIP': '⏭️',
            'CACHE': '📋'
        };

        console.log(`${GREEN}Decision:${RESET} ${emoji[decision] || '❓'} ${decision}`);

        if (decision === 'PROCESS') {
            console.log(`${DIM}→ Article will be processed by BART/RoBERTa/MiniLM${RESET}`);
        } else if (decision === 'SKIP') {
            console.log(`${DIM}→ Article is low-value and will be skipped${RESET}`);
        } else if (decision === 'CACHE') {
            console.log(`${DIM}→ Similar content was recently processed, using cache${RESET}`);
        }
    } catch (error) {
        console.log(`${RED}Error: ${error.message}${RESET}`);
    }
}

async function detectLanguage(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: detect <text>${RESET}`);
        return;
    }

    const lang = multilingualService.detectLanguage(text);
    const langNames = {
        'en': 'English', 'fr': 'French', 'es': 'Spanish', 'de': 'German',
        'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'zh': 'Chinese',
        'ja': 'Japanese', 'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi'
    };

    console.log(`\n${GREEN}Detected:${RESET} ${langNames[lang] || lang} (${lang})`);
    console.log(`${GREEN}Needs translation:${RESET} ${lang !== 'en' ? '✅ Yes' : '❌ No'}`);
}

async function translateText(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: translate <text>${RESET}`);
        return;
    }

    console.log(`\n${BLUE}🌍 Translating with Qwen 2.5...${RESET}\n`);

    try {
        const result = await multilingualService.translateToEnglish(text);
        console.log(`${GREEN}Source Language:${RESET} ${result.sourceLang}`);
        console.log(`${GREEN}Translation:${RESET}\n${result.text}`);
    } catch (error) {
        console.log(`${RED}Error: ${error.message}${RESET}`);
    }
}

async function summarizeText(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: summarize <text>${RESET}`);
        return;
    }

    console.log(`\n${BLUE}📝 Summarizing with BART...${RESET}\n`);

    try {
        const summary = await huggingFaceService.generateSummary('Article', text);
        if (summary) {
            console.log(`${GREEN}Summary:${RESET}\n${summary}`);
        } else {
            console.log(`${YELLOW}Could not generate summary. HuggingFace API may be unavailable.${RESET}`);
        }
    } catch (error) {
        console.log(`${RED}Error: ${error.message}${RESET}`);
    }
}

async function classifyMood(text) {
    if (!text) {
        console.log(`${YELLOW}Usage: mood <text>${RESET}`);
        return;
    }

    console.log(`\n${BLUE}😊 Classifying mood with RoBERTa...${RESET}\n`);

    try {
        const mood = await huggingFaceService.classifyMood(text);
        if (mood) {
            const moodEmoji = {
                'positive': '😊',
                'negative': '😔',
                'neutral': '😐',
                'calm': '😌',
                'serious': '😤'
            };
            console.log(`${GREEN}Mood:${RESET} ${moodEmoji[mood] || '❓'} ${mood}`);
        } else {
            console.log(`${YELLOW}Could not classify mood. HuggingFace API may be unavailable.${RESET}`);
        }
    } catch (error) {
        console.log(`${RED}Error: ${error.message}${RESET}`);
    }
}

function prompt() {
    rl.question(`\n${MAGENTA}brain>${RESET} `, async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            prompt();
            return;
        }

        const [command, ...args] = trimmed.split(' ');
        const argText = args.join(' ');

        switch (command.toLowerCase()) {
            case 'exit':
            case 'quit':
            case 'q':
                console.log(`\n${CYAN}👋 Goodbye! Brain signing off.${RESET}\n`);
                rl.close();
                process.exit(0);
                break;

            case 'help':
            case '?':
                printHelp();
                break;

            case 'clear':
            case 'cls':
                printBanner();
                break;

            case 'status':
                await showStatus();
                break;

            case 'process':
                await processArticle(argText);
                break;

            case 'decide':
                await makeDecision(argText);
                break;

            case 'detect':
                await detectLanguage(argText);
                break;

            case 'translate':
                await translateText(argText);
                break;

            case 'summarize':
                await summarizeText(argText);
                break;

            case 'mood':
                await classifyMood(argText);
                break;

            default:
                console.log(`${YELLOW}Unknown command: ${command}${RESET}`);
                console.log(`${DIM}Type 'help' for available commands.${RESET}`);
        }

        prompt();
    });
}

// Main
printBanner();
console.log(`${DIM}Type 'help' for available commands, 'exit' to quit.${RESET}`);
prompt();
