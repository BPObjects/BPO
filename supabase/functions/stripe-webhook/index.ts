// Webhook Stripe : met à jour l'abonnement en base. Endpoint à déclarer côté Stripe.
// Env : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });
const admin  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WHSEC  = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

async function setByCustomer(customerId: string, fields: Record<string, unknown>){
  await admin.from("profiles").update(fields).eq("stripe_customer_id", customerId);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let evt: Stripe.Event;
  try{ evt = await stripe.webhooks.constructEventAsync(body, sig, WHSEC); }
  catch(e){ return new Response("signature invalide: "+e, { status:400 }); }

  try{
    switch(evt.type){
      case "checkout.session.completed": {
        const s = evt.data.object as Stripe.Checkout.Session;
        if(s.subscription){
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          await setByCustomer(s.customer as string, {
            plan:"active", subscription_status:sub.status, stripe_subscription_id:sub.id,
            current_period_end:new Date(sub.current_period_end*1000).toISOString()
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = evt.data.object as Stripe.Subscription;
        const ok = sub.status==="active" || sub.status==="trialing";
        await setByCustomer(sub.customer as string, {
          plan: ok? "active" : (sub.status==="past_due"?"active":"expired"),
          subscription_status:sub.status, stripe_subscription_id:sub.id,
          current_period_end:new Date(sub.current_period_end*1000).toISOString()
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = evt.data.object as Stripe.Subscription;
        await setByCustomer(sub.customer as string, { plan:"canceled", subscription_status:"canceled" });
        break;
      }
    }
    return new Response("ok", { status:200 });
  }catch(e){ return new Response("err: "+e, { status:500 }); }
});
