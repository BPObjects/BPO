// Portail client Stripe (gestion d'abonnement) pour l'utilisateur connecté.
// Env : STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });

/* Origines autorisées : site public + app desktop (schéma bpo://). */
const ORIGINS = new Set(["https://bpobjects.github.io", "bpo://app"]);
const SITE_FALLBACK = Deno.env.get("SITE_URL") || "https://bpobjects.github.io/BPO";
function corsFor(req: Request){
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : "https://bpobjects.github.io",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin"
  };
}
/* URL de retour bornée à notre site (https uniquement). */
function safeReturnUrl(u: unknown): string {
  const s = typeof u === "string" ? u : "";
  const base = "https://bpobjects.github.io";
  if (s === base || s.startsWith(base + "/")) return s;
  return SITE_FALLBACK;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { returnUrl } = await req.json().catch(()=>({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ","");
    if(!token) return new Response(JSON.stringify({error:"non authentifié"}),{status:401,headers:cors});
    const { data:{ user } } = await admin.auth.getUser(token);
    if(!user) return new Response(JSON.stringify({error:"non authentifié"}),{status:401,headers:cors});
    const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id",user.id).single();
    if(!prof?.stripe_customer_id) return new Response(JSON.stringify({error:"aucun abonnement"}),{status:400,headers:cors});
    const ps = await stripe.billingPortal.sessions.create({ customer:prof.stripe_customer_id, return_url: safeReturnUrl(returnUrl) });
    return new Response(JSON.stringify({ url:ps.url }),{headers:{...cors,"Content-Type":"application/json"}});
  }catch(e){
    console.error("create-portal:", e);   /* détail en logs uniquement */
    return new Response(JSON.stringify({error:"Erreur serveur. Réessayez ou contactez le support."}),{status:500,headers:cors});
  }
});
