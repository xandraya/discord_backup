import * as pg from 'pg';
import HTTPClient from '76a01a3490137f87';

import type { ParsedArgs } from './types.d';

export let CLIENT_HTTP: HTTPClient;
export let CLIENT_PG: pg.Client;

export async function bootup(database: string) {
  // shared config
  const config: pg.ClientConfig = Object.freeze({
    user: 'postgres',
    host: 'database',
    port: 6566,
    password: 'password',
  });

  // bootup http client
  CLIENT_HTTP = new HTTPClient({ debug: 1, pgOptions: { ...config, database: 'http_client' }});
  await CLIENT_HTTP.bootup();

  // bootup pg client
  CLIENT_PG = new pg.Client({ ...config, database });
  await CLIENT_PG.connect();

	CLIENT_PG.on('error', err => console.error('postgres error', err.stack));
	CLIENT_PG.on('notice', msg => console.warn('notice:', msg));

  await createTables(CLIENT_PG);
}

export async function teardown(drop: boolean) {
  drop && await dropTables(CLIENT_PG);

  await CLIENT_HTTP.teardown();
  await CLIENT_PG.end();
}

/*
  * account | id, username, discriminator, global_name, bot, system
  * channel | id, type, name
  * message | id, channel_id, author_id, content, timestamp, attachments, reactions, pinned
*/
async function createTables(client: pg.Client): Promise<undefined> {
  await client.query(`CREATE TABLE IF NOT EXISTS account (id varchar(20) CONSTRAINT pg_account PRIMARY KEY, username varchar(32) NOT NULL, discriminator varchar(4) NOT NULL, global_name varchar(32), bot boolean, system boolean)`);
  await client.query(`CREATE TABLE IF NOT EXISTS channel (id varchar(20) CONSTRAINT pk_channel PRIMARY KEY, type smallint NOT NULL, name varchar(100))`);
  await client.query(`CREATE TABLE IF NOT EXISTS message (id varchar(20) CONSTRAINT pk_message PRIMARY KEY, channel_id varchar(20) REFERENCES channel(id), author_id varchar(20) REFERENCES account(id), content text, timestamp timestamp, attachments text, reactions text, pinned boolean)`);
}

async function dropTables(client: pg.Client): Promise<undefined> {
  await client.query(`drop table account, channel, message`);
}

export function parseArgs(): ParsedArgs {
  // @ts-ignore
  const args: ParsedArgs = { _: [] };
  let currentKey: string | null = null;

  for (const arg of process.argv.slice(2)) {
    if (currentKey) {
      if (!arg.startsWith('--')) {
        args[currentKey] = arg.replaceAll('"', '');
        currentKey = null;
        continue;
      } else {
        args[currentKey] = true;
        currentKey = null;
      }
    }
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
          args[key] = value.replaceAll('"', '');;
      } else {
          currentKey = key;
      }
    } else {
      if (currentKey === null) {
          args._.push(arg);
      }
    }
  }

  if (currentKey) {
      args[currentKey] = true;
  }

  return args;
}
