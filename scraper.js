const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = 'https://www.demirramon.com';
const GENERATOR_URL = `${BASE_URL}/generators/undertale_text_box_generator`;
const DATA_DIR = path.join(__dirname, 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

// fake user agent because websites hate bots
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function scrape() {
    console.log('starting scraper... try not to crash this time.');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('ERROR:', err.toString()));
    page.on('requestfailed', request => console.log(`FAIL: ${request.failure().errorText} ${request.url()}`));

    console.log(`going to ${GENERATOR_URL}...`);
    await page.goto(GENERATOR_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    try {
        console.log('waiting for scripts to settle... this takes forever.');
        await new Promise(r => setTimeout(r, 10000));

        console.log('checking for the list...');
        await page.waitForSelector('#tb_character_list', { timeout: 60000 });

        console.log('selecting category... i hope "undertale" still works.');
        await page.select('#tb_universe_group_list', 'undertale');

        await page.waitForFunction(() => typeof UndertaleTextBoxGenerator !== 'undefined', { timeout: 60000 });
    } catch (e) {
        console.warn('timeout. dumping the page to see what went wrong.', e.message);
        const content = await page.content();
        fs.writeFileSync(path.join(DATA_DIR, 'debug_page.html'), content);
    }

    console.log('digging through universes...');
    const allUniverses = await page.evaluate(async () => {
        const utbg = UndertaleTextBoxGenerator;
        const groups = Object.keys(utbg.universe_groups);
        const discoveredUniverses = {};

        const groupList = document.querySelector('#tb_universe_group_list');

        for (const group of groups) {
            console.log(`eval: group ${group}`);
            groupList.value = group;
            groupList.dispatchEvent(new Event('change'));

            await new Promise(r => setTimeout(r, 500));

            Object.assign(discoveredUniverses, utbg.universes);
        }
        return discoveredUniverses;
    });

    const universeIds = Object.keys(allUniverses);
    console.log(`found ${universeIds.length} universes. more work for me.`);

    const allCharacters = {};
    const BATCH_SIZE = 10;

    for (let i = 0; i < universeIds.length; i += BATCH_SIZE) {
        const batch = universeIds.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (id) => {
            const universeName = allUniverses[id].name || id;
            console.log(`fetching chars for: ${universeName}...`);

            try {
                // api prepends php garbage. have to clean it.
                const ajaxUrl = `${BASE_URL}/ajax/undertale/content/characters?universe=${id}&universes=${id}`;
                const res = await axios.get(ajaxUrl, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    responseType: 'text'
                });

                const rawText = res.data;
                const jsonStart = rawText.indexOf('{');
                if (jsonStart === -1) {
                    console.error(`-> no json for ${universeName}`);
                    return;
                }

                const json = JSON.parse(rawText.substring(jsonStart));
                if (json && json.data) {
                    const chars = json.data;
                    const count = Object.keys(chars).length;
                    console.log(`-> got ${count} raw chars for ${universeName}`);

                    let kept = 0;
                    for (const [id, char] of Object.entries(chars)) {
                        // filter out broken characters. waste of space.
                        if (char.sprites && char.sprites.textbox && Object.keys(char.sprites.textbox).length > 0) {
                            allCharacters[id] = char;
                            kept++;
                        }
                    }
                    console.log(`-> kept ${kept} valid chars`);
                }
            } catch (err) {
                console.error(`-> ${universeName} failed: ${err.message}`);
            }
        });

        await Promise.all(promises);
        await new Promise(r => setTimeout(r, 200));
    }

    const totalChars = Object.keys(allCharacters).length;
    console.log(`done. ${totalChars} characters. i'm going to sleep.`);

    fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(allCharacters, null, 2));
}

scrape().catch(err => {
    console.error(err);
    process.exit(1);
});
