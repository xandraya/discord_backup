export interface ParsedArgs {
  [key: string]: string | boolean;
  _: string[];
}

export interface DiscordAccount {
  id: string
  username: string
  discriminator: string
  global_name?: string
  bot?: boolean
  system?: boolean
}

export interface DiscordChannel {
  id: string
  type: number
  name?: string
  guild_id?: string
}

export interface DiscordGuild {
  id: string
  roles: {
    id: string
    name: string
  }[]
  channels: {
    id: string
    name: string
  }[]
}

interface DiscordEmbed {
  author?: { name: string }
  title?: string
  description?: string
  footer?: { text: string }
}

interface DiscordReaction {
  count: number
  emoji: {
    id: string
    name: string
  }
}

interface DiscordAttachment {
  id: string
  filename: string
  url: string
}

interface DiscordMessageReference {
  type?: 0 | 1
  message_id?: string
  channel_id?: string
}

interface DiscordMessageSnapshots {
  message: {
    type: number
    content: string
    attachments?: DiscordAttachment[]
    mentions?: DiscordAccount[]
    embeds?: DiscordEmbed[]
    sticker_items?: DiscordSticker[]
  }
}

interface DiscordSticker {
  id: string
  name: string
  format_type: number
}

interface DiscordCall {
  participants: string[]
  ended_timestamp?: string
}

export interface DiscordMessage {
  id: string
  channel_id: string
  author: DiscordAccount
  content: string
  timestamp: string
  mentions?: DiscordAccount[]
  attachments?: DiscordAttachment[]
  reactions?: DiscordReaction[]
  embeds?: DiscordEmbed[]
  pinned: boolean
  type: number
  message_reference?: DiscordMessageReference
  message_snapshots?: DiscordMessageSnapshots[]
  sticker_items?: DiscordSticker[]
  call?: DiscordCall
}
