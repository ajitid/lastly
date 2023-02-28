import dotenv from "dotenv";
import got from "got";
import { load as loadHtml } from "cheerio";

interface Config {
  readonly apiKey: string;
  readonly userId: string;
}

/*
```json
[
  {
    artist: { mbid: '', '#text': 'grouptherapy. & Jadagrace' },
    streamable: '0',
    image: [ [Object], [Object], [Object], [Object] ],
    mbid: '',
    album: { mbid: '', '#text': 'Brand New - Single' },
    name: 'Brand New',
    url: 'https://www.last.fm/music/grouptherapy.+&+Jadagrace/_/Brand+New',
    date: { uts: '1677426806', '#text': '26 Feb 2023, 15:53' }
  },
  {
    artist: {
      mbid: '0b0c25f4-f31c-46a5-a4fb-ccbf53d663bd',
      '#text': 'Jon Hopkins'
    },
    streamable: '0',
    image: [ [Object], [Object], [Object], [Object] ],
    mbid: '2868f938-9efb-4900-a151-062743f9f04e',
    album: {
      mbid: '128b6ea3-5ca0-4db3-be9c-1a1d535da845',
      '#text': 'Immunity'
    },
    name: 'Immunity',
    url: 'https://www.last.fm/music/Jon+Hopkins/_/Immunity',
    date: { uts: '1677426661', '#text': '26 Feb 2023, 15:51' }
  }
]
```
*/
interface Track {
  artist: { mbid: string; "#text": string };
  streamable: string;
  image: Array<{ size: "small" | "medium" | "large" | "extralarge"; "#text": string }>;
  mbid: string;
  album: { mbid: string; "#text": string };
  name: string;
  url: string;
  date: { uts: string; "#text": string };
  "@attr"?: { nowplaying?: "true" };
}

// intentionally incomplete
interface StreamingLinks {
  pageUrl: string;
  /*
    TODO ajit if you're specifying platform here like 
    Record<string -> Record<'tidal' | 'spotify' | ...
    make sure to:
    - provide a way to user easily override this type and more platforms can be added in future
    - give a type such that each can be undefined (so like { spotify?: {properties} }) because they _can be_
  */
  linksByPlatform: Record<string, { url: string }>;
  entitiesByUniqueId: Record<string, { thumbnailUrl: string }>;
}

interface Song {
  title: string;
  artist: string;
  album: string;
  links: Record<string, string>;
  coverArt: Record<"small" | "medium" | "large", string> & { extralarge?: string };
}

const dotenvResult = dotenv.config({ path: ".env" });
if (dotenvResult.error) {
  throw dotenvResult.error;
}

function checkValidConfig(parsedObj: any): asserts parsedObj is Config {
  if (
    typeof parsedObj === "object" &&
    parsedObj !== null &&
    parsedObj.LASTFM_API_KEY &&
    parsedObj.USER_ID
  ) {
    return;
  }
  throw new TypeError("config is invalid");
}
checkValidConfig(dotenvResult.parsed);
const config: Config = {
  apiKey: dotenvResult.parsed.LASTFM_API_KEY!,
  userId: dotenvResult.parsed.USER_ID!,
};

const LASTFM_API_ROOT = "http://ws.audioscrobbler.com/2.0/";

// TODO try catch
async function getSongLinks() {
  const recentTracksData: { recenttracks: { track: Track[] } } = await got(LASTFM_API_ROOT, {
    searchParams: {
      method: "user.getrecenttracks",
      format: "json",
      api_key: config.apiKey,
      limit: 2,
      user: config.userId,
    },
  }).json();
  const lastTrack = recentTracksData.recenttracks.track.filter((t) => !t["@attr"]?.nowplaying)[0];
  if (lastTrack === undefined) {
    console.log("no track scrobbled yet");
    // TODO maybe need to throw
    return null;
  }

  const song: Song = {
    title: lastTrack.name,
    album: lastTrack.album["#text"],
    artist: lastTrack.artist["#text"],
    links: { lastfm: lastTrack.url },
    coverArt: {
      small: lastTrack.image.filter((im) => im.size === "medium")[0]!["#text"],
      medium: lastTrack.image.filter((im) => im.size === "large")[0]!["#text"],
      large: lastTrack.image.filter((im) => im.size === "extralarge")[0]!["#text"],
    },
  };

  const { body } = await got(lastTrack.url);
  const $ = loadHtml(body);
  const spotifyLink = $(".play-this-track-playlink--spotify").attr("href");
  if (spotifyLink === undefined) {
    console.log("spotify link doesn't exist for", lastTrack.name);
    return song;
  }

  // let's don't define country here and let it default to US, as it has most songs present
  const streamingLinks: StreamingLinks = await got("https://api.song.link/v1-alpha.1/links", {
    searchParams: {
      url: spotifyLink,
    },
  }).json();

  const spotifyEntity = Object.keys(streamingLinks.entitiesByUniqueId).filter((ent) =>
    ent.startsWith("SPOTIFY_SONG::")
  )[0]!;
  song.coverArt.extralarge = streamingLinks.entitiesByUniqueId[spotifyEntity]!.thumbnailUrl;

  for (const [platform, { url }] of Object.entries(streamingLinks.linksByPlatform)) {
    song.links[platform] = url;
  }
  return song;
}

async function main() {
  const links = await getSongLinks();
  if (!links) {
    console.log("early `main` return");
  }
  console.log(links);
}

main();
