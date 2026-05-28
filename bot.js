import http from 'http';
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';

import 'dotenv/config';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('EMO bot is alive!');
}).listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_IDS = CHANNEL_ID ? CHANNEL_ID.split(',').map(id => id.trim()).filter(Boolean) : [];

let lastCheckIn = null;
//let copyState = { active: false, targetUserId: null, channelId: null };

function scheduleHourlyCheckIn() {
  if (CHANNEL_IDS.length === 0) {
    console.warn('CHANNEL_ID not set — hourly check-in disabled.');
    return;
  }

  let lastFiredHour = -1;

  setInterval(() => {
    const now = new Date();
    if (now.getMinutes() === 0 && now.getHours() !== lastFiredHour) {
      lastFiredHour = now.getHours();
      doCheckIn();
    }
  }, 30_000);

  const now = new Date();
  const msUntilNextHour =
    ((60 - now.getMinutes()) % 60) * 60_000
    - now.getSeconds() * 1000
    - now.getMilliseconds();
  console.log(`Next check-in in ${Math.round(msUntilNextHour / 1000)}s (channels: ${CHANNEL_IDS.join(', ')})`);
}

function doCheckIn() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  lastCheckIn = `${hh}${mm}`;

  console.log(`Check-in at ${lastCheckIn}`);

  for (const id of CHANNEL_IDS) {
    const channel = client.channels.cache.get(id);
    if (!channel) {
      console.warn(`Channel ${id} not found in cache.`);
      continue;
    }
    channel.send("Ding Dong, Check-In Time! I'm still awake and alive!").catch(err => {
      console.error(`Failed to send check-in to ${id}:`, err);
    });
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  scheduleHourlyCheckIn();
});

const fail = async (interaction) => {
  try {
    await interaction.reply('Failed to comply.');
  } catch (_) {}
};

const handledInteractions = new Set();
function dedup(interaction) {
  if (handledInteractions.has(interaction.id)) return false;
  handledInteractions.add(interaction.id);
  setTimeout(() => handledInteractions.delete(interaction.id), 60_000);
  return true;
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!dedup(interaction)) return;

  try {
    if (interaction.commandName === 'call') {
      await interaction.reply("Ye? I'm here! Press '/' for commands.");
    }

    else if (interaction.commandName === 'log') {
      if (!lastCheckIn) {
        await interaction.reply('No check-in has happened yet since the bot started.');
      } else {
        await interaction.reply(`Last check-in time: ${lastCheckIn}`);
      }
    }

    else if (interaction.commandName === 'calc') {
      const a = interaction.options.getNumber('value1');
      const op = interaction.options.getString('operator');
      const b = interaction.options.getNumber('value2');

      const opNames = {
        '+':  'plus',
        '-':  'minus',
        '*':  'times',
        '/':  'divided by',
        '**': 'power',
        '%':  'modulo'
      };

      let result;
      switch (op) {
        case '+':  result = a + b; break;
        case '-':  result = a - b; break;
        case '*':  result = a * b; break;
        case '/':
          if (b === 0) return fail(interaction);
          result = a / b;
          break;
        case '**': result = a ** b; break;
        case '%':
          if (b === 0) return fail(interaction);
          result = a % b;
          break;
        default:
          return fail(interaction);
      }

      await interaction.reply(`${a} ${opNames[op]} ${b} = **${result}**`);
    }

    // else if (interaction.commandName === 'copy') {
    //   const allowedRoles = ['1509021918676647936', '1509022841423794326'];
    //   const memberRoles = interaction.member?.roles?.cache;
    //   const hasRole = memberRoles && allowedRoles.some(id => memberRoles.has(id));

    //   if (!hasRole) {
    //     await interaction.reply({ content: 'Failed to comply.', ephemeral: true });
    //     return;
    //   }

    //   const targetUser = interaction.options.getUser('target');

    //   copyState = {
    //     active: true,
    //     targetUserId: targetUser?.id || null,
    //     channelId: interaction.channelId
    //   };

    //   const replyText = targetUser
    //     ? `${targetUser.username || targetUser.id} message will be repeated.`
    //     : 'Next message will be repeated.';

    //   await interaction.reply({ content: replyText, ephemeral: true });
    // }

    else if (interaction.commandName === 'admin') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'reply') {
        const value = interaction.options.getString('value');
        if (!value) return fail(interaction);
        await interaction.reply(value);
      }
    }

  } catch (err) {
    console.error(`Command error [${interaction.commandName}]:`, err);
    await fail(interaction);
  }
});

// client.on(Events.MessageCreate, async message => {
//   if (!copyState.active) return;
//   if (message.author.bot) return;
//   if (message.channelId !== copyState.channelId) return;
//   if (copyState.targetUserId && message.author.id !== copyState.targetUserId) return;
//   if (!message.content) return;

//   copyState.active = false;
//   await message.channel.send(message.content);
// });

const commands = [
  new SlashCommandBuilder()
    .setName('call')
    .setDescription('Check if the bot is alive'),
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Show the last hourly check-in time'),
  new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Perform arithmetic on two numbers')
    .addNumberOption(opt =>
      opt.setName('value1').setDescription('First number').setRequired(true))
    .addStringOption(opt =>
      opt.setName('operator').setDescription('Operator: +, -, *, /, **, %').setRequired(true)
        .addChoices(
          { name: '+  (add)',      value: '+' },
          { name: '-  (subtract)', value: '-' },
          { name: '*  (multiply)', value: '*' },
          { name: '/  (divide)',   value: '/' },
          { name: '** (power)',    value: '**' },
          { name: '%  (modulo)',   value: '%' }
        ))
    .addNumberOption(opt =>
      opt.setName('value2').setDescription('Second number').setRequired(true)),
  // new SlashCommandBuilder()
  //   .setName('copy')
  //   .setDescription('Repost a message from the channel (role-restricted)')
  //   .addUserOption(opt =>
  //     opt.setName('target').setDescription('Only copy from this user (default: any)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin utility commands')
    .addSubcommand(sub =>
      sub.setName('reply').setDescription('Send a message in the channel')
        .addStringOption(opt =>
          opt.setName('value').setDescription('The message to send').setRequired(false))),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  client.login(TOKEN);
  console.log('EMO bot is alive!');
})();
