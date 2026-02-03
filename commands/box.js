const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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
            const modal = new ModalBuilder()
                .setCustomId('box_modal_text')
                .setTitle('Edit Dialogue');

            const textInput = new TextInputBuilder()
                .setCustomId('text_input')
                .setLabel('New Text')
                .setStyle(TextInputStyle.Paragraph);

            // trying to save the char/expr. difficult since it's baked into the url.

            const row = new ActionRowBuilder().addComponents(textInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } else if (interaction.customId === 'box_expression') {
            const firstAttachment = interaction.message.attachments.first();
            let charId = 'undertale-sans';

            if (firstAttachment && firstAttachment.url) {
                try {
                    const url = new URL(firstAttachment.url);
                    charId = url.searchParams.get('character') || charId;
                } catch (e) {
                    // whatever
                }
            }

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
            const attachments = interaction.message.attachments;
            const files = [];

            // iterate over existing attachments to preserve text chunks
            attachments.each(attachment => {
                if (attachment.url) {
                    try {
                        const url = new URL(attachment.url);
                        // update expression param
                        url.searchParams.set('expression', selectedExpr);
                        files.push(url.toString());
                    } catch (e) {
                        console.error('failed to parse url during update. ugh.', e);
                    }
                }
            });

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

            await interaction.update({ content: '', files: files, components: [row] });
        }
    },

    async handleModal(interaction) {
        if (interaction.customId === 'box_modal_text') {
            await interaction.deferUpdate(); // acknowledge the modal (update the message)

            const newText = interaction.fields.getTextInputValue('text_input');

            // need to rescue params from the url.
            // however! the interaction's message object has the attachments.
            // checking the first attachment url might work.

            const firstAttachment = interaction.message.attachments.first();
            let charId = 'undertale-sans'; // fallback
            let expression = 'default';

            if (firstAttachment && firstAttachment.url) {
                try {
                    const url = new URL(firstAttachment.url);
                    charId = url.searchParams.get('character') || charId;
                    expression = url.searchParams.get('expression') || expression;
                } catch (e) {
                    console.error('failed to parse url from previous message. whatever.', e);
                }
            }

            await updateBoxMessage(interaction, charId, expression, newText);
        }
    }
};

async function updateBoxMessage(interaction, charId, expression, text) {
    const chunks = splitText(text);
    const files = [];

    for (const chunk of chunks) {
        files.push(generateUrl(charId, expression, chunk));
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

    await interaction.editReply({ content: '', files: files, components: [row] });
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
