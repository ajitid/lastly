# Lastlink

Get links of your last played (or now playing) song for different music streaming platforms. Your song should be scrobbled to Last.fm.

## Usage

This is a Node.js project that uses PNPM, but you could use NPM or Yarn as well to install dependencies. Open a terminal within the folder of this project and do:

```shell
pnpm i
```

You'd need a dotenv file. Create one called `.env` within this project and fill it with:

```dotenv
API_KEY=
USER_ID=
```

You can create an API Key from https://www.last.fm/api/account/create or grab an existing one from https://www.last.fm/api/accounts. And fill both of the values.

Then you can run the program with:

```shell
pnpm go
```

That'd be `npm run go` if you're using NPM.

## Notes for ya

It's fine if you're invoking the script manually on your machine, but if you're modifying and putting it on a server somewhere, then be judicious and invoke it at most 1 time within 1:30 min interval and cache the value for that period.

The script tries to find song links for platforms, but if couldn't, it'll return only `lastfm` within `links` and will omit `extralarge` within `coverArt`.

## Motivation

I started noticing that more and more people on their website are adding a [/now page](https://nownownow.com/). People have found this as a way to make their site feel more personal. I also came across people broadcasting what they are listening to right now, [like here](https://henry.codes/writing/) (look at top-right) and [in here](https://ellen.li/). This is nice, but what's the use if I can't open the song that I'm looking at so I could listen to what you're listening as well?

If you are on Spotify, then you can use [song.link](https://song.link/)'s API and get the links of various platforms easily. But I'm using Apple Music, and their API [isn't that good](https://stackoverflow.com/questions/61190180/apple-music-api-get-currently-playing-song). Rather, I can scrobble using [Marvis Pro](https://apps.apple.com/app/marvis-pro/id1447768809) or [Sleeve](https://replay.software/sleeve) and use this script to show the viewers of my site what I'm listening to.
