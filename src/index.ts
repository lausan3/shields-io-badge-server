import { Elysia, redirect, t } from "elysia";
import { config } from 'dotenv';
import { supabase, KEY_SPOTIFY_TABLE } from "./client/client";

// Endpoints
import ShieldsJSONFormat from "./models/shields-format";

// Run locally only
// config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const baseUri = process.env.SPOTIFY_BASE_URI;

// In-memory cache of <spotifyId, { accessToken, userData}>
const cache = new Map<string, {
  userData: {
    refreshCode: string
  },
  accessToken: {
    token: string,
    // Expiry time in milliseconds
    expiresAt: number
  }
}>();

const app = new Elysia()
  .get("/", () => {
    return {
      hello: "Hello from Elysia!",
      verification: Bun.file('public/googled23ff0e3284ed5f2.html')
    }
  })
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

        // Prepare token get
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
            const refreshToken = accessTokenData.refresh_token;
            const accessToken = accessTokenData.access_token;
            const accessTokenExpiresInMs = accessTokenData.expires_in * 1000;

            // Insert into cache
            const userValues = {
              userData: {
                refreshCode: refreshToken
              },
              accessToken: {
                token: accessToken,
                expiresAt: Date.now() + accessTokenExpiresInMs,
              }
            }
            cache.set(spotifyId, userValues);

            // Store user in Supabase
            const upsertResponse = await supabase
              .from(KEY_SPOTIFY_TABLE)
              .upsert({
                "spotify-id": spotifyId,
                "refresh-code": refreshToken
              })

            if (upsertResponse.error) {
              return upsertResponse.error;
            }

            console.log(cache.get(spotifyId));
            
            return "You've been successfully authorized! Go look for some badges to use.";
          } else {
            return 'Failed to authorize.';
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
      // Refresh a token based on a code and set it in the cache - this assumes the user is in the database
      .get('/refreshtoken', async ({ query }) => {
        const id = query.id;
        const code = query.code;

        const authOptions = {
          url: 'https://accounts.spotify.com/api/token',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
          },
          form: {
            grant_type: 'refresh_token',
            refresh_token: code
          },
          json: true
        };
        
        try {
          const accessTokenResponse = await fetch(authOptions.url, {
            method: 'POST',
            headers: authOptions.headers,
            body: new URLSearchParams(authOptions.form),
          });
          
          if (accessTokenResponse.ok) {
            const accessTokenData = await accessTokenResponse.json();

            const accessToken = accessTokenData.access_token;
            const accessTokenExpiresInMs = accessTokenData.expires_in * 1000;

            // Insert into cache
            const userValues = {
              userData: {
                refreshCode: code
              },
              accessToken: {
                token: accessToken,
                expiresAt: Date.now() + accessTokenExpiresInMs,
              }
            }
            cache.set(id, userValues);
            
            return cache.get(id);
          } else {
            return 'Failed to authorize.';
          }
        } catch (error) {
          return error;
        }
      }, { 
        query: t.Object({
          code: t.String(),
          id: t.String()
        })
      })
      .get('/lastplayed/:id', async ({ params: { id }}) => {
        // Check for user in cache
        let userInCache = cache.get(id);
        let accessToken: string | null = null;

        // If the user's id is not in the cache, check if they're in the database.
        if (!userInCache) {
          const { data, error } = await supabase
            .from(KEY_SPOTIFY_TABLE)
            .select()
            .eq("spotify-id", id);

          // If user is in the database, get a new access token and set it in the cache, then set userInCache
          if (!error && data.length > 0) {
            const getNewTokenResponse = await fetch(`${baseUri}/spotify/refreshtoken?code=${data[0]["refresh-code"]}&id=${id}`);

            if (getNewTokenResponse.ok) {
              userInCache = await getNewTokenResponse.json();
            }
          } else if (error) {
            return error;
          } else {
            return `We don't have your Spotify id on file. Authorize at ${baseUri}/spotify/authorize or check if you spelled your username wrong.`;
          }
        }

        const user = userInCache!;
        console.log(user);
        accessToken = user.accessToken.token;

        // Check for token expiry - refresh if it is expired
        if (Date.now() >= user.accessToken.expiresAt) {
          const getNewTokenResponse = await fetch(`${baseUri}/spotify/refreshtoken?code=${user.userData.refreshCode}&id=${id}`);

          if (getNewTokenResponse.ok) {
            accessToken = cache.get(id)!.accessToken.token;
          }
        }
        
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