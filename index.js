const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
// why is the commands folder missing? i'll just make it myself.
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] command at ${filePath} is broken. typical.`);
    }
}

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`i can't find ${interaction.commandName}. great.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'something broke. i hate this.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'error executing this. of course.', ephemeral: true });
            }
        }
    } else if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`missing autocomplete for ${interaction.commandName}. wonderful.`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
    } else if (interaction.isButton()) {
        // buttons are a mess. i'll just split the id and hope for the best.
        const [commandName] = interaction.customId.split('_');
        const command = interaction.client.commands.get(commandName);
        if (command && command.handleButton) {
            try {
                await command.handleButton(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'button handling failed. i am so tired.', ephemeral: true });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

// koyeb wants a web server or it'll kill the bot. fine.
const port = process.env.PORT || 8000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
}).listen(port, () => {
    console.log(`health check server is running on port ${port}. leave me alone.`);
});
