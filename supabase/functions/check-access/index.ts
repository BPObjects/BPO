// Vérifie CÔTÉ SERVEUR que l'utilisateur a accès (abonné actif ou essai en cours).
// Utilisé par les exports DQE de meuble.html : retirer le paywall du DOM ne
// suffit plus, la décision est prise ici avec la base comme source de vérité.
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Origines autorisées : site public + app desktop (schéma bpo://). */
const ORIGINS = new Set(["https://bpobjects.github.io", "bpo://app"]);
function corsFor(req: Request){
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : "https://bpobjects.github.io",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ","");
    if(!token) return new Response(JSON.stringify({access:false}),{status:401,headers:cors});
    const { data:{ user } } = await admin.auth.getUser(token);
    if(!user) return new Response(JSON.stringify({access:false}),{status:401,headers:cors});
    const { data: prof } = await admin.from("profiles").select("plan,trial_ends_at").eq("id",user.id).single();
    const access = prof?.plan === "active" ||
                   (!!prof?.trial_ends_at && new Date(prof.trial_ends_at).getTime() > Date.now());
    return new Response(JSON.stringify({ access }),{headers:cors});
  }catch(e){
    console.error("check-access:", e);   /* détail en logs uniquement */
    return new Response(JSON.stringify({access:false, error:"Erreur serveur"}),{status:500,headers:cors});
  }
});
