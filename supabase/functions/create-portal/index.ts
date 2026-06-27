import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, content-type" };
Deno.serve(async (req) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { returnUrl } = await req.json().catch(()=>({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")!.replace("Bearer ","");
    const { data:{ user } } = await admin.auth.getUser(token);
    const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id",user!.id).single();
    if(!prof?.stripe_customer_id) return new Response(JSON.stringify({error:"aucun abonnement"}),{status:400,headers:cors});
    const ps = await stripe.billingPortal.sessions.create({ customer:prof.stripe_customer_id, return_url: returnUrl || Deno.env.get("SITE_URL") });
    return new Response(JSON.stringify({ url:ps.url }),{headers:{...cors,"Content-Type":"application/json"}});
  }catch(e){ return new Response(JSON.stringify({error:String(e?.message||e)}),{status:500,headers:cors}); }
});
