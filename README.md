# discord_backup

Small script i use for backing up discord chats.<br/>
Data is parsed in a personalized manner and saved to a postgres database.<br/>
No frontend cuz too lazy.

## Usage

> Script requires the environment variable TOKEN to contain a valid Bearer token used for authorization with the Discord API!

```
Usage: src/main.ts [OPTIONS]

Options:
  --channelID           ID of the channel that contains all the messages
  --before              ID of the message that is used as the upper limit
```
  
( ꩜ ᯅ ꩜;)
