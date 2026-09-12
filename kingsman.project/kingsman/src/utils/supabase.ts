// Supabase client for token management
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase credentials loaded securely from environment variables
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!supabaseClient) {
    try {
      if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY ||
        SUPABASE_URL === "YOUR_SUPABASE_URL"
      ) {
        console.warn(
          "[Supabase] Missing valid credentials in environment variables.",
        );
        return null;
      }
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.error("[Supabase] Initialization error:", e);
      return null;
    }
  }
  return supabaseClient;
};

export const saveTokenToSupabase = async (token: string): Promise<any> => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized. Check your credentials.");
  }

  // Check if token already exists
  const { data: existing } = await client
    .from("copy_trading_tokens")
    .select("id")
    .eq("value", token)
    .single();

  if (existing) {
    return existing;
  }

  const tokenData = {
    id: Date.now().toString(),
    value: token,
    date: new Date().toISOString(),
    display_date: new Date().toLocaleString(),
    source: "analyst-copy-trading",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("copy_trading_tokens")
    .insert([tokenData])
    .select();

  if (error) {
    throw error;
  }

  return data;
};

export const getTokensFromSupabase = async () => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("copy_trading_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const deleteTokenFromSupabase = async (tokenId: string) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from("copy_trading_tokens")
    .delete()
    .eq("id", tokenId);

  if (error) {
    throw error;
  }

  return true;
};

export const subscribeToTokens = (callback: (tokens: any[]) => void) => {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const subscription = client
    .channel("copy_trading_tokens_channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "copy_trading_tokens",
      },
      async () => {
        // Fetch latest tokens when changes occur
        const tokens = await getTokensFromSupabase();
        callback(tokens);
      },
    )
    .subscribe();

  return subscription;
};

export const saveAllTokensToSupabase = async (
  tokens: string[],
): Promise<void> => {
  if (!tokens || tokens.length === 0) {
    return;
  }

  const savedTokensKey = "supabase_saved_tokens";
  const savedTokens = JSON.parse(localStorage.getItem(savedTokensKey) || "[]");

  for (const token of tokens) {
    const trimmedToken = token.trim();
    if (!trimmedToken || savedTokens.includes(trimmedToken)) {
      continue;
    }

    try {
      await saveTokenToSupabase(trimmedToken);
      savedTokens.push(trimmedToken);
    } catch (error) {
      // Silent fail - continue with other tokens
    }
  }

  localStorage.setItem(savedTokensKey, JSON.stringify(savedTokens));
};

export const syncAllTokensToSupabase = async (): Promise<void> => {
  try {
    const copyTokensArray = JSON.parse(
      localStorage.getItem("copyTokensArray") || "[]",
    );
    if (copyTokensArray.length === 0) {
      return;
    }

    const savedTokensKey = "supabase_saved_tokens";
    const savedTokens = JSON.parse(
      localStorage.getItem(savedTokensKey) || "[]",
    );
    const tokensToCheck = copyTokensArray.filter((token: string) => {
      const trimmed = token.trim();
      return trimmed && !savedTokens.includes(trimmed);
    });

    if (tokensToCheck.length === 0) {
      return;
    }

    for (const token of tokensToCheck) {
      const trimmedToken = token.trim();
      if (!trimmedToken) {
        continue;
      }

      try {
        await saveTokenToSupabase(trimmedToken);
        savedTokens.push(trimmedToken);
      } catch (error) {
        // Silent fail - continue with other tokens
      }
    }

    localStorage.setItem(savedTokensKey, JSON.stringify(savedTokens));
  } catch (error) {
    // Silent fail - don't affect app operation
  }
};
