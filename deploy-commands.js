const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
    console.error('commands are gone. why am i even here?');
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] ${file} is broken. i'm not even surprised.`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`uploading ${commands.length} commands...`);

        // fast route if guild id exists, otherwise global (takes an hour, slow as hell)
        const route = process.env.GUILD_ID
            ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            : Routes.applicationCommands(process.env.CLIENT_ID);

        const data = await rest.put(
            route,
            { body: commands },
        );

        console.log(`did it. loaded ${data.length} commands.`);
    } catch (error) {
        console.error('failed to upload commands. i hate my life.');
        console.error(error);
    }
})();
