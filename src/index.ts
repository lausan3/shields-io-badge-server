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

// In-memory cache of <displayName, { accessToken, userData}>
const cache = new Map<string, {
  userData: {
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
      // Send the user an authorization redirect
      .get('/authorize', async () => {
        const scope = "user-read-recently-played user-read-private user-read-email";
        const baseUrl = "https://accounts.spotify.com/authorize";
        
        // Redirect to authorize link
        return redirect(`${baseUrl}?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${baseUri}/spotify/callback`)
      })
      // Get a new key and cache it
      .get('/callback', async ({ query }) => {
        const code = query.code || null;
        const error = query.error || null;
        
        // We ran into an error, return it
        if (!code || error) {
          return error;
        }
        
        // Prepare token refresh
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
          const accessTokenResponse = await fetch(authOptions.url, {
            method: 'POST',
            headers: authOptions.headers,
            body: new URLSearchParams(authOptions.form),
          });
          
          if (accessTokenResponse.ok) {
            const accessTokenData = await accessTokenResponse.json();

            const spotifyDataResponse = await fetch("https://api.spotify.com/v1/me",
              {
                headers: {
                  "authorization": `Bearer ${accessTokenData.access_token}`
                }
              }
            );

            const spotifyData = await spotifyDataResponse.json();

            console.log(spotifyData);

            const spotifyId = spotifyData.id;
            const displayName = spotifyData.display_name;
            const refreshCode = accessTokenData.refresh_token;
            const accessToken = accessTokenData.access_token;
            const accessTokenExpiresInMs = accessTokenData.expires_in * 1000;

            // Insert into cache
            const userValues = {
              userData: {
                spotifyId: spotifyId,
                refreshCode: refreshCode
              },
              accessToken: {
                token: accessToken,
                expiresAt: Date.now() + accessTokenExpiresInMs,
              }
            }
            cache.set(displayName, userValues);

            // Store user in Supabase
            const upsertResponse = await supabase
              .from(KEY_SPOTIFY_TABLE)
              .upsert({
                username: displayName,
                "spotify-id": spotifyId,
                "refresh-code": refreshCode
              })

            console.log(upsertResponse);
            
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
          error: t.MaybeEmpty(t.String()),
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