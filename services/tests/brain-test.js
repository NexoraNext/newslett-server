/**
 * Brain Architecture Integration Test
 * 
 * Tests that all brain services are properly connected and working.
 * Run with: node services/tests/brain-test.js
 */

require('dotenv').config();

const brainService = require('../brainService');
const decisionMakerService = require('../decisionMakerService');
const multilingualService = require('../multilingualService');
const huggingFaceService = require('../huggingFaceService');

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const log = {
    pass: (msg) => console.log(`${GREEN}✅ PASS${RESET}: ${msg}`),
    fail: (msg) => console.log(`${RED}❌ FAIL${RESET}: ${msg}`),
    info: (msg) => console.log(`${BLUE}ℹ️  INFO${RESET}: ${msg}`),
    warn: (msg) => console.log(`${YELLOW}⚠️  WARN${RESET}: ${msg}`),
    section: (msg) => console.log(`\n${BLUE}═══════════════════════════════════════${RESET}\n${BLUE}  ${msg}${RESET}\n${BLUE}═══════════════════════════════════════${RESET}\n`)
};

async function runTests() {
    console.log('\n🧠 BRAIN ARCHITECTURE INTEGRATION TEST\n');
    console.log('Testing that all AI services are properly connected...\n');

    let passed = 0;
    let failed = 0;

    // ===========================
    // 1. Service Availability
    // ===========================
    log.section('1. Service Availability');

    // Brain Service
    try {
        const brainStatus = brainService.getStatus();
        if (brainStatus) {
            log.pass('brainService loaded and responsive');
            log.info(`  Brain enabled: ${brainStatus.enabled}`);
            passed++;
        }
    } catch (e) {
        log.fail(`brainService: ${e.message}`);
        failed++;
    }

    // Decision Maker Service
    try {
        const dmStatus = decisionMakerService.getStatus();
        if (dmStatus) {
            log.pass('decisionMakerService loaded and responsive');
            log.info(`  Model: ${dmStatus.model}`);
            log.info(`  Enabled: ${dmStatus.enabled}`);
            passed++;
        }
    } catch (e) {
        log.fail(`decisionMakerService: ${e.message}`);
        failed++;
    }

    // Multilingual Service
    try {
        const mlStatus = multilingualService.getStatus();
        if (mlStatus) {
            log.pass('multilingualService loaded and responsive');
            log.info(`  Model: ${mlStatus.model}`);
            log.info(`  Languages: ${mlStatus.supportedLanguages}`);
            passed++;
        }
    } catch (e) {
        log.fail(`multilingualService: ${e.message}`);
        failed++;
    }

    // HuggingFace Service
    try {
        const hfEnabled = huggingFaceService.isEnabled();
        log.pass('huggingFaceService loaded and responsive');
        log.info(`  Enabled: ${hfEnabled}`);
        passed++;
    } catch (e) {
        log.fail(`huggingFaceService: ${e.message}`);
        failed++;
    }

    // ===========================
    // 2. Language Detection
    // ===========================
    log.section('2. Language Detection (Offline)');

    const languageTests = [
        { text: 'The quick brown fox jumped over the lazy dog in the morning.', expected: 'en' },
        { text: 'Ceci est un article de presse en français.', expected: 'fr' },
        { text: 'Este es un artículo de noticias en español.', expected: 'es' },
        { text: 'Dies ist ein Nachrichtenartikel auf Deutsch.', expected: 'de' },
        { text: 'これは日本語のニュース記事です。', expected: 'ja' },
        { text: '这是一篇中文新闻文章。', expected: 'zh' },
    ];

    for (const test of languageTests) {
        try {
            const detected = multilingualService.detectLanguage(test.text);
            if (detected === test.expected) {
                log.pass(`Detected "${test.expected}" correctly`);
                passed++;
            } else {
                log.fail(`Expected "${test.expected}", got "${detected}"`);
                failed++;
            }
        } catch (e) {
            log.fail(`Language detection error: ${e.message}`);
            failed++;
        }
    }

    // ===========================
    // 3. Heuristic Decision Making
    // ===========================
    log.section('3. Heuristic Decision Making (Offline)');

    const heuristicTests = [
        {
            title: 'Breaking: Government announces new climate policy',
            content: 'The president announced today that the government will invest $50 billion in renewable energy.',
            expected: 'PROCESS'
        },
        {
            title: 'You Won\'t Believe What This Celebrity Did!',
            content: 'Click here to see shocking photos of your favorite star.',
            expected: 'SKIP'
        },
        {
            title: 'Study finds new treatment for disease',
            content: 'Researchers at the university have announced a breakthrough in medical research.',
            expected: 'PROCESS'
        }
    ];

    for (const test of heuristicTests) {
        try {
            const decision = decisionMakerService.heuristicDecision(test.title, test.content);
            if (decision === test.expected) {
                log.pass(`Heuristic: "${test.title.substring(0, 30)}..." → ${decision}`);
                passed++;
            } else {
                log.fail(`Expected ${test.expected}, got ${decision}`);
                failed++;
            }
        } catch (e) {
            log.fail(`Heuristic decision error: ${e.message}`);
            failed++;
        }
    }

    // ===========================
    // 4. Brain Pipeline (Offline Mock)
    // ===========================
    log.section('4. Brain Pipeline Connection');

    try {
        // Check that brain can access all sub-services
        const status = brainService.getStatus();

        if (status.services.decisionMaker) {
            log.pass('Brain → DecisionMaker connection OK');
            passed++;
        } else {
            log.fail('Brain → DecisionMaker connection FAILED');
            failed++;
        }

        if (status.services.multilingual) {
            log.pass('Brain → Multilingual connection OK');
            passed++;
        } else {
            log.fail('Brain → Multilingual connection FAILED');
            failed++;
        }

        if (status.services.huggingFace) {
            log.pass('Brain → HuggingFace connection OK');
            passed++;
        } else {
            log.fail('Brain → HuggingFace connection FAILED');
            failed++;
        }
    } catch (e) {
        log.fail(`Brain pipeline error: ${e.message}`);
        failed += 3;
    }

    // ===========================
    // 5. Isolation Verification
    // ===========================
    log.section('5. Isolation Verification');

    // Verify that decision maker doesn't import multilingual
    try {
        const dmCode = require('fs').readFileSync(
            require('path').join(__dirname, '../decisionMakerService.js'),
            'utf8'
        );

        if (!dmCode.includes("require('./multilingualService')")) {
            log.pass('Decision Maker does NOT import Multilingual (isolated!)');
            passed++;
        } else {
            log.fail('Decision Maker imports Multilingual (isolation broken!)');
            failed++;
        }

        // Strip comments before checking for Qwen references
        const codeWithoutComments = dmCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        if (!codeWithoutComments.toLowerCase().includes('qwen')) {
            log.pass('Decision Maker has no Qwen code references (isolated!)');
            passed++;
        } else {
            log.fail('Decision Maker references Qwen in code (isolation broken!)');
            failed++;
        }
    } catch (e) {
        log.warn(`Could not verify isolation: ${e.message}`);
    }

    // ===========================
    // Summary
    // ===========================
    log.section('TEST SUMMARY');

    console.log(`Total tests: ${passed + failed}`);
    console.log(`${GREEN}Passed: ${passed}${RESET}`);
    console.log(`${RED}Failed: ${failed}${RESET}`);
    console.log('');

    if (failed === 0) {
        console.log(`${GREEN}🎉 ALL TESTS PASSED! Brain is ready.${RESET}\n`);
        console.log('The AI brain architecture is properly connected:');
        console.log('  ✅ Phi-2 makes independent decisions');
        console.log('  ✅ Qwen handles translation (isolated)');
        console.log('  ✅ BART/RoBERTa/MiniLM for heavy lifting');
        console.log('  ✅ brainService orchestrates everything');
        console.log('');
    } else {
        console.log(`${RED}⚠️ Some tests failed. Please review the errors above.${RESET}\n`);
    }

    process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
