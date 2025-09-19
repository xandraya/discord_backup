import { readdirSync } from 'node:fs';
import { storeAttachment, fetchMetadata, fetchMessages } from '../src/main';
import { bootup, teardown } from '../src/services';

import type { DiscordAttachment, DiscordGuild } from '../src/types';

beforeAll(async () => {
  bootup('test');
});

afterAll(async () => {
  teardown(true);
});

test('storeAttachment', async () => {
  if (!process.env.TEST_CHANNEL_ID || !process.env.TEST_ATTACHMENT_URL) throw new Error();
  const attachment: DiscordAttachment = {
    id: '0',
    filename: 'foobar.jpg',
    url: process.env.TEST_ATTACHMENT_URL,
  }

  await storeAttachment(process.env.TEST_CHANNEL_ID, attachment);
  const dir = readdirSync(`./data/${process.env.TEST_CHANNEL_ID}`)

  expect(dir).toHaveLength(1);
  expect(dir[0]).toBe('0.jpg')
});

test('fetchMetadata', async () => {
  if (!process.env.TEST_CHANNEL_ID || !process.env.TEST_USER_ID || !process.env.TEST_GUILD_ID) throw new Error();

  const channel = await fetchMetadata('channels', process.env.TEST_CHANNEL_ID);
  expect(channel.id).toBe(process.env.TEST_CHANNEL_ID);

  const user = await fetchMetadata('users', process.env.TEST_USER_ID);
  expect(user.id).toBe(process.env.TEST_USER_ID);

  const guild = await fetchMetadata('guilds', process.env.TEST_GUILD_ID) as DiscordGuild;
  expect(guild.id).toBe(process.env.TEST_GUILD_ID);
  expect(guild.roles).toBeDefined();
  expect(guild.channels).toBeDefined();
});

test('fetchMessages', async () => {
  if (!process.env.TEST_CHANNEL_ID) throw new Error();

  for await (let batch of fetchMessages(process.env.TEST_CHANNEL_ID, { lastMessageId: process.env.TEST_LAST_MESSAGE_ID, limit: 1 })) {
    expect(batch.length).toBe(1);
    expect(batch[0].id).not.toBe(process.env.TEST_LAST_MESSAGE_ID);
    expect(batch[0].channel_id).toBe(process.env.TEST_CHANNEL_ID);
  }
});
