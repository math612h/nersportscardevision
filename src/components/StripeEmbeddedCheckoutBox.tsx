import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCallback } from "react";
import { getStripe } from "@/lib/stripe";

export function StripeEmbeddedCheckoutBox({
  fetchClientSecret,
}: {
  fetchClientSecret: () => Promise<string>;
}) {
  const stable = useCallback(fetchClientSecret, [fetchClientSecret]);
  return (
    <div id="checkout" className="rounded-lg border bg-background p-2">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: stable }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
