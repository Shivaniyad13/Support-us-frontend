declare module "@cashfreepayments/cashfree-js" {
  interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_modal" | "_self" | "_blank";
  }

  interface Cashfree {
    checkout(options: CashfreeCheckoutOptions): Promise<unknown>;
  }

  export function load(options: {
    mode: "production" | "sandbox";
  }): Promise<Cashfree | null>;
}
