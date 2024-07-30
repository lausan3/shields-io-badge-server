import { Elysia } from "elysia";

// Endpoints
import ShieldsJSONFormat from "./shields/shields-format";

const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .all('/spotify/lastplayed/:id', ({ params: { id }}) => {
    const ret: ShieldsJSONFormat = {
      schemaVersion: "1",
      label: "Last Played Song",
      message: id,
    }

    return ret;
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Test last played feature
app.handle(new Request('http://localhost:3000/spotify/lastplayed/5')).then(console.log);