const boxCommand = require('../commands/box.js');
const fs = require('fs');
const path = require('path');

// fake interaction because i don't have a real discord client here
function createMockInteraction(optionsType, optionsData) {
    return {
        commandName: 'box',
        options: {
            getFocused: (full) => optionsData.focused,
            getString: (name) => optionsData[name]
        },
        respond: async (choices) => {
            console.log(`[autocomplete] choices:`);
            console.log(choices);
        },
        deferReply: async () => console.log('[execute] deferred'),
        editReply: async (data) => console.log('[execute] edited:', data),
        reply: async (data) => console.log('[execute] replied:', data)
    };
}

(async () => {
    console.log('setting up mock data...');
    const realDataPath = path.join(__dirname, '../data/characters.json');
    const mockDataPath = path.join(__dirname, '../data/mock_characters.json');

    // renaming files because i can't be bothered to pass a path to the command
    if (fs.existsSync(realDataPath)) fs.renameSync(realDataPath, realDataPath + '.bak');
    fs.copyFileSync(mockDataPath, realDataPath);

    // nuking the cache. horrible.
    delete require.cache[require.resolve('../commands/box.js')];
    const boxCmd = require('../commands/box.js');

    console.log('\ntest 1: autocomplete characters');
    await boxCmd.autocomplete(createMockInteraction('autocomplete', {
        focused: { name: 'character', value: 'san' }
    }));

    console.log('\ntest 2: autocomplete expressions');
    await boxCmd.autocomplete(createMockInteraction('autocomplete', {
        focused: { name: 'expression', value: 'wi' },
        character: 'undertale-sans'
    }));

    console.log('\ntest 3: execution');
    await boxCmd.execute(createMockInteraction('execute', {
        character: 'undertale-sans',
        text: 'heya.',
        expression: 'wink'
    }));

    // cleanup. if this fails, the project is broken.
    if (fs.existsSync(realDataPath + '.bak')) {
        fs.unlinkSync(realDataPath);
        fs.renameSync(realDataPath + '.bak', realDataPath);
    } else {
        fs.unlinkSync(realDataPath);
    }

})();
