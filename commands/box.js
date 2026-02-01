const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// cached data because scraping is slow
let charData = {};
const DATA_PATH = path.join(__dirname, '../data/characters.json');

function loadData() {
    if (fs.existsSync(DATA_PATH)) {
        try {
            const raw = fs.readFileSync(DATA_PATH);
            charData = JSON.parse(raw);
            console.log(`Loaded ${Object.keys(charData).length} characters.`);
        } catch (e) {
            console.error('failed to parse data. great.', e);
        }
    } else {
        console.warn('no character data. run the scraper or something.');
    }
}

loadData();

// reload every 5 mins. overkill but whatever.
setInterval(loadData, 5 * 60 * 1000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('box')
        .setDescription('Generate an Undertale/Deltarune text box')
        .addStringOption(option =>
            option.setName('character')
                .setDescription('The character to speak')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The dialogue text')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('expression')
                .setDescription('The facial expression')
                .setRequired(false)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const choices = [];

        if (focusedOption.name === 'character') {
            const query = focusedOption.value.toLowerCase();
            // limit to 25 because discord says so
            let count = 0;
            for (const id in charData) {
                const char = charData[id];
                if (char.name.toLowerCase().includes(query) || id.includes(query)) {
                    const universe = char.universe ? char.universe.charAt(0).toUpperCase() + char.universe.slice(1) : 'Unknown';
                    choices.push({ name: `${char.name} (${universe})`, value: id });
                    count++;
                    if (count >= 25) break;
                }
            }
        } else if (focusedOption.name === 'expression') {
            const charId = interaction.options.getString('character');
            if (charId && charData[charId] && charData[charId].sprites) {
                const query = focusedOption.value.toLowerCase();
                const sprites = charData[charId].sprites.textbox || {};

                let count = 0;
                for (const key in sprites) {
                    const sprite = sprites[key];
                    if (key.includes(query) || (sprite.name && sprite.name.toLowerCase().includes(query))) {
                        choices.push({ name: sprite.name || key, value: key });
                        count++;
                        if (count >= 25) break;
                    }
                }
            }
        }

        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();

        const charId = interaction.options.getString('character');
        const text = interaction.options.getString('text');
        const expression = interaction.options.getString('expression') || 'default';

        const imageUrl = generateUrl(charId, expression, text);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('box_edittext')
                    .setLabel('Edit Text')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✏️'),
                new ButtonBuilder()
                    .setCustomId('box_expression')
                    .setLabel('Expression')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎭')
            );

        await interaction.editReply({ files: [imageUrl], components: [row] });
    },

    async handleButton(interaction) {
        if (interaction.customId === 'box_edittext') {
            const modal = new ModalBuilder()
                .setCustomId('box_modal_text')
                .setTitle('Edit Dialogue');

            const textInput = new TextInputBuilder()
                .setCustomId('text_input')
                .setLabel('New Text')
                .setStyle(TextInputStyle.Paragraph);

            const row = new ActionRowBuilder().addComponents(textInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } else if (interaction.customId === 'box_expression') {
            await interaction.reply({ content: 'expression editor is not finished. stop asking.', ephemeral: true });
        }
    }
};

function generateUrl(charId, expression, text) {
    // i'm just sticking params onto the url and praying.
    const char = charData[charId];
    let box = 'undertale';

    if (char && char.universe === 'deltarune') {
        box = 'deltarune';
    }

    const params = new URLSearchParams();
    params.append('text', text);
    params.append('character', charId);
    params.append('expression', expression);
    params.append('box', box);

    const url = `https://www.demirramon.com/gen/undertale_text_box.png?${params.toString()}`;
    console.log(`[box] generated url: ${url}`);
    return url;
}
