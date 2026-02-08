const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// cached because scraping takes years
let charData = {};
const DATA_PATH = path.join(__dirname, '../data/characters.json');

function loadData() {
    if (fs.existsSync(DATA_PATH)) {
        try {
            const raw = fs.readFileSync(DATA_PATH);
            const rawData = JSON.parse(raw);

            // filter out the garbage ones
            for (const id in rawData) {
                if (rawData[id].shown_textbox !== false) {
                    charData[id] = rawData[id];
                }
            }

            console.log(`Loaded ${Object.keys(charData).length} characters. (Filtered out the broken ones)`);
        } catch (e) {
            console.error('failed to parse data. great.', e);
        }
    } else {
        console.warn('no character data. run the scraper or something.');
    }
}

loadData();

// reload every 5 mins. probably unnecessary.
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
            // discord limits this to 25. annoying.
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

        await updateBoxMessage(interaction, charId, expression, text);
    },

    async handleButton(interaction) {
        if (interaction.customId === 'box_edittext') {
            const { text } = getParamsFromMessage(interaction.message);

            const modal = new ModalBuilder()
                .setCustomId('box_modal_text')
                .setTitle('Edit Dialogue');

            const textInput = new TextInputBuilder()
                .setCustomId('text_input')
                .setLabel('New Text')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(text.substring(0, 4000));

            const row = new ActionRowBuilder().addComponents(textInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } else if (interaction.customId === 'box_expression') {
            const { charId } = getParamsFromMessage(interaction.message);
            const char = charData[charId];

            if (!char || !char.sprites || !char.sprites.textbox) {
                await interaction.reply({ content: 'no expressions found for this character. tragic.', ephemeral: true });
                return;
            }

            const expressions = Object.keys(char.sprites.textbox);
            const options = expressions.slice(0, 25).map(expr => {
                const sprite = char.sprites.textbox[expr];
                const label = sprite.name || expr;
                return new StringSelectMenuOptionBuilder()
                    .setLabel(label.substring(0, 100))
                    .setValue(expr);
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('box_selectexpr')
                .setPlaceholder('Select an expression...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            await interaction.update({ components: [row] });
        }
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId === 'box_selectexpr') {
            const selectedExpr = interaction.values[0];
            const newEmbeds = [];

            // Helper to process a URL string
            const processUrl = (urlString) => {
                try {
                    const url = new URL(urlString);
                    url.searchParams.set('expression', selectedExpr);
                    return new EmbedBuilder().setImage(url.toString());
                } catch (e) {
                    console.error('bad url in select menu update', e);
                    return null;
                }
            };

            // Check Embeds first
            if (interaction.message.embeds.length > 0) {
                interaction.message.embeds.forEach(embed => {
                    if (embed.image && embed.image.url) {
                        const e = processUrl(embed.image.url);
                        if (e) newEmbeds.push(e);
                    }
                });
            }
            // Fallback to Attachments (migration path)
            else if (interaction.message.attachments.size > 0) {
                interaction.message.attachments.each(att => {
                    if (att.url) {
                        const e = processUrl(att.url);
                        if (e) newEmbeds.push(e);
                    }
                });
            }

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

            await interaction.update({ content: '', embeds: newEmbeds, files: [], components: [row] });
        }
    },

    async handleModal(interaction) {
        if (interaction.customId === 'box_modal_text') {
            await interaction.deferUpdate();

            const newText = interaction.fields.getTextInputValue('text_input');
            const { charId, expression } = getParamsFromMessage(interaction.message);

            await updateBoxMessage(interaction, charId, expression, newText);
        }
    }
};

function getParamsFromMessage(message) {
    let charId = 'undertale-sans';
    let expression = 'default';
    let text = '';

    // try embeds first
    if (message.embeds.length > 0 && message.embeds[0].image && message.embeds[0].image.url) {
        try {
            const url = new URL(message.embeds[0].image.url);
            charId = url.searchParams.get('character') || charId;
            expression = url.searchParams.get('expression') || expression;
            // join text from all embeds if possible, or just first? logic implies splitting.
            // reconstructing full text from chunks is hard if we don't delimiter it.
            // but usually we just want the first chunk's params.
            // Text prefill is nice-to-have.
            const texts = message.embeds.map(e => {
                try {
                    return new URL(e.image.url).searchParams.get('text');
                } catch (e) { return ''; }
            });
            text = texts.join(' ');
        } catch (e) { console.error('failed parsing embed url', e); }
    }
    // try attachments (legacy)
    else if (message.attachments.size > 0) {
        const first = message.attachments.first();
        if (first.url) {
            try {
                const url = new URL(first.url);
                charId = url.searchParams.get('character') || charId;
                expression = url.searchParams.get('expression') || expression;
                const texts = message.attachments.map(a => {
                    try {
                        return new URL(a.url).searchParams.get('text');
                    } catch (e) { return ''; }
                });
                text = texts.join(' ');
            } catch (e) { console.error('failed parsing attachment url', e); }
        }
    }

    return { charId, expression, text };
}

async function updateBoxMessage(interaction, charId, expression, text) {
    const chunks = splitText(text);
    const embeds = [];

    for (const chunk of chunks) {
        embeds.push(new EmbedBuilder().setImage(generateUrl(charId, expression, chunk)));
    }

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

    // modal update or initial command. editReply handles both.
    // clear files to avoid clutter if switching from file based
    await interaction.editReply({ content: '', embeds: embeds, files: [], components: [row] });
}

function splitText(text, limit = 69) {
    if (!text) return ['...'];
    if (text.length <= limit) return [text];

    const chunks = [];
    let currentChunk = '';
    const words = text.split(' ');

    for (const word of words) {
        if ((currentChunk + word).length + 1 > limit) {
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }

            if (word.length > limit) {
                let remaining = word;
                while (remaining.length > 0) {
                    if (remaining.length > limit) {
                        chunks.push(remaining.substring(0, limit));
                        remaining = remaining.substring(limit);
                    } else {
                        currentChunk = remaining + ' ';
                        remaining = '';
                    }
                }
            } else {
                currentChunk += word + ' ';
            }
        } else {
            currentChunk += word + ' ';
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function generateUrl(charId, expression, text) {
    // append params and pray.
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
