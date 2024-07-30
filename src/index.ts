import { Elysia, redirect, t } from "elysia";
import { config } from 'dotenv';

// Endpoints
import ShieldsJSONFormat from "./shields/shields-format";

// Run locally only
// config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const baseUri = process.env.SPOTIFY_BASE_URI;

let accessToken: string | null = null;

const app = new Elysia()
  .get("/", () => "Hello from Elysia!")
  .all('/spotify/authorize', async () => {
    if (accessToken) {
      return await fetch(`${baseUri}/spotify/lastplayed`);
    }

    const scope = "user-read-recently-played";

    const baseUrl = "https://accounts.spotify.com/authorize";

    return redirect(`${baseUrl}?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${baseUri}/spotify/callback`)
  })
  .get('/spotify/callback', async ({ query }) => {
    const code = query.code || null;
    const error = query.error || null;

    if (!code || error) {
      return error;
    }

    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: `${baseUri}/spotify/callback`,
        grant_type: 'authorization_code',
      },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
      },
      json: true,
    };

    try {
      const response = await fetch(authOptions.url, {
        method: 'POST',
        headers: authOptions.headers,
        body: new URLSearchParams(authOptions.form),
      });
  
      if (response.ok) {
        const data = await response.json();
        accessToken = data.access_token;

        return await fetch(`${baseUri}/spotify/lastplayed`);
      } else {
        return 'Failed to authenticate';
      }
    } catch (error) {
      return error;
    }
  }, {
    query: t.Object({
      code: t.MaybeEmpty(t.String()),
      error: t.MaybeEmpty(t.String())
    })
  })
  .get('/spotify/lastplayed', async () => {
    if (!accessToken) return "No access token, try authorizing.";

    const url = "https://api.spotify.com/v1/me/player/recently-played?limit=1";

    try {
      const response = await fetch(url,
        {
          headers: {
            "authorization": `Bearer ${accessToken}`
          }
        }
      );
      const json = await response.json();
      
      if (response.ok) {

        const lastSong = json.items[0].track;

        const ret: ShieldsJSONFormat = {
          schemaVersion: "1",
          label: "Last Song",
          message: `${lastSong.name} by ${lastSong.artists[0].name}`
        }

        return ret;
      } else {
        return json.error;
      }
    } catch (error) {
      return error;
    }
  })
  .listen(3000);

const redirect_uri = `${app.server?.hostname}`

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Test last played feature
// app.handle(new Request(`http://localhost:3000/spotify/lastplayed/5`)).then(console.log);