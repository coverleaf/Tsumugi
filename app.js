// Global State Variables
let globalBlueprints = [];
let currentBpIndex = 0;
let vaultDeck = JSON.parse(localStorage.getItem('tsumugi_vault')) || [];

// Canned demo dataset for "See an example first" — mirrors the exact shape the Gemini
// response is parsed into, and reuses the words already shown in the textarea placeholder
// so a curious visitor can paste those same words later and compare. This never touches
// the API or the Vault — it's static, local, and free.
const DEMO_DATA = {
    blueprints: [
        {
            kanji: "猫",
            hiragana: "ねこ",
            katakana: "ネコ",
            romaji: "neko",
            meaning: "Cat",
            mnemonic: "犭(the 'animal' radical) sits beside 苗 (a young seedling) — picture a cat pouncing playfully at a sprout in a garden.",
            partOfSpeech: "noun",
            conjugations: null
        },
        {
            kanji: "桜",
            hiragana: "さくら",
            katakana: "サクラ",
            romaji: "sakura",
            meaning: "Cherry blossom",
            mnemonic: "木 (tree) stands beside a shape built from soft, scattering strokes — a tree caught mid-bloom, shedding petals in the wind.",
            partOfSpeech: "noun",
            conjugations: null
        },
        {
            kanji: "公園",
            hiragana: "こうえん",
            katakana: "コウエン",
            romaji: "kouen",
            meaning: "Park",
            mnemonic: "公 (public, shared) + 園 (garden) — literally a 'public garden,' open ground anyone can wander into.",
            partOfSpeech: "noun",
            conjugations: null
        }
    ],
    sentences: [
        {
            title: "Thread 01",
            japanese: "猫は公園にいます。",
            romaji: "Neko wa kouen ni imasu.",
            english: "The cat is in the park.",
            vibe: "A plain, everyday observation — and notice the verb: います (imasu) is reserved for living things, like the cat.",
            xp: ["猫", "公園"]
        },
        {
            title: "Thread 02",
            japanese: "公園に桜があります。",
            romaji: "Kouen ni sakura ga arimasu.",
            english: "There are cherry blossoms in the park.",
            vibe: "Same park, different verb — あります (arimasu) instead of imasu, because a blossom isn't alive and moving the way a cat is.",
            xp: ["公園", "桜"]
        },
        {
            title: "Thread 03",
            japanese: "猫と桜は公園です。",
            romaji: "Neko to sakura wa kouen desu.",
            english: "The cat and the cherry blossom are the park.",
            vibe: "A poetic overreach — a cat and a blossom obviously aren't literally 'the park,' but together they're what make it feel like one.",
            xp: ["猫", "桜", "公園"]
        },
        {
            title: "Thread 04",
            japanese: "公園は猫と桜です。",
            romaji: "Kouen wa neko to sakura desu.",
            english: "The park is the cat and the cherry blossom.",
            vibe: "The same idea, flipped — instead of the pair defining the park, the park is redefined as just these two things.",
            xp: ["公園", "猫", "桜"]
        }
    ],
    story: {
        japanese: "猫は公園にいます。桜も公園にあります。猫と桜は公園です。",
        romaji: "Neko wa kouen ni imasu. Sakura mo kouen ni arimasu. Neko to sakura wa kouen desu.",
        english: "The cat is in the park. The cherry blossoms are in the park too. The cat and the cherry blossoms are the park."
    }
};

// JSON Schema passed to Gemini's structured-output config. This replaces the old approach
// of describing the desired JSON shape in prose inside the prompt and hoping the model
// complies — with this schema attached, Gemini's generateContent API guarantees the
// response is syntactically valid JSON matching this exact shape, so no markdown-fence
// stripping or "please output raw JSON" prompt instructions are needed anymore.
const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        blueprints: {
            type: "array",
            description: "One entry per input word/kanji, in the same order they were provided.",
            minItems: 1,
            maxItems: 10,
            items: {
                type: "object",
                properties: {
                    kanji: { type: "string", description: "The exact word or kanji as provided by the user." },
                    hiragana: { type: "string", description: "The word's reading in hiragana." },
                    katakana: { type: "string", description: "The word's reading in katakana." },
                    romaji: { type: "string", description: "The word's reading in romaji." },
                    meaning: { type: "string", description: "A concise English meaning." },
                    mnemonic: { type: "string", description: "A short memory aid connecting the kanji's visual components to its meaning." },
                    partOfSpeech: { type: "string", format: "enum", enum: ["verb", "i-adjective", "na-adjective", "noun", "other"], description: "The grammatical part of speech of this word." },
                    conjugations: {
                        type: "object",
                        nullable: true,
                        description: "A short polite-form conjugation table. Populate ONLY when partOfSpeech is 'verb' or 'i-adjective' — must be null/omitted for every other part of speech.",
                        properties: {
                            present: { type: "string", description: "Present/dictionary polite form (~ます or ~です)." },
                            presentNegative: { type: "string", description: "Present negative polite form." },
                            past: { type: "string", description: "Past polite form." },
                            pastNegative: { type: "string", description: "Past negative polite form." },
                            teForm: { type: "string", description: "Te-form, used to connect clauses." }
                        },
                        required: ["present", "presentNegative", "past", "pastNegative", "teForm"]
                    }
                },
                required: ["kanji", "hiragana", "katakana", "romaji", "meaning", "mnemonic", "partOfSpeech", "conjugations"]
            }
        },
        sentences: {
            type: "array",
            description: "Exactly four example sentences, each built only from the provided words plus grammatical particles and copula forms.",
            minItems: 4,
            maxItems: 4,
            items: {
                type: "object",
                properties: {
                    title: { type: "string", format: "enum", enum: ["Thread 01", "Thread 02", "Thread 03", "Thread 04"] },
                    japanese: { type: "string" },
                    romaji: { type: "string" },
                    english: { type: "string" },
                    vibe: { type: "string", description: "A short note on the sentence's tone or the grammar point it demonstrates." },
                    xp: { type: "array", items: { type: "string" }, description: "Which of the input words appear in this sentence." }
                },
                required: ["title", "japanese", "romaji", "english", "vibe", "xp"]
            }
        },
        story: {
            type: "object",
            description: "A short micro-story combining the sentences, using only the provided words.",
            properties: {
                japanese: { type: "string" },
                romaji: { type: "string" },
                english: { type: "string" }
            },
            required: ["japanese", "romaji", "english"]
        }
    },
    required: ["blueprints", "sentences", "story"]
};

// PWA: register the service worker so the app qualifies for install prompts and can open the
// app shell offline. Registered as early as possible, independent of DOMContentLoaded.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const stateInput = document.getElementById('state-input');
    const stateLoading = document.getElementById('state-loading');
    const stateReading = document.getElementById('state-reading');
    
    const btnWeave = document.getElementById('btn-weave');
    const btnDemo = document.getElementById('btn-demo');
    const btnReset = document.getElementById('btn-reset');
    const vocabInput = document.getElementById('vocab-input');
    const translationContainers = document.querySelectorAll('.translation-container');
    const demoBadge = document.getElementById('demo-badge');
    
    // Modal DOM Elements
    const settingsModal = document.getElementById('settings-modal');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveKey = document.getElementById('btn-save-key');
    const apiKeyInput = document.getElementById('api-key-input');

    // Blueprint DOM Elements
    const btnBpPrev = document.getElementById('btn-bp-prev');
    const btnBpNext = document.getElementById('btn-bp-next');

    // Vault DOM Elements
    const vaultChipsContainer = document.getElementById('vault-chips-container');
    const btnVaultClear = document.getElementById('btn-vault-clear');
    const btnVaultAll = document.getElementById('btn-vault-all');
    const wordCounter = document.getElementById('word-counter');

    // Confirm Modal DOM Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

    // Theme Toggle DOM Elements
    const btnToggleTheme = document.getElementById('btn-toggle-theme');
    const themeMetaTag = document.querySelector('meta[name="theme-color"]');

    // Onboarding Modal DOM Elements
    const onboardingModal = document.getElementById('onboarding-modal');
    const btnOpenOnboarding = document.getElementById('btn-open-onboarding');
    const btnOnboardingDismiss = document.getElementById('btn-onboarding-dismiss');

    // Voice/Speed Settings DOM Elements
    const voiceSelect = document.getElementById('voice-select');
    const speechRateInput = document.getElementById('speech-rate');
    const speechRateValue = document.getElementById('speech-rate-value');

    // Loading Status DOM Element
    const loadingStatusEl = document.getElementById('loading-status');

    // Bridge Mode / Genre / Export DOM Elements
    const btnBridgeToggle = document.getElementById('bridge-mode-toggle');
    const bridgeModeHint = document.getElementById('bridge-mode-hint');
    const genreSelect = document.getElementById('genre-select');
    const bridgeWordsNote = document.getElementById('bridge-words-note');
    const btnExportCsv = document.getElementById('btn-export-csv');
    
    // Load API Key on init
    const savedApiKey = localStorage.getItem('tsumugi_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }

    // Dark Mode Toggle — the initial theme class is already applied by the no-flash script in
    // the document head; this just syncs the theme-color meta tag and wires up the click toggle.
    function syncThemeColorMeta() {
        if (themeMetaTag) {
            themeMetaTag.setAttribute('content', document.documentElement.classList.contains('dark') ? '#211E1A' : '#F4F0EA');
        }
    }
    syncThemeColorMeta();

    btnToggleTheme.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('tsumugi_theme', isDark ? 'dark' : 'light');
        syncThemeColorMeta();
    });

    // Onboarding Modal Toggles
    function openOnboarding() {
        onboardingModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            onboardingModal.classList.remove('opacity-0');
            onboardingModal.classList.add('opacity-100');
        });
    }

    function closeOnboarding() {
        onboardingModal.classList.remove('opacity-100');
        onboardingModal.classList.add('opacity-0');
        setTimeout(() => onboardingModal.classList.add('hidden'), 300);
    }

    btnOpenOnboarding.addEventListener('click', openOnboarding);
    btnOnboardingDismiss.addEventListener('click', () => {
        closeOnboarding();
        localStorage.setItem('tsumugi_onboarding_seen', 'true');
    });

    // Auto-show once on a visitor's very first-ever visit
    if (!localStorage.getItem('tsumugi_onboarding_seen')) {
        openOnboarding();
    }

    // Multi-stage loading copy — rotates through a few status lines while a weave is in
    // flight, instead of one static "Weaving context..." string for the whole wait.
    const LOADING_MESSAGES = ['Building blueprints…', 'Weaving sentences…', 'Writing the story…'];
    let loadingMessageInterval = null;

    function startLoadingMessages() {
        if (!loadingStatusEl) return;
        let i = 0;
        loadingStatusEl.textContent = LOADING_MESSAGES[i];
        loadingMessageInterval = setInterval(() => {
            i = (i + 1) % LOADING_MESSAGES.length;
            loadingStatusEl.textContent = LOADING_MESSAGES[i];
        }, 1600);
    }

    function stopLoadingMessages() {
        if (loadingMessageInterval) {
            clearInterval(loadingMessageInterval);
            loadingMessageInterval = null;
        }
    }

    // Success flash — briefly rings each of the three result cards, staggered slightly, so a
    // completed weave has a distinct "it worked" moment instead of just appearing silently.
    function playSuccessFlash() {
        const cards = document.querySelectorAll('#state-reading > div.bg-wabi-surface\\/30');
        cards.forEach((card, i) => {
            setTimeout(() => {
                card.classList.add('animate-success-flash');
                setTimeout(() => card.classList.remove('animate-success-flash'), 700);
            }, i * 120);
        });
    }

    // TTS Voice Loading — speechSynthesis.getVoices() often returns an empty array on the
    // very first call because voices load asynchronously in many browsers. Without this,
    // the first playback can silently fall back to a non-Japanese default voice. We load
    // eagerly here AND listen for the async voiceschanged event to catch the late-loading case.
    let availableVoices = [];

    function populateVoiceOptions() {
        if (!voiceSelect) return;
        const jpVoices = availableVoices.filter(v => v.lang && v.lang.startsWith('ja'));
        const savedVoiceURI = localStorage.getItem('tsumugi_voice_uri') || '';

        voiceSelect.innerHTML = '<option value="">Browser default</option>' +
            jpVoices.map(v => `<option value="${escapeHTML(v.voiceURI)}"${v.voiceURI === savedVoiceURI ? ' selected' : ''}>${escapeHTML(v.name)}</option>`).join('');
    }

    function refreshVoices() {
        availableVoices = window.speechSynthesis.getVoices();
        populateVoiceOptions();
    }
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;

    voiceSelect.addEventListener('change', () => {
        localStorage.setItem('tsumugi_voice_uri', voiceSelect.value);
    });

    // Playback speed — restore any saved rate, and persist changes as the slider moves
    const savedRate = parseFloat(localStorage.getItem('tsumugi_speech_rate')) || 1;
    speechRateInput.value = savedRate;
    speechRateValue.textContent = `${savedRate.toFixed(1)}x`;

    speechRateInput.addEventListener('input', () => {
        const rate = parseFloat(speechRateInput.value);
        speechRateValue.textContent = `${rate.toFixed(1)}x`;
        localStorage.setItem('tsumugi_speech_rate', rate);
    });

    // Word Counter Function — enforces the "up to 10 words" limit shown in the placeholder
    const MAX_WORDS = 10;

    // Matches any Hiragana, Katakana, or CJK Unified Ideograph (kanji) character. Used to reject
    // non-Japanese input (romaji, random ASCII, symbols) before it reaches the Vault or the API.
    const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

    function updateWordCounter() {
        if (!wordCounter || !vocabInput || !btnWeave) return;

        const words = vocabInput.value.split(/[\s\n]+/).filter(w => w.trim() !== '');
        const count = words.length;
        wordCounter.textContent = `${count} / ${MAX_WORDS} words`;

        if (count > MAX_WORDS) {
            wordCounter.classList.remove('text-wabi-muted');
            wordCounter.classList.add('text-red-500', 'font-semibold');
            btnWeave.disabled = true;
            btnWeave.classList.add('opacity-40', 'cursor-not-allowed');
        } else {
            wordCounter.classList.add('text-wabi-muted');
            wordCounter.classList.remove('text-red-500', 'font-semibold');
            btnWeave.disabled = false;
            btnWeave.classList.remove('opacity-40', 'cursor-not-allowed');
        }
    }

    // Render Vault Function
    function renderVault() {
        if (!vaultChipsContainer || !vocabInput) return;

        vaultChipsContainer.innerHTML = '';
        updateWordCounter();
        renderBridgeToggle();

        if (vaultDeck.length === 0) {
            vaultChipsContainer.innerHTML = '<p class="text-xs text-wabi-muted/70 italic px-1 py-1">Words you weave will collect here.</p>';
            return;
        }

        // Parse currently active words in the textarea
        const currentWordsText = vocabInput.value.split(/[\s\n]+/).filter(w => w.trim() !== '');
        
        vaultDeck.forEach(word => {
            const btn = document.createElement('button');
            btn.textContent = word;
            
            const isActive = currentWordsText.includes(word);
            
            // Base classes
            btn.className = 'px-3 py-1.5 rounded-lg text-sm border transition-all duration-300 focus:outline-none active:scale-95';
            
            if (isActive) {
                btn.classList.add('bg-wabi-accent', 'text-[#F4F0EA]', 'border-wabi-accent');
            } else {
                btn.classList.add('bg-wabi-surface/40', 'text-wabi-text', 'border-wabi-border/40', 'hover:bg-wabi-surface');
            }
            
            btn.onclick = () => {
                let words = vocabInput.value.split(/[\s\n]+/).filter(w => w.trim() !== '');
                if (words.includes(word)) {
                    words = words.filter(w => w !== word); // Remove word
                } else {
                    words.push(word); // Add word
                }
                vocabInput.value = words.join('\n');
                renderVault(); // Rerender to update active colors
            };
            
            vaultChipsContainer.appendChild(btn);
        });
    }

    // Bridge Mode — lets sentence generation optionally pull in a few already-learned Vault
    // words alongside the new ones, so sentences stop being capped at "beginner noun + copula"
    // once the Vault has something to draw from. Only enabled when there's actually something
    // eligible to bridge in (Vault words not already sitting in the textarea).
    let bridgeModeEnabled = localStorage.getItem('tsumugi_bridge_mode') === 'true';

    function getEligibleBridgeWords() {
        const currentWords = new Set(vocabInput.value.split(/[\s\n]+/).filter(w => w.trim() !== ''));
        return vaultDeck.filter(w => !currentWords.has(w));
    }

    function renderBridgeToggle() {
        if (!btnBridgeToggle) return;
        const knob = btnBridgeToggle.querySelector('span');
        const hasEligibleWords = getEligibleBridgeWords().length > 0;

        btnBridgeToggle.disabled = !hasEligibleWords;
        btnBridgeToggle.classList.toggle('opacity-40', !hasEligibleWords);
        btnBridgeToggle.classList.toggle('cursor-not-allowed', !hasEligibleWords);

        const isOn = bridgeModeEnabled && hasEligibleWords;
        btnBridgeToggle.setAttribute('aria-checked', String(isOn));
        btnBridgeToggle.classList.toggle('bg-wabi-accent', isOn);
        btnBridgeToggle.classList.toggle('bg-wabi-element', !isOn);
        if (knob) knob.classList.toggle('translate-x-5', isOn);

        if (bridgeModeHint) {
            bridgeModeHint.textContent = hasEligibleWords
                ? 'Blend in a few already-learned Vault words for richer sentences.'
                : 'Add more words to your Vault to unlock Bridge Mode.';
        }
    }

    if (btnBridgeToggle) {
        btnBridgeToggle.addEventListener('click', () => {
            if (btnBridgeToggle.disabled) return;
            bridgeModeEnabled = !bridgeModeEnabled;
            localStorage.setItem('tsumugi_bridge_mode', String(bridgeModeEnabled));
            renderBridgeToggle();
        });
    }

    // Genre — persisted purely as a convenient starting point; picking a different genre before
    // a weave is what actually creates variety between sessions.
    if (genreSelect) {
        const savedGenre = localStorage.getItem('tsumugi_genre');
        if (savedGenre && genreSelect.querySelector(`option[value="${savedGenre}"]`)) {
            genreSelect.value = savedGenre;
        }
        genreSelect.addEventListener('change', () => {
            localStorage.setItem('tsumugi_genre', genreSelect.value);
        });
    }

    // Bind Vault Actions
    vocabInput.addEventListener('input', renderVault);
    
    btnVaultClear.addEventListener('click', () => {
        if (vaultDeck.length === 0) {
            customAlert('Your vault is already empty.');
            return;
        }

        const count = vaultDeck.length;
        openConfirm(
            'Clear Vault?',
            `This will permanently delete all ${count} saved word${count === 1 ? '' : 's'} from your vault. This cannot be undone.`,
            () => {
                vaultDeck = [];
                localStorage.removeItem('tsumugi_vault');
                renderVault();
                customAlert('Vault cleared.');
            }
        );
    });

    btnVaultAll.addEventListener('click', () => {
        vocabInput.value = vaultDeck.join('\n');
        renderVault();
    });

    // Initial Vault Render
    renderVault();

    // Custom Alert Box
    // Escapes text for safe interpolation into an HTML string (both text-node and attribute-value
    // contexts). Used wherever Gemini's response text gets built into a template literal that's
    // then inserted via insertAdjacentHTML — that content should never be trusted as pre-sanitized
    // HTML just because it came from an API rather than a user directly.
    function escapeHTML(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function customAlert(message) {
        const alertBox = document.createElement('div');
        alertBox.className = 'fixed top-6 left-1/2 transform -translate-x-1/2 bg-wabi-surface border border-wabi-border text-wabi-text px-6 py-3 rounded-xl shadow-organic z-[100] transition-opacity duration-300 font-medium opacity-0 flex items-center gap-2';
        alertBox.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-wabi-accent"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;
        // Message goes in as a text node, not interpolated into the HTML string — some callers
        // pass text that originated from the Gemini API (error messages), which should never be
        // trusted as safe HTML.
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        alertBox.appendChild(messageSpan);
        document.body.appendChild(alertBox);
        
        requestAnimationFrame(() => {
            alertBox.style.opacity = '1';
        });
        
        setTimeout(() => {
            alertBox.style.opacity = '0';
            setTimeout(() => alertBox.remove(), 300);
        }, 2500);
    }

    // Generic Confirm Modal (for destructive actions)
    function openConfirm(title, message, onConfirmCallback) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;

        // Clone the confirm button to strip any previous listener before attaching a fresh one
        const btnOk = document.getElementById('btn-confirm-ok');
        const newBtnOk = btnOk.cloneNode(true);
        btnOk.parentNode.replaceChild(newBtnOk, btnOk);
        newBtnOk.addEventListener('click', () => {
            onConfirmCallback();
            closeConfirmModal();
        });

        confirmModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            confirmModal.classList.remove('opacity-0');
            confirmModal.classList.add('opacity-100');
        });
    }

    function closeConfirmModal() {
        confirmModal.classList.remove('opacity-100');
        confirmModal.classList.add('opacity-0');
        setTimeout(() => {
            confirmModal.classList.add('hidden');
        }, 300);
    }

    btnConfirmCancel.addEventListener('click', closeConfirmModal);

    // Modal Toggles
    function openSettings() {
        settingsModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            settingsModal.classList.remove('opacity-0');
            settingsModal.classList.add('opacity-100');
        });
    }

    function closeSettings() {
        settingsModal.classList.remove('opacity-100');
        settingsModal.classList.add('opacity-0');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
        }, 300);
    }

    btnOpenSettings.addEventListener('click', openSettings);
    btnCloseSettings.addEventListener('click', closeSettings);

    // Save Key Logic
    btnSaveKey.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('tsumugi_api_key', key);
            customAlert('API Key Saved Securely!');
        } else {
            localStorage.removeItem('tsumugi_api_key');
            customAlert('API Key Removed.');
        }
        closeSettings();
    });

    // Blueprint Rendering Function
    const POS_LABELS = { verb: 'Verb', 'i-adjective': 'i-Adjective', 'na-adjective': 'na-Adjective', noun: 'Noun', other: 'Other' };

    function renderBlueprint(index) {
        if (!globalBlueprints || globalBlueprints.length === 0) return;
        
        const bp = globalBlueprints[index];
        
        document.getElementById('bp-title').textContent = `${bp.kanji} (${bp.romaji}) - ${bp.meaning}`;
        document.getElementById('bp-kanji').textContent = bp.kanji;
        document.getElementById('bp-hiragana').textContent = bp.hiragana;
        document.getElementById('bp-katakana').textContent = bp.katakana;
        document.getElementById('bp-romaji').textContent = bp.romaji;
        document.getElementById('bp-meaning').textContent = bp.meaning;
        document.getElementById('bp-mnemonic').textContent = bp.mnemonic;
        
        document.getElementById('bp-counter').textContent = `${index + 1} / ${globalBlueprints.length}`;

        // Part-of-speech badge
        const posBadge = document.getElementById('bp-pos-badge');
        if (posBadge) {
            if (bp.partOfSpeech && POS_LABELS[bp.partOfSpeech]) {
                posBadge.textContent = POS_LABELS[bp.partOfSpeech];
                posBadge.classList.remove('hidden');
            } else {
                posBadge.classList.add('hidden');
            }
        }

        // Conjugation table — only present for verbs and i-adjectives
        const conjSection = document.getElementById('bp-conjugation-section');
        if (conjSection) {
            if (bp.conjugations) {
                document.getElementById('bp-conj-present').textContent = bp.conjugations.present || '';
                document.getElementById('bp-conj-present-neg').textContent = bp.conjugations.presentNegative || '';
                document.getElementById('bp-conj-past').textContent = bp.conjugations.past || '';
                document.getElementById('bp-conj-past-neg').textContent = bp.conjugations.pastNegative || '';
                document.getElementById('bp-conj-te').textContent = bp.conjugations.teForm || '';
                conjSection.classList.remove('hidden');
            } else {
                conjSection.classList.add('hidden');
            }
        }
    }

    // Cross-link navigation — called directly via addEventListener closures on the XP chips now,
    // so it no longer needs to live on window for an inline onclick to find.
    function goToBlueprint(word) {
        const index = globalBlueprints.findIndex(bp => bp.kanji === word || bp.meaning === word);
        if (index !== -1) {
            currentBpIndex = index;
            renderBlueprint(currentBpIndex);
            // Smoothly scroll to the top of the page where the Blueprint card resides
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Flash the blueprint card briefly to indicate navigation success
            const bpCard = document.getElementById('bp-title').closest('.bg-wabi-surface\\/30');
            if (bpCard) {
                bpCard.classList.add('ring-2', 'ring-wabi-accent', 'transition-all', 'duration-300');
                setTimeout(() => bpCard.classList.remove('ring-2', 'ring-wabi-accent'), 600);
            }
        }
    }

    // Blueprint Carousel Controls
    btnBpPrev.addEventListener('click', () => {
        if (globalBlueprints.length === 0) return;
        currentBpIndex = (currentBpIndex - 1 + globalBlueprints.length) % globalBlueprints.length;
        renderBlueprint(currentBpIndex);
    });

    btnBpNext.addEventListener('click', () => {
        if (globalBlueprints.length === 0) return;
        currentBpIndex = (currentBpIndex + 1) % globalBlueprints.length;
        renderBlueprint(currentBpIndex);
    });

    // Shared rendering pipeline for a completed weave result — used by BOTH the real
    // Gemini API response and the canned demo dataset, so the demo and the real thing
    // always render identically and never drift out of sync with each other.
    function renderWeaveResult(parsedData) {
        // 1. Initialize Global Blueprints and Render the first one
        globalBlueprints = parsedData.blueprints || [];
        currentBpIndex = 0;
        renderBlueprint(currentBpIndex);

        // 2. Update The Sentences Container & Generate Clickable XP Chips
        const sentencesContainer = document.getElementById('sentences-container');
        if (sentencesContainer) {
            sentencesContainer.innerHTML = '';

            (parsedData.sentences || []).forEach((sentence, index) => {
                const isLast = index === (parsedData.sentences || []).length - 1;
                const borderClass = isLast ? '' : 'border-b border-wabi-border/50 pb-8';
                const chipsContainerId = `xp-chips-${index}`;

                const sentenceHTML = `
                    <div class="flex flex-col gap-4 ${borderClass}">
                        <h3 class="text-sm font-semibold text-wabi-accent uppercase tracking-wide">${escapeHTML(sentence.title)}</h3>
                        <div class="flex items-center">
                            <p class="text-2xl font-jp text-wabi-text leading-relaxed font-light">${escapeHTML(sentence.japanese)}</p>
                            <button class="btn-speak ml-3 p-1.5 text-wabi-muted hover:text-wabi-accent transition-colors focus:outline-none rounded-full hover:bg-wabi-element/30 active:scale-95" aria-label="Play audio" data-text="${escapeHTML(sentence.japanese)}">🔊</button>
                        </div>
                        
                        <div class="translation-container relative cursor-pointer group bg-wabi-element/30 rounded-xl p-5 border border-wabi-border/40 shadow-inner-soft transition-all hover:bg-wabi-element/50" onclick="this.classList.toggle('revealed')">
                            <span class="translation-hint absolute inset-0 flex items-center justify-center text-xs font-semibold text-wabi-muted tracking-widest uppercase z-10">Reveal Context</span>
                            <div class="translation-text text-wabi-text/90 text-sm sm:text-base font-light flex flex-col gap-3">
                                <p><span class="font-medium text-wabi-text/70 uppercase text-xs tracking-wider block mb-1">Romaji</span> (${escapeHTML(sentence.romaji)})</p>
                                <p><span class="font-medium text-wabi-text/70 uppercase text-xs tracking-wider block mb-1">English</span> ${escapeHTML(sentence.english)}</p>
                                <p><span class="font-medium text-wabi-text/70 uppercase text-xs tracking-wider block mb-1">Vibe</span> ${escapeHTML(sentence.vibe)}</p>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <span class="text-xs text-wabi-muted uppercase tracking-widest font-semibold mr-1">Follow the thread:</span>
                            <span id="${chipsContainerId}" class="flex flex-wrap items-center gap-2"></span>
                        </div>
                    </div>
                `;
                sentencesContainer.insertAdjacentHTML('beforeend', sentenceHTML);

                // Build the XP chips as real DOM nodes rather than an HTML string — textContent
                // and addEventListener are inherently safe regardless of what characters a word
                // contains, and a click handler bound via closure needs no string-embedding at all.
                const chipsContainer = document.getElementById(chipsContainerId);
                if (chipsContainer) {
                    (sentence.xp || []).forEach(word => {
                        const chip = document.createElement('span');
                        chip.textContent = word;
                        chip.className = 'bg-wabi-bg border border-wabi-border text-xs px-2 py-1 rounded-md cursor-pointer hover:bg-wabi-element transition-colors shadow-sm active:scale-95';
                        chip.addEventListener('click', () => goToBlueprint(word));
                        chipsContainer.appendChild(chip);
                    });
                }
            });
        }

        // 3. Update The Micro-Story Content
        if (parsedData.story) {
            document.getElementById('story-jp').textContent = parsedData.story.japanese || '';
            document.getElementById('story-speak').setAttribute('data-text', parsedData.story.japanese || '');
            document.getElementById('story-romaji').textContent = parsedData.story.romaji || '';
            document.getElementById('story-en').textContent = parsedData.story.english || '';
        }

        // 4. Attach Voice Event Listeners (including the dynamically built buttons and the story button)
        document.querySelectorAll('.btn-speak').forEach(btn => {
            // Use a clone to quickly scrub previous event listeners off persistent nodes (like the story one)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                const text = e.currentTarget.getAttribute('data-text');
                if (!text) return;

                // Just-in-time fallback in case this click fires before voiceschanged has ever fired
                if (availableVoices.length === 0) {
                    availableVoices = window.speechSynthesis.getVoices();
                }

                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'ja-JP';
                utterance.rate = parseFloat(localStorage.getItem('tsumugi_speech_rate')) || 1;

                // Prefer whichever voice was picked in Settings; fall back to auto-selecting
                // any Japanese voice if none was saved, or if the saved one isn't available
                // on this device/browser.
                const savedVoiceURI = localStorage.getItem('tsumugi_voice_uri');
                let selectedVoice = savedVoiceURI ? availableVoices.find(v => v.voiceURI === savedVoiceURI) : null;
                if (!selectedVoice) {
                    selectedVoice = availableVoices.find(v => v.lang === 'ja-JP') || availableVoices.find(v => v.lang && v.lang.startsWith('ja'));
                }
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                } else {
                    console.warn('No Japanese voice found on this device — falling back to the browser default voice.');
                }

                window.speechSynthesis.cancel(); // stop any currently-playing utterance so clicks don't overlap
                window.speechSynthesis.speak(utterance);
            });
        });
    }

    // Helper to handle transitions cleanly
    function switchState(hideElement, showElement) {
        hideElement.style.opacity = '0';
        hideElement.style.pointerEvents = 'none';
        
        setTimeout(() => {
            hideElement.classList.add('hidden');
            showElement.classList.remove('hidden');
            requestAnimationFrame(() => {
                showElement.style.opacity = '1';
                showElement.style.pointerEvents = 'auto';
            });
        }, 400); 
    }

    // Session Caching — keeps the current Reading Studio result in sessionStorage so an
    // accidental page refresh doesn't throw away a result that (for a real weave) cost an
    // API call to generate. Cleared explicitly on Reset. Wrapped defensively since
    // sessionStorage can throw in some contexts (private browsing, storage quota).
    const SESSION_CACHE_KEY = 'tsumugi_session';

    function saveSessionCache(parsedData, isDemo, bridgeWordsUsed) {
        try {
            sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ data: parsedData, isDemo, bridgeWordsUsed: bridgeWordsUsed || [] }));
        } catch (e) {
            console.warn('Could not cache this session:', e);
        }
    }

    function clearSessionCache() {
        try {
            sessionStorage.removeItem(SESSION_CACHE_KEY);
        } catch (e) {
            console.warn('Could not clear the cached session:', e);
        }
    }

    // Returns true if a cached session was found and restored
    function tryRestoreSession() {
        let cached;
        try {
            const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
            if (!raw) return false;
            cached = JSON.parse(raw);
        } catch (e) {
            console.warn('Could not restore the cached session:', e);
            return false;
        }
        if (!cached || !cached.data) return false;

        renderWeaveResult(cached.data);
        demoBadge.classList.toggle('hidden', !cached.isDemo);

        if (bridgeWordsNote) {
            if (!cached.isDemo && cached.bridgeWordsUsed && cached.bridgeWordsUsed.length > 0) {
                bridgeWordsNote.textContent = `Bridge words offered this session: ${cached.bridgeWordsUsed.join('、')}`;
                bridgeWordsNote.classList.remove('hidden');
            } else {
                bridgeWordsNote.classList.add('hidden');
            }
        }

        // Snap straight to the Reading Studio on load — no fade, since there's nothing to
        // transition from yet.
        stateInput.classList.add('hidden');
        stateInput.style.opacity = '0';
        stateInput.style.pointerEvents = 'none';

        stateReading.classList.remove('hidden');
        stateReading.style.opacity = '1';
        stateReading.style.pointerEvents = 'auto';

        return true;
    }

    // Initialization defaults — restore a cached session if one exists (e.g. after an
    // accidental refresh), otherwise start on the Input Desk as normal.
    if (!tryRestoreSession()) {
        stateInput.style.opacity = '1';
        stateInput.style.pointerEvents = 'auto';
    }

    // Event Listener: See an Example (Input -> Loading -> Reading, no API call, no key needed)
    // Both flags guard against a double-click or rapid re-click firing a second, overlapping
    // request — isWeaving matters most since it's the one that would burn real API quota.
    let isDemoing = false;
    let isWeaving = false;

    btnDemo.addEventListener('click', () => {
        if (isDemoing || isWeaving) return;
        isDemoing = true;

        switchState(stateInput, stateLoading);
        startLoadingMessages();

        // Small delay purely so the transition feels consistent with a real weave —
        // no network call happens here, this is 100% static local data.
        setTimeout(() => {
            stopLoadingMessages();
            demoBadge.classList.remove('hidden');
            if (bridgeWordsNote) bridgeWordsNote.classList.add('hidden');
            renderWeaveResult(DEMO_DATA);
            saveSessionCache(DEMO_DATA, true);
            switchState(stateLoading, stateReading);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(playSuccessFlash, 450);
            isDemoing = false;
        }, 500);
    });

    // Event Listener: Weave Context (Input -> Loading -> Reading)
    btnWeave.addEventListener('click', async () => {
        if (isWeaving) return;

        const apiKey = localStorage.getItem('tsumugi_api_key');
        if (!apiKey) {
            customAlert('Please save your API key in Settings first!');
            return;
        }
        
        const vocab = vocabInput.value.trim();
        if (!vocab) {
            customAlert('Please enter a kanji or vocabulary word!');
            return;
        }

        const wordCountCheck = vocab.split(/[\s\n]+/).filter(w => w.trim() !== '').length;
        if (wordCountCheck > MAX_WORDS) {
            customAlert(`Please limit your input to ${MAX_WORDS} words or fewer.`);
            return;
        }

        // Reject anything that isn't actually Japanese text BEFORE it ever touches the Vault or
        // the API — without this, keyboard-mashed garbage (no hiragana/katakana/kanji at all)
        // would silently get saved to the Vault and sent to Gemini, which then has no real
        // vocabulary to build sentences from and falls back to inventing unrelated real words
        // to satisfy the schema, rather than erroring out.
        const wordsEntered = vocab.split(/[\s\n]+/).filter(w => w.trim() !== '');
        const invalidWords = wordsEntered.filter(w => !JAPANESE_CHAR_REGEX.test(w));
        if (invalidWords.length > 0) {
            customAlert(`These don't look like Japanese words: ${invalidWords.join(', ')}. Please use kanji, hiragana, or katakana.`);
            return;
        }

        // Bridge Mode: capture eligible words BEFORE the vault below gets merged with the new
        // input, so this only ever contains words that were already learned, not the new ones.
        const bridgeWords = (bridgeModeEnabled && !btnBridgeToggle.disabled)
            ? getEligibleBridgeWords().sort(() => Math.random() - 0.5).slice(0, 5)
            : [];

        // Process and save to vault before transitioning
        const wordsToAdd = vocab.split(/[\s\n]+/).filter(w => w.trim() !== '');
        if (wordsToAdd.length > 0) {
            const vaultSet = new Set(vaultDeck);
            wordsToAdd.forEach(w => vaultSet.add(w));
            vaultDeck = Array.from(vaultSet);
            localStorage.setItem('tsumugi_vault', JSON.stringify(vaultDeck));
            renderVault();
        }

        isWeaving = true;
        switchState(stateInput, stateLoading);
        startLoadingMessages();

        // With RESPONSE_SCHEMA attached below, Gemini's structured-output mode guarantees the
        // JSON shape — so this prompt only needs to state the actual content rules, not describe
        // the JSON structure in prose anymore.
        const systemPrompt = "You are an ultra-strict Japanese sentence builder. The user will provide a list of words. ABSOLUTE RULE: YOU ARE STRICTLY FORBIDDEN FROM INTRODUCING ANY OUTSIDE NOUNS, VERBS, OR ADJECTIVES. You may ONLY use: 1. The EXACT words provided. 2. Grammatical particles (wa, ga, o, ni, de, to, mo, kara, etc.). 3. Standard copula forms (desu, da, arimasu, imasu). If sentences are short or simple, that is expected. Generate one blueprint per input word, exactly four example sentences titled Thread 01 through Thread 04 in order, and one short micro-story that combines the sentences. For every blueprint, classify its partOfSpeech; if it is a verb or i-adjective, also fill in a short polite-form conjugation table (present, presentNegative, past, pastNegative, teForm) — for every other part of speech, conjugations must be null. If an input word is not a real, recognizable Japanese word, do NOT substitute a different, unrelated real word in its place — instead use your best literal reading of exactly the characters given, and note the uncertainty in its mnemonic field.";

        const GENRE_TONE = {
            'slice-of-life': 'Keep the tone warm, ordinary, and grounded in everyday life.',
            'noir': 'Give the tone a noir/mystery edge — terse and moody — while staying strictly within the word constraints.',
            'fantasy': 'Give the tone a light fantasy/fairytale feel, evocative and a little magical, while staying strictly within the word constraints.',
            'comedy': 'Keep the tone light, silly, and a little absurd, while staying strictly within the word constraints.'
        };
        const selectedGenre = (genreSelect && genreSelect.value) || 'slice-of-life';
        let promptText = systemPrompt + " Tone: " + (GENRE_TONE[selectedGenre] || GENRE_TONE['slice-of-life']) + " Words: " + vocab;

        if (bridgeWords.length > 0) {
            promptText += " Bridge words the user already knows from past sessions — you may optionally weave a few of these into the sentences too if it makes them more natural, but you are not required to use all (or any) of them, and they must NOT appear in any sentence's 'xp' array (xp lists only the new input words above): " + bridgeWords.join(', ');
        }

        try {
            let response;
            try {
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            responseSchema: RESPONSE_SCHEMA
                        }
                    })
                });
            } catch (networkErr) {
                const err = new Error("Couldn't reach Gemini — check your internet connection and try again.");
                err.kind = 'network';
                throw err;
            }

            let data;
            try {
                data = await response.json();
            } catch (readErr) {
                const err = new Error("Gemini's response couldn't be read. Please try again.");
                err.kind = 'malformed';
                throw err;
            }

            if (!response.ok || data.error) {
                const apiStatus = (data.error && data.error.status) || '';
                const apiMessage = (data.error && data.error.message) || `Request failed with status ${response.status}.`;
                let userMessage;

                if (response.status === 400 && /api key/i.test(apiMessage)) {
                    userMessage = 'Your API key looks invalid. Double-check it in Settings.';
                } else if (response.status === 403) {
                    userMessage = 'That API key was rejected — check that it has Gemini API access enabled.';
                } else if (response.status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
                    userMessage = "You've hit Gemini's rate limit. Wait a moment and try again.";
                } else {
                    userMessage = `Gemini returned an error: ${apiMessage}`;
                }

                const err = new Error(userMessage);
                err.kind = 'api';
                throw err;
            }

            const candidate = data.candidates && data.candidates[0];
            const rawText = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

            if (!rawText) {
                const reason = candidate && candidate.finishReason;
                const err = new Error(
                    reason && reason !== 'STOP'
                        ? `Gemini couldn't finish this response (reason: ${reason}). Try different or fewer words.`
                        : "Gemini's response was empty. Please try again."
                );
                err.kind = 'malformed';
                throw err;
            }

            let parsedData;
            try {
                parsedData = JSON.parse(rawText.trim());
            } catch (jsonErr) {
                const err = new Error("Gemini's structured response didn't parse as JSON. Please try again.");
                err.kind = 'malformed';
                throw err;
            }

            // This is a real, live result — make sure any leftover "Example Preview" badge from
            // a previous demo view is hidden before rendering.
            stopLoadingMessages();
            demoBadge.classList.add('hidden');
            renderWeaveResult(parsedData);
            saveSessionCache(parsedData, false, bridgeWords);

            if (bridgeWordsNote) {
                if (bridgeWords.length > 0) {
                    bridgeWordsNote.textContent = `Bridge words offered this session: ${bridgeWords.join('、')}`;
                    bridgeWordsNote.classList.remove('hidden');
                } else {
                    bridgeWordsNote.classList.add('hidden');
                }
            }

            // Transition to Reading UI
            switchState(stateLoading, stateReading);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(playSuccessFlash, 450);

        } catch (error) {
            stopLoadingMessages();
            console.error(`Weave failed [${error.kind || 'unknown'}]:`, error);
            customAlert(error.message || 'Failed to weave context. Check your API key and try again.');
            switchState(stateLoading, stateInput);
        } finally {
            isWeaving = false;
        }
    });

    // Keyboard Shortcut: Cmd/Ctrl+Enter to Weave while composing in the textarea. Delegates to
    // the button's own click handler (and its disabled-state guard for the word limit) rather
    // than duplicating any validation logic here.
    vocabInput.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            btnWeave.click();
        }
    });

    // Keyboard Shortcuts: Escape closes whichever modal is currently open, and Left/Right
    // arrow keys step through the Blueprint carousel while the Reading Studio is visible.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!settingsModal.classList.contains('hidden')) {
                closeSettings();
            } else if (!confirmModal.classList.contains('hidden')) {
                closeConfirmModal();
            } else if (!onboardingModal.classList.contains('hidden')) {
                closeOnboarding();
            }
            return;
        }

        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (stateReading.classList.contains('hidden')) return;
        if (!settingsModal.classList.contains('hidden') || !confirmModal.classList.contains('hidden') || !onboardingModal.classList.contains('hidden')) return;

        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        if (globalBlueprints.length === 0) return;

        if (e.key === 'ArrowLeft') {
            btnBpPrev.click();
        } else {
            btnBpNext.click();
        }
    });

    // CSV Export — exports the current Blueprint set (readings, meaning, part of speech,
    // mnemonic) so people who already keep an SRS habit elsewhere (Anki or otherwise) can fold
    // Tsumugi's output into it. A UTF-8 BOM is prepended so Excel doesn't mangle the Japanese
    // text into mojibake, which plain UTF-8 CSVs are prone to without it.
    function exportBlueprintsToCSV() {
        if (!globalBlueprints || globalBlueprints.length === 0) {
            customAlert('Nothing to export yet — weave some words first.');
            return;
        }

        function csvEscape(value) {
            const str = String(value == null ? '' : value);
            return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        }

        const headers = ['Kanji', 'Hiragana', 'Katakana', 'Romaji', 'Meaning', 'Part of Speech', 'Mnemonic'];
        const rows = globalBlueprints.map(bp => [
            bp.kanji, bp.hiragana, bp.katakana, bp.romaji, bp.meaning,
            POS_LABELS[bp.partOfSpeech] || '', bp.mnemonic
        ].map(csvEscape).join(','));

        const csvContent = [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'tsumugi-vocab.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        customAlert('CSV downloaded!');
    }

    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', exportBlueprintsToCSV);
    }

    // Event Listener: Reset Session (Reading -> Input)
    btnReset.addEventListener('click', () => {
        // Stop any ongoing speech
        window.speechSynthesis.cancel();
        
        // Reset all revealed states before showing input again
        document.querySelectorAll('.translation-container').forEach(container => {
            container.classList.remove('revealed');
        });
        
        vocabInput.value = ''; 
        
        // Clear state memory
        globalBlueprints = [];
        currentBpIndex = 0;
        demoBadge.classList.add('hidden');
        if (bridgeWordsNote) bridgeWordsNote.classList.add('hidden');
        clearSessionCache();

        // Sync vault visually with empty textarea
        renderVault(); 

        switchState(stateReading, stateInput);
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
