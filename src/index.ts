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
    // Serve the index.html file
    return Bun.file('public/index.html');
  })
  .group('/signin', app => {
    return app
      // Send the user an authorization redirect
      .get('/authorize', async () => {
        const scope = "user-read-recently-played user-read-private user-read-email";
        const baseUrl = "https://accounts.spotify.com/authorize";
        
        // Redirect to authorize link
        return redirect(`${baseUrl}?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${baseUri}/signin/callback`)
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
            redirect_uri: `${baseUri}/signin/callback`,
            grant_type: 'authorization_code',
          },
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
          },
        };
        
        try {
          const accessTokenResponse = await fetch(authOptions.url, {
            method: 'POST',
            headers: authOptions.headers,
            body: new URLSearchParams(authOptions.form),
          });
          
          if (accessTokenResponse.ok) {
            const accessTokenData = await accessTokenResponse.json();

            console.log(`passed upsert ${JSON.stringify(accessTokenResponse)}`)

            const spotifyDataResponse = await fetch("https://api.spotify.com/v1/me",
              {
                headers: {
                  "authorization": `Bearer ${accessTokenData.access_token}`
                }
              }
            );

            console.log(`PASSED fetch spotify data ${spotifyDataResponse.body}. ${spotifyDataResponse.status}. ${spotifyDataResponse.statusText}`)

            const spotifyData = await spotifyDataResponse.json();

            // NOTE: ERROR HERE

            console.log(`PASSED spotify data json ${JSON.stringify(spotifyData)}`)

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

            console.log(`passed upsert ${JSON.stringify(upsertResponse)}`)

            if (upsertResponse.error) {
              return upsertResponse.error;
            }
            
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
    }) // End /signin group
    .group('/badges', app => {
      return app
        .get('/lastplayed/:id', async ({ params: { id }}) => {
          console.log(`GETTING LAST PLAYED BADGE FOR ID: ${id}`)

          // Check for user in cache
          let userInCache = cache.get(id);
          let accessToken: string | null = null;

          console.log("Checking if the user is in the cache.");
          
          // If the user's id is not in the cache, check if they're in the database.
          if (!userInCache) {
            console.log(`User is not in the cache. Checking Supa for data on id: ${id}`);

            const { data, error } = await supabase
            .from(KEY_SPOTIFY_TABLE)
            .select()
            .eq("spotify-id", id);

            console.log(`Supa data received: ${data}. error?: ${error}.`)
            
            // If user is in the database, get a new access token and set it in the cache, then set userInCache
            if (!error && data.length > 0) {
              console.log(`Refreshing token for user ${id}.`)
              const getNewTokenResponse = await fetch(`${baseUri}/signin/refreshtoken?code=${data[0]["refresh-code"]}&id=${id}`);
              
              if (getNewTokenResponse.ok) {
                console.log(`Refreshing token was successful.`)
                userInCache = await getNewTokenResponse.json();
                console.log(`User: ${JSON.stringify(userInCache)}`)
              }
            } else if (error) {
              console.log(`Error occured in getting Supa data: ${error}`)
              return error;
            } else {
              console.log(`User doesn't exist. Prompting authorization.`)
              return `We don't have your Spotify id on file. Authorize at ${baseUri}/signin/authorize or check if you spelled your username wrong.`;
            }
          }
          
          const user = userInCache!;
          accessToken = user.accessToken.token;
          console.log(`Preliminary checks complete. User: ${user}`)
          console.log(`Access token: ${accessToken}`)
          
          // Check for token expiry - refresh if it is expired
          if (Date.now() >= user.accessToken.expiresAt) {
            console.log(`Token is expired. Refreshing it.`)
            const getNewTokenResponse = await fetch(`${baseUri}/signin/refreshtoken?code=${user.userData.refreshCode}&id=${id}`);
            
            if (getNewTokenResponse.ok) {
              accessToken = cache.get(id)!.accessToken.token;
            }
          }
          
          const url = "https://api.spotify.com/v1/me/player/recently-played?limit=1";
          
          console.log(`Fetching ${url} for ${id}`)

          try {
            const response = await fetch(url,
              {
                headers: {
                  "authorization": `Bearer ${accessToken}`
                }
              }
            );

            console.log(`Passed fetch: ${response.body}. ${response.status}. ${response.statusText}`)

            const json = await response.json();

            // NOTE: ERROR HERE

            console.log(`Passed JSON conversion: ${JSON.stringify(json)}`)
            
            if (response.ok) {
              
              const lastSong = json.items[0].track;
              
              const ret: ShieldsJSONFormat = {
                schemaVersion: 1,
                label: "Last Song Played",
                message: `${lastSong.name} by ${lastSong.artists[0].name}`,
                namedLogo: "spotify"
              }
              
              return ret;
            }
          } catch (error) {
            console.log(`Caught error during fetch: ${error}`)
            return error;
          }
        }
      )
    })
    .listen(process.env.PORT || 3000);
    
    console.log(
      `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
    );