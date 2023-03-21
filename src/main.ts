import dotenv from "dotenv";
import got from "got";
import { load as loadHtml } from "cheerio";

// if you want to change the country, search for instances of "default to US" in this file

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
  nowPlaying: boolean;
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
    parsedObj.API_KEY &&
    parsedObj.USER_ID
  ) {
    return;
  }
  throw new TypeError("config is invalid");
}
checkValidConfig(dotenvResult.parsed);
const config: Config = {
  apiKey: dotenvResult.parsed.API_KEY!,
  userId: dotenvResult.parsed.USER_ID!,
};

const grabMoreItemsUsingSongLink = async (songLink: string, song: Song) => {
  // let's don't define country here and let it default to US, as it has most songs present
  const streamingLinks: StreamingLinks = await got("https://api.song.link/v1-alpha.1/links", {
    searchParams: {
      url: songLink,
    },
  }).json();

  const itunesEntity = Object.keys(streamingLinks.entitiesByUniqueId).filter((ent) =>
    ent.startsWith("ITUNES_SONG::")
  )[0]!;
  // spotify provides album art as well, but chances to bump into a compilation cover art is higher
  song.coverArt.extralarge = streamingLinks.entitiesByUniqueId[itunesEntity]!.thumbnailUrl;

  for (const [platform, { url }] of Object.entries(streamingLinks.linksByPlatform)) {
    song.links[platform] = url;
  }
};

const LASTFM_API_ROOT = "http://ws.audioscrobbler.com/2.0/";

// TODO try catch
async function getSongLinks() {
  const recentTracksData: { recenttracks: { track: Track[] } } = await got(LASTFM_API_ROOT, {
    searchParams: {
      method: "user.getrecenttracks",
      format: "json",
      api_key: config.apiKey,
      limit: 1,
      user: config.userId,
    },
  }).json();
  const lastTrack = recentTracksData.recenttracks.track[0];
  if (lastTrack === undefined) {
    console.log("no track scrobbled yet");
    // TODO maybe need to throw
    return null;
  }

  const song: Song = {
    title: lastTrack.name,
    artist: lastTrack.artist["#text"],
    album: lastTrack.album["#text"],
    nowPlaying: lastTrack["@attr"]?.nowplaying === "true" ?? false,
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
  if (spotifyLink !== undefined) {
    await grabMoreItemsUsingSongLink(spotifyLink, song);
  } else {
    // console.log("spotify link doesn't exist for", lastTrack.name);
    // console.log("no spotify link, looking for album via lastfm...");

    // while URL in lastfm use a slug name for album, artist and song in their URL
    // like using + for space instead of %20, and allowing ÷ as is
    // they don't mind accepting URLs encoded with encodeURI/encodeURIComponent
    try {
      const enc = encodeURIComponent;

      let appleMusicAlbumId = "";

      {
        // album URL might not exist as well so it'd throw
        const albumHtml = await got(
          `https://www.last.fm/music/${enc(song.artist)}/${enc(song.album)}/+partial/buylinks`
        );
        const $ = loadHtml(albumHtml.body);
        const link = $('[data-analytics-label="itunes"]').attr("href");
        if (link === undefined) {
          throw new Error("URL cannot be parsed");
        }
        const url = new URL(link);
        const albumPart = "/album/id";
        const albumPartIdx = url.pathname.indexOf(albumPart);
        appleMusicAlbumId = url.pathname.substring(albumPartIdx + albumPart.length);
      }

      if (appleMusicAlbumId == "") {
        throw new Error("Apple Music album ID couldn't be found");
      }

      {
        // As we haven't told the country it'll default to US, which is fine as it has most songs present
        const appleMusicAlbumHtml = await got(
          `https://music.apple.com/album/some-album/${appleMusicAlbumId}`
        );
        const $ = loadHtml(appleMusicAlbumHtml.body);
        const tracks: Array<{ name: string; url: string }> = JSON.parse(
          $("script#schema\\:music-album").text()
        ).tracks;
        const appleMusicSongLink = tracks.find((t) => t.name === song.title)!.url;
        await grabMoreItemsUsingSongLink(appleMusicSongLink, song);
      }
    } catch (err) {
      // console.error("album couldn't be found in last.fm", err);
    }
  }
  return song;
}

async function main() {
  const links = await getSongLinks();
  if (!links) {
    // console.log("early `main` return");
    return;
  }
  console.log(links);
}

main();
