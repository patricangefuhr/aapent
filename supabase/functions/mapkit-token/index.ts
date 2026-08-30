// Supabase Edge Function: signerer kortlevd MapKit JS-token (ES256).
// Privatnøkkelen (.p8) ligger som function-secret — aldri i klient/repo.
// Deploy PUBLIC (uten JWT-verifisering): supabase functions deploy mapkit-token --no-verify-jwt
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

let cache: { token: string; exp: number } | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const teamId = Deno.env.get("APPLE_TEAM_ID");
    const keyId = Deno.env.get("APPLE_KEY_ID");
    const p8 = Deno.env.get("APPLE_P8");
    const origin = Deno.env.get("APPLE_ORIGIN") || ""; // f.eks. https://app.dittdomene.no
    if (!teamId || !keyId || !p8) throw new Error("mangler APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_P8");

    const now = Math.floor(Date.now() / 1000);
    if (cache && cache.exp - now > 120) {
      return new Response(cache.token, { headers: { ...cors, "content-type": "text/plain" } });
    }
    const key = await importPKCS8(p8, "ES256");
    const exp = now + 1800; // 30 min
    const token = await new SignJWT(origin ? { origin } : {})
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);
    cache = { token, exp };
    return new Response(token, {
      headers: { ...cors, "content-type": "text/plain", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response("mapkit-token feil: " + (e as Error).message, { status: 500, headers: cors });
  }
});
