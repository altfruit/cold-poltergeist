require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const configDirectory = path.join(__dirname, '..', 'data');
const configFile = path.join(configDirectory, 'guild-config.json');

function loadGuildConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load guild config:', error.message);
    return {};
  }
}

const guildConfigs = loadGuildConfig();

function getGuildConfig(guildId) {
  guildConfigs[guildId] ??= {
    channels: {},
    roles: { mod: [], supervisor: [], admin: [] },
    infractionRoleId: null,
    demotionRoleId: null,
  };
  return guildConfigs[guildId];
}

function saveGuildConfig() {
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(guildConfigs, null, 2)}\n`);
}

const requiredEnvironment = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const variable of requiredEnvironment) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks a member from the server.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to kick').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a member from the server.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to ban').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Times out a member.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to time out').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Timeout duration in minutes')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the timeout').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Deletes recent messages from this channel.')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
      ),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Opens the bot setup menu.'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Checks whether the bot is online.'),
].map((command) => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands.`);
}

function getMemberFromInteraction(interaction) {
  return interaction.options.getMember('user');
}

function canModerate(interaction, targetMember) {
  if (!targetMember) return 'That user is not a member of this server.';
  if (targetMember.id === interaction.user.id) return 'You cannot moderate yourself.';
  if (targetMember.id === interaction.client.user.id) return 'I cannot moderate myself.';
  if (!targetMember.moderatable) {
    return 'I cannot moderate that member. Check my role position and permissions.';
  }
  return null;
}

function hasConfiguredRole(member, roleIds) {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasStaffPermission(interaction, permission, roleType) {
  const config = getGuildConfig(interaction.guild.id);
  const configuredRoles = [...config.roles.mod, ...config.roles.supervisor, ...config.roles.admin];
  if (configuredRoles.length > 0) return hasConfiguredRole(interaction.member, config.roles[roleType]) || hasConfiguredRole(interaction.member, config.roles.supervisor) || hasConfiguredRole(interaction.member, config.roles.admin);
  return interaction.memberPermissions.has(permission);
}

function channelMention(guild, channelId) {
  return channelId ? `<#${channelId}>` : 'not set';
}

function setupStatus(config) {
  return [
    `Welcome: ${channelMention(null, config.channels.welcome)}`,
    `Logs: ${channelMention(null, config.channels.logs)}`,
    `Infractions: ${channelMention(null, config.channels.infractions)}`,
    `Demotions: ${channelMention(null, config.channels.demotions)}`,
    `Mod roles: ${config.roles.mod.map((roleId) => `<@&${roleId}>`).join(', ') || 'not set'}`,
    `Supervisor roles: ${config.roles.supervisor.map((roleId) => `<@&${roleId}>`).join(', ') || 'not set'}`,
    `Admin roles: ${config.roles.admin.map((roleId) => `<@&${roleId}>`).join(', ') || 'not set'}`,
    `Infraction role: ${config.infractionRoleId ? `<@&${config.infractionRoleId}>` : 'not set'}`,
    `Demotion role: ${config.demotionRoleId ? `<@&${config.demotionRoleId}>` : 'not set'}`,
  ].join('\n');
}

function setupPanel(config) {
  const embed = new EmbedBuilder()
    .setTitle('Bot Setup')
    .setDescription('Choose what you want to configure from the menu below.')
    .addFields({ name: 'Current configuration', value: setupStatus(config) })
    .setColor(0x5865f2);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup-menu')
    .setPlaceholder('Choose a setup option')
    .addOptions(
      { label: 'Welcome channel', value: 'welcome', description: 'Set the welcome message channel' },
      { label: 'Logs channel', value: 'logs', description: 'Set the moderation logs channel' },
      { label: 'Infractions channel', value: 'infractions', description: 'Set the infractions channel' },
      { label: 'Demotions channel', value: 'demotions', description: 'Set the demotions channel' },
      { label: 'Moderator role', value: 'mod-role', description: 'Add or remove a moderator role' },
      { label: 'Supervisor role', value: 'supervisor-role', description: 'Add or remove a supervisor role' },
      { label: 'Admin role', value: 'admin-role', description: 'Add or remove an admin role' },
      { label: 'Infraction role', value: 'infraction-role', description: 'Set the infraction role' },
      { label: 'Demotion role', value: 'demotion-role', description: 'Set the demotion role' },
      { label: 'Refresh status', value: 'status', description: 'Refresh this configuration panel' },
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true };
}

function hasSetupPermission(interaction, config) {
  return interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
    || hasConfiguredRole(interaction.member, config.roles.admin);
}

async function handleSetup(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  if (!hasSetupPermission(interaction, config)) {
    await interaction.reply({ content: 'Only server administrators can use /setup.', ephemeral: true });
    return;
  }
  await interaction.reply(setupPanel(config));
}

function parseId(value, prefix) {
  const match = value.trim().match(new RegExp(`^<?${prefix}?(\\d+)>?$`));
  return match ? match[1] : null;
}

async function handleSetupModal(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  if (!hasSetupPermission(interaction, config)) {
    await interaction.reply({ content: 'Only server administrators can use /setup.', ephemeral: true });
    return;
  }

  const setupKey = interaction.customId.replace('setup-modal:', '');
  const value = interaction.fields.getTextInputValue('setup-value');
  if (['welcome', 'logs', 'infractions', 'demotions'].includes(setupKey)) {
    const channelId = parseId(value, '#');
    const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Please enter a valid text-channel mention or channel ID.', ephemeral: true });
      return;
    }
    config.channels[setupKey] = channel.id;
    saveGuildConfig();
    await interaction.reply({ content: `${channel} is now the ${setupKey} channel.`, ephemeral: true });
    return;
  }

  const roleId = parseId(value, '@&');
  const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
  if (!role) {
    await interaction.reply({ content: 'Please enter a valid role mention or role ID.', ephemeral: true });
    return;
  }
  if (['infraction-role', 'demotion-role'].includes(setupKey)) {
    config[`${setupKey}Id`] = role.id;
    saveGuildConfig();
    await interaction.reply({ content: `${role} is now the ${setupKey}.`, ephemeral: true });
    return;
  }

  const action = interaction.fields.getTextInputValue('setup-action').trim().toLowerCase();
  const roleType = setupKey.replace('-role', '');
  if (!['add', 'remove'].includes(action) || !config.roles[roleType]) {
    await interaction.reply({ content: 'For staff roles, action must be exactly `add` or `remove`.', ephemeral: true });
    return;
  }
  if (action === 'add' && !config.roles[roleType].includes(role.id)) config.roles[roleType].push(role.id);
  if (action === 'remove') config.roles[roleType] = config.roles[roleType].filter((roleId) => roleId !== role.id);
  saveGuildConfig();
  await interaction.reply({ content: `${role} ${action === 'add' ? 'added to' : 'removed from'} ${roleType} roles.`, ephemeral: true });
}

client.once('ready', (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  const channelId = getGuildConfig(member.guild.id).channels.welcome;
  const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
  if (!channel || !channel.isTextBased()) return;

  const message = `Hey welcome to ${member.guild.name}, we warmly welcome you as our ${member.guild.memberCount}th member and if you got any open questions feel free to ask staff.`;
  await channel.send({ content: `${member}, ${message}` }).catch((error) => {
    console.error('Could not send welcome message:', error.message);
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const normalized = message.content.trim().toLowerCase().replace(/[?!.,]/g, '');
  if (normalized !== 'can i speak with mariah') return;

  const config = getGuildConfig(message.guild.id);
  const adminPings = config.roles.admin.map((roleId) => `<@&${roleId}>`);
  const supervisorPings = config.roles.supervisor.map((roleId) => `<@&${roleId}>`);
  const mentions = [...new Set([...adminPings, ...supervisorPings])];
  const response = 'Hey there unfortunately mariah doesnt really go into personal requests. Please detail what exactly you want from here and what the reason is.';
  await message.channel.send({
    content: `${mentions.join(' ')} ${response}`.trim(),
    allowedMentions: { roles: [...config.roles.admin, ...config.roles.supervisor] },
  });
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'setup-menu') {
      const config = getGuildConfig(interaction.guild.id);
      if (!hasSetupPermission(interaction, config)) {
        await interaction.reply({ content: 'Only server administrators can use /setup.', ephemeral: true });
        return;
      }
      const setupKey = interaction.values[0];
      if (setupKey === 'status') {
        const panel = setupPanel(config);
        delete panel.ephemeral;
        await interaction.update(panel);
        return;
      }

      const isChannel = ['welcome', 'logs', 'infractions', 'demotions'].includes(setupKey);
      const modal = new ModalBuilder()
        .setCustomId(`setup-modal:${setupKey}`)
        .setTitle(`Setup: ${setupKey}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('setup-value')
              .setLabel(isChannel ? 'Channel mention or ID' : 'Role mention or ID')
              .setPlaceholder(isChannel ? '#welcome or 123456789' : '@Moderators or 123456789')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      if (!isChannel && ['mod-role', 'supervisor-role', 'admin-role'].includes(setupKey)) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('setup-action')
              .setLabel('Action: add or remove')
              .setPlaceholder('add')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      }
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('setup-modal:')) {
      await handleSetupModal(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') {
      await interaction.reply(`Pong! ${interaction.client.ws.ping}ms`);
      return;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'setup') {
      await handleSetup(interaction);
      return;
    }

    if (interaction.commandName === 'clear') {
      if (!hasStaffPermission(interaction, PermissionFlagsBits.ManageMessages, 'mod')) {
        await interaction.reply({ content: 'You do not have a configured moderator role.', ephemeral: true });
        return;
      }
      const amount = interaction.options.getInteger('amount', true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `Deleted ${deleted.size} message(s).`, ephemeral: true });
      return;
    }

    const requiredRoleType = interaction.commandName === 'timeout' ? 'mod' : interaction.commandName === 'kick' ? 'supervisor' : 'admin';
    const requiredPermission = interaction.commandName === 'timeout'
      ? PermissionFlagsBits.ModerateMembers
      : interaction.commandName === 'kick'
        ? PermissionFlagsBits.KickMembers
        : PermissionFlagsBits.BanMembers;
    if (!hasStaffPermission(interaction, requiredPermission, requiredRoleType)) {
      await interaction.reply({ content: 'You do not have the configured role for this action.', ephemeral: true });
      return;
    }

    const targetMember = getMemberFromInteraction(interaction);
    const moderationError = canModerate(interaction, targetMember);
    if (moderationError) {
      await interaction.reply({ content: moderationError, ephemeral: true });
      return;
    }

    const reason = interaction.options.getString('reason') || `Action by ${interaction.user.tag}`;

    if (interaction.commandName === 'kick') {
      await targetMember.kick(reason);
      await interaction.reply(`${targetMember.user.tag} was kicked. Reason: ${reason}`);
    } else if (interaction.commandName === 'ban') {
      await targetMember.ban({ reason });
      await interaction.reply(`${targetMember.user.tag} was banned. Reason: ${reason}`);
    } else if (interaction.commandName === 'timeout') {
      const minutes = interaction.options.getInteger('minutes', true);
      await targetMember.timeout(minutes * 60 * 1000, reason);
      await interaction.reply(`${targetMember.user.tag} was timed out for ${minutes} minute(s). Reason: ${reason}`);
    }
  } catch (error) {
    console.error('Interaction failed:', error);
    const response = { content: 'The action could not be completed. Check my permissions and role hierarchy.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(response);
    else await interaction.reply(response);
  }
});

registerCommands()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch((error) => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  });
