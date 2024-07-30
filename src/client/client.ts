import { createClient } from "@supabase/supabase-js";
import { Database } from "./supabase"

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_API_KEY;

export const KEY_SPOTIFY_TABLE = "spotify-auth";

export const supabase = createClient<Database>(SUPABASE_URL || "", SUPABASE_KEY || "");