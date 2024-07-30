import { Elysia, redirect, t } from "elysia";
import { config } from 'dotenv';
import { supabase, KEY_SPOTIFY_TABLE } from "./client/client";

// Endpoints
import ShieldsJSONFormat from "./models/shields-format";

// Run locally only
config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const baseUri = process.env.SPOTIFY_BASE_URI;

let accessToken: string | null = null;

// In-memory cache of <username, { accessToken, userData}>
const cache = new Map<string, {
  userData: {
    supaId: number,
    spotifyId: string,
    refreshCode: string
  },
  accessToken: {
    token: string,
    // Expiry time in milliseconds
    expiresAt: number
  }
}>();

const app = new Elysia()
  .get("/", () => "Hello from Elysia!")
  .group('/spotify', app => {
    return app
      // Send the user an authorization redirect if we don't have them in the database
      .get('/authorize/:username', async ({ params: { username }}) => {
        // Check if we have the access token in the cache
        const userInCache = cache.get(username);

        if (userInCache && userInCache.accessToken.expiresAt > Date.now()) {
          console.log(userInCache);

          // Use cached access token to fetch data
          return "You're already authorized. Check the README for what badge you want to use.";
        }

        // Check if we have saved the user to the Supabase DB
        const { data, error } = await supabase
          .from(KEY_SPOTIFY_TABLE)
          .select()
          .eq("username", username);

        if (!error && data.length > 0) {
          // Load user into cache with new key by calling callback endpoint
          console.log(data);

          return await fetch(`${baseUri}/spotify/callback?code=${data[0]["refresh-code"]}`); 
        }
        
        const scope = "user-read-recently-played user-read-private";
        
        const baseUrl = "https://accounts.spotify.com/authorize";
        
        return redirect(`${baseUrl}?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${baseUri}/spotify/callback`)
      })
      .get('/callback', async ({ query }) => {
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
      .get('/lastplayed', async () => {
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
            schemaVersion: 1,
            label: "Last Song Played",
            message: `${lastSong.name} by ${lastSong.artists[0].name}`,
            namedLogo: "spotify"
          }
          
          return ret;
        } else {
          return json.error;
        }
      } catch (error) {
        return error;
      }
    })
  }) // End /Spotify group
.listen(process.env.PORT || 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Test last played feature
// app.handle(new Request(`http://localhost:3000/spotify/lastplayed/5`)).then(console.log);