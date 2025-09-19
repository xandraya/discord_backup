import { parseArgs, CLIENT_HTTP, CLIENT_PG, bootup, teardown } from './services';

import type { DiscordAttachment, DiscordChannel, DiscordMessage, DiscordAccount, DiscordGuild } from './types';
import { mkdirSync, writeFileSync } from 'fs';

require('dotenv').config();

const colors = Object.freeze({
	red: '\x1b[0;31m%s\x1b[0m',
	green: '\x1b[0;32m%s\x1b[0m',
	yellow: '\x1b[0;33m%s\x1b[0m',
	blue: '\x1b[0;34m%s\x1b[0m',
	magenta: '\x1b[0;35m%s\x1b[0m',
	cyan: '\x1b[0;36m%s\x1b[0m'
});

const PUSHED_USERS: string[] = [];
let CHANNEL: DiscordChannel;
let GUILD: DiscordGuild;

export async function fetchMetadata(type: 'users' | 'channels' | 'guilds', ID: string): Promise<DiscordAccount | DiscordChannel | DiscordGuild> {
  const reqOpts = {
    host: 'discord.com',
    path: `/api/v10/${type}/${ID}${type === 'guilds' ? '/roles' : ''}`,
    method: 'GET',
    headers: {
      'Authorization': process.env.TOKEN
    },
    timeout: process.env.TIMEOUT || 500,
  }

  let data = '';
  const cb = (chunk: Buffer) => data += chunk;
  await CLIENT_HTTP.request(reqOpts, cb);

  if (type !== 'guilds')
    return JSON.parse(data);
  else {
    let guild = { id: ID };
    guild = Object.assign(guild, { roles: JSON.parse(data) });
    
    reqOpts.path = `/api/v10/guilds/${ID}/channels`;

    data = '';
    await CLIENT_HTTP.request(reqOpts, cb);
    guild = Object.assign(guild, { channels: JSON.parse(data) });
    
    return guild as DiscordGuild;
  }
}

export async function* fetchMessages(channelID: string, opts: { lastMessageId?: string, limit?: number}): AsyncGenerator<DiscordMessage[]> {
  while (true) {
    {
      const query = opts.lastMessageId ? `?before=${opts.lastMessageId}&limit=${opts.limit || 100}` : `?limit=${opts.limit || 100}`;
      const reqOpts = {
        host: 'discord.com',
        path: `/api/v10/channels/${channelID}/messages${query}`,
        method: 'GET',
        headers: {
          'Authorization': process.env.TOKEN
        },
        timeout: Number(process.env.TIMEOUT) || 500,
      }

      let data = '';
      const cb = (chunk: Buffer) => data += chunk;
      await CLIENT_HTTP.request(reqOpts, cb);
      var batch = JSON.parse(data);
    }

    if (!batch.length) break;

    yield batch;
    opts.lastMessageId = batch[batch.length - 1].id;
  }
}

export async function storeAttachment(channelID: string, attachment: DiscordAttachment): Promise<void> {
  try { mkdirSync(`./data/${channelID}`, { recursive: true }) }
  catch (e:any) { 
    if (e.code !== 'EEXIST') throw new Error(e); 
  }
  
  const url = new URL(attachment.url);
  const regex = attachment.filename.match(/.*(\.\w{3,4})$/);
  const ext = regex && regex[1] ? regex[1] : '.file';
  const reqOpts = {
    host: url.host,
    path: url.pathname.concat(url.search),
    method: 'GET',
    headers: {
      'Authorization': process.env.TOKEN
    },
    timeout: process.env.TIMEOUT || 500,
  }

  const cb = (chunk: Buffer) => writeFileSync(`./data/${channelID}/${attachment.id}${ext}`, chunk, { flag: 'a' });
  await CLIENT_HTTP.request(reqOpts, cb);
}

async function storeAccount(account: DiscordAccount): Promise<void> {
  if (!PUSHED_USERS.includes(account.id)) {
    PUSHED_USERS.push(account.id);
    await CLIENT_PG.query(`INSERT INTO account (id, username, discriminator, global_name, bot, system) VALUES \
\ \ \ ('${account.id}', '${account.username.slice(0,32)}', '${account.discriminator}', '${account.global_name && account.global_name.slice(0,32)}', \
\ \ \ '${account.bot ? true : false}', '${account.system ? true : false}') ON CONFLICT DO NOTHING`);
  }
}

async function storeChannel(channel: DiscordChannel): Promise<void> {
  await CLIENT_PG.query(`INSERT INTO channel (id, type, name) VALUES ('${channel.id}', '${channel.type}', '${channel.name}')`);
}

async function storeMessages(batch: DiscordMessage[]): Promise<void> {
  const types = Object.keys({ 
    0: 'DEFAULT',
    1: 'RECIPIENT_ADD',
    2: 'RECIPIENT_REMOVE',
    3: 'CALL',
    6: 'CHANNEL_PINNED_MESSAGE',
    19: 'REPLY',
  }).map(key => Number(key));
  
  for (let message of batch) {
    // only handle supported types
    if (!types.includes(message.type)) continue;

    // values used when storing later on
    let misc = {
      attachments: '',
      reactions: '',
    }

    // check if author exists in the database, if not then push
    await storeAccount(message.author);

    switch (message.type) {
      case 0:
      case 19:
        // parse message_reference
        if (message.message_reference) {
          switch (message.message_reference.type) {
            case undefined:
            case 0:
              message.content = `<REPLY:${message.message_reference.message_id}> ` + message.content;
              break;
            case 1:
              if (message.message_snapshots) {
                message.content = `<FORWARD> ${message.message_snapshots[0].message.content}`;
                message.attachments = message.message_snapshots[0].message.attachments;
                message.mentions = message.message_snapshots[0].message.mentions;
                message.sticker_items = message.message_snapshots[0].message.sticker_items;
                message.embeds = message.message_snapshots[0].message.embeds;
              }
              break;
          }
        }

        if (message.author.bot && message.embeds && message.embeds.length > 0) {
          if (message.content.length) message.content += '\n';
          message.content += '<EMBED>';
          let eContent: string = '';
          if (message.embeds[0].author) eContent += `\n${message.embeds[0].author.name}`;
          if (message.embeds[0].title) eContent += `\n${message.embeds[0].title}`;
          if (message.embeds[0].description) eContent += `\n${message.embeds[0].description}`;
          if (message.embeds[0].footer) eContent += `\n${message.embeds[0].footer.text}`;
          if (!eContent.length) eContent = 'content-undefined';
          message.content += eContent;
        }

        // parse mentioned users
        if (message.mentions) {
          // check if user exists in the database, if not then push
          for (let user of message.mentions)
            storeAccount(user);

          // replace IDs of mentioned users with their name
          for (let id of message.content.matchAll(/<@(\d{0,20})>/g)) {
            let matched = message.mentions.reduce(
              (current, next) => { if (next.id === id[1]) return next; else return current },
              { id: id[1], username: 'unknown-user', discriminator: "0", global_name: 'unknown-user' }
            );
            let name = matched.global_name || matched.username;
            message.content = message.content.replaceAll(id[0], `@${name.includes(' ') ? `"${name}"` : name}`);
          }
        }
      
        // parse mentioned roles and channels
        if (message.content.match(/(<#\d{0,20}>|<@&\d{0,20}>)/)) {
          if (CHANNEL.guild_id) {
            if (!GUILD) GUILD = await fetchMetadata('guilds', CHANNEL.guild_id) as DiscordGuild;

            // replace IDs of mentioned channels with their name
            for (let id of message.content.matchAll(/<#(\d{0,20})>/g)) {
              let name = GUILD.channels.reduce(
                (current, next) => { if (next.id === id[1]) return next; else return current },
                { id: id[1], name: 'unknown-channel' }
              ).name;
              message.content = message.content.replaceAll(id[0], `#${name}`);
            }

            // replace IDs of mentioned roles with their name
            for (let id of message.content.matchAll(/<@&(\d{0,20})>/g)) {
              let name = GUILD.roles.reduce(
                (current, next) => { if (next.id === id[1]) return next; else return current },
                { id: id[1], name: 'unknown-role' }
              ).name;
              message.content = message.content.replaceAll(id[0], `@${name.includes(' ') ? `"${name}"` : name}`);
            }
          }
        }

        // parse attachments
        if (message.attachments) {
          for (let i=0; i<message.attachments.length; i++) {
            let att = message.attachments[i];
            storeAttachment(CHANNEL.id, att);
            if (i !== 0) misc.attachments += ', ';
            misc.attachments += att.id;
          }
        }

        // parse sticker_items
        if (message.sticker_items) {
          for (let i=0; i<message.sticker_items.length; i++) {
            let current = message.sticker_items[i];
            if (i !== 0) message.content += ', ';
            message.content += `<${current.name}:${current.id}>`;
          }
        }
        break;
      case 1:
      case 2:
        let author, recipient;
        // fetch author
        author = message.author.global_name || message.author.username;
        author = author.includes(' ') ? `"${author}"` : author;

        // fetch recipient
        if (message.mentions) {
          // check if user exists in the database, if not then push
          storeAccount(message.mentions[0]);
          recipient = message.mentions[0].global_name || message.mentions[0].username;
          recipient = recipient.includes(' ') ? `"${recipient}"` : recipient;
        }

        if (message.type === 1)
          message.content = `@${author} added @${recipient} to the group.`;
        else {
          if (author === recipient) message.content = `@${author} left the group.`;
          else message.content = `@${author} removed @${recipient} from the group.`;
        }
        break;
      case 3:
        if (message.call) {
          // store all call participants
          let participants: DiscordAccount[] = [];
          for (let user of message.call.participants)
            participants.push(await fetchMetadata('users', user) as DiscordAccount);
          for (let user of participants)
            storeAccount(user);

          let author = message.author.global_name || message.author.username;
          author = author.includes(' ') ? `"${author}"` : author;
          const delta = (new Date(message.call.ended_timestamp || NaN) as any) - (new Date(message.timestamp) as any);
          const time = Math.round(delta/1000/60);

          message.content = `@${author} started a call that lasted ${time} minutes. Call participants were: ${
            participants.map(u => u.global_name || u.username).join(', ')}.`;
          break;
        }
      case 6:
        if (message.message_reference) {
          const author = message.author.global_name || message.author.username;
          message.content = `${author} pinned a message <${message.message_reference.message_id || 'unknown-ID'}> to this channel.`;
        }
        break;
    }
    
    // parse reactions
    if (message.reactions) {
      for (let i=0; i<message.reactions.length; i++) {
        let current = message.reactions[i];
        if (i !== 0) misc.reactions += ', ';
        misc.reactions += `<${current.count}:${current.emoji.name}:${current.emoji.id}>`;
      }
    }

    // write message to database
    CLIENT_PG.query(`INSERT INTO message (id, channel_id, author_id, content, timestamp, attachments, reactions, pinned) \
\ \ \ VALUES ('${message.id}', '${message.channel_id}', '${message.author.id}', E'${message.content.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}', '${new Date(message.timestamp).toUTCString()}', \
\ \ \ '${misc.attachments}', '${misc.reactions}', ${message.pinned}) ON CONFLICT DO NOTHING`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!process.env.TOKEN) throw new Error('TOKEN undefined');
  if (!args.channelID || typeof args.channelID !== 'string') throw new Error('Channel ID undefined');
  if (typeof args.before === 'boolean') throw new Error('Last Message ID undefined');

  bootup('discord');

  console.log(`${colors.cyan} ${colors.yellow}`, 'Selected channel: ', args.channelID);
  console.log(`${colors.cyan}`, 'Fetching channel metadata...');
  CHANNEL = await fetchMetadata('channels', args.channelID) as DiscordChannel;
  if (![0,1,3].includes(CHANNEL.type)) throw new Error('Channel of this type cannot be archived');

  console.log(`${colors.cyan}`, 'Writing channel metadata...');
  storeChannel(CHANNEL);
  
  console.log(`${colors.cyan}`, 'Fetching all messages from selected channel...');
  for await (let batch of fetchMessages(CHANNEL.id, { lastMessageId: args.before }))
    await storeMessages(batch);

  console.log(`${colors.green}`, 'Done!');

  teardown(false);
}

if (require.main === module) main();
