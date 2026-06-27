// Crée une session Stripe Checkout (abonnement annuel) pour l'utilisateur connecté.
// Variables d'env (Supabase > Edge Functions > Secrets) :
//   STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
    if(!user) return new Response(JSON.stringify({error:"non authentifié"}),{status:401,headers:cors});

    const { data: prof } = await admin.from("profiles").select("stripe_customer_id,email").eq("id",user.id).single();
    let customer = prof?.stripe_customer_id;
    if(!customer){
      const c = await stripe.customers.create({ email:user.email!, metadata:{ user_id:user.id } });
      customer = c.id;
      await admin.from("profiles").update({ stripe_customer_id:customer }).eq("id",user.id);
    }
    const base = returnUrl || (Deno.env.get("SITE_URL") ?? "");
    const session = await stripe.checkout.sessions.create({
      mode:"subscription", customer,
      line_items:[{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity:1 }],
      allow_promotion_codes:true,
      success_url: base+"?paid=1",
      cancel_url:  base,
      metadata:{ user_id:user.id }
    });
    return new Response(JSON.stringify({ url:session.url }),{headers:{...cors,"Content-Type":"application/json"}});
  }catch(e){ return new Response(JSON.stringify({error:String(e?.message||e)}),{status:500,headers:cors}); }
});
