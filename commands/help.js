const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// i'm only writing this because people can't read a readme.
// why do i have to explain how buttons work? it's 2026.

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help using the Undertale Box Bot'),

    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Undertale Box Bot Help')
            .setDescription('Generating text boxes because apparently typing is too hard for some people.')
            .setColor('#ffffff')
            .addFields(
                { name: 'Basic Usage: `/box`', value: 'Use `/box character: <name> text: <dialogue>` to generate a text box. It is not that complicated.' },
                { name: 'Autocomplete', value: 'The `character` and `expression` fields have autocomplete. Use them. It saves you from typos I have to handle.' },
                { name: 'Expressions', value: 'Most characters have multiple expressions. If you don\'t pick one, you get "default". Boring, but functional.' },
                { name: 'Interactive Editing', value: 'Once a box is generated, use the buttons to edit the text or change expressions without retyping the whole command. Efficiency, I guess.' },
                { name: 'Long Text', value: 'If your text is too long, the bot will split it into multiple boxes automatically. Don\'t write a novel, please.' },
                { name: 'AUs (Alternate Universes)', value: 'The bot includes characters from various AUs. The universe is shown in parentheses during autocomplete.' }
            )
            .setFooter({ text: 'just use the commands. please.' });

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    },
};
