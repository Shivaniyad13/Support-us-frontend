"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { load } from "@cashfreepayments/cashfree-js";

type Beneficiary = {
  id: string;
  name: string;
  type: "PERSON" | "ORGANIZATION" | "PROGRAM";
  description: string;
};

type OrderResponse = {
  orderId: string;
  paymentSessionId: string;
};

const API_URL = process.env.NEXT_PUBLIC_DONATION_API_URL?.replace(/\/+$/, "");
const PRESETS = [500, 1000, 2500, 5000];

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("Donation service is not configured. Please contact the organization.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json();

  if (!response.ok || result.success !== true) {
    throw new Error(result.error || "We could not complete your request. Please try again.");
  }
  return result as T;
}

export default function GivePage() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [amount, setAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const verifiedOrder = useRef("");

  const selectedBeneficiary = beneficiaries.find(({ id }) => id === beneficiaryId);

  const verifyPayment = useCallback(async (orderId: string) => {
    const response = await requestApi<{
      verified: boolean;
      data?: { beneficiaryName: string };
      status?: string;
    }>(`/donations/${encodeURIComponent(orderId)}/verify`, { method: "POST" });

    if (!response.verified) {
      setError("Your payment is still being confirmed. Please refresh this page in a moment.");
      return;
    }
    setReceipt(`Your donation was confirmed. Thank you for supporting ${response.data?.beneficiaryName || "cancer care"}.`);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    requestApi<{ data: Beneficiary[] }>("/beneficiaries")
      .then(({ data }) => {
        setBeneficiaries(data);
        setBeneficiaryId(data[0]?.id || "");
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Donation options could not be loaded.");
      })
      .finally(() => setLoadingBeneficiaries(false));
  }, []);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    if (!orderId || verifiedOrder.current === orderId) return;
    verifiedOrder.current = orderId;
    verifyPayment(orderId).catch((verifyError: unknown) => {
      setError(verifyError instanceof Error ? verifyError.message : "We could not confirm your payment.");
    });
  }, [verifyPayment]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const donationAmount = Number(customAmount || amount);
    if (!selectedBeneficiary) {
      setError("Please select who or what you would like to support.");
      return;
    }
    if (!Number.isFinite(donationAmount) || donationAmount < 1) {
      setError("Enter a donation amount of at least ₹1.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestApi<{ data: OrderResponse }>("/donations/orders", {
        method: "POST",
        body: JSON.stringify({
          beneficiaryId,
          amount: donationAmount,
          donorName: isAnonymous ? undefined : donorName.trim(),
          donorEmail: donorEmail.trim(),
          donorPhone: donorPhone.trim(),
          isAnonymous,
        }),
      });
      const cashfree = await load({
        mode: process.env.NEXT_PUBLIC_CASHFREE_MODE === "sandbox" ? "sandbox" : "production",
      });
      if (!cashfree) throw new Error("Secure checkout could not be loaded. Please try again.");

      await cashfree.checkout({
        paymentSessionId: result.data.paymentSessionId,
        redirectTarget: "_modal",
      });
      await verifyPayment(result.data.orderId);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Your payment could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="https://cmba.org.in">Cancer Mukt Bharat Abhiyan</a>
          <span className="secure">🔒 Secure donation</span>
        </header>

        <div className="panel">
          <section className="formPanel">
            {receipt ? (
              <div className="receipt" role="status">
                <span className="receiptMark" aria-hidden="true">✓</span>
                <h2>Thank you for giving</h2>
                <p>{receipt}</p>
              </div>
            ) : (
              <>
                <h2>Make a donation</h2>
                <p className="subheading">Choose where you would like your contribution to go.</p>

                <form className="form" onSubmit={handleSubmit}>
                  <div className="field">
                    <label htmlFor="beneficiary">I want to support</label>
                    <select
                      id="beneficiary"
                      className="select"
                      required
                      disabled={loadingBeneficiaries || beneficiaries.length === 0}
                      value={beneficiaryId}
                      onChange={(event) => setBeneficiaryId(event.target.value)}
                    >
                      {loadingBeneficiaries && <option value="">Loading donation options…</option>}
                      {!loadingBeneficiaries && beneficiaries.length === 0 && <option value="">No donation options available</option>}
                      {beneficiaries.map((beneficiary) => (
                        <option key={beneficiary.id} value={beneficiary.id}>
                          {beneficiary.name}
                        </option>
                      ))}
                    </select>
                    {selectedBeneficiary && <p className="hint">{selectedBeneficiary.description}</p>}
                  </div>

                  <fieldset className="fieldset" style={{ border: 0, margin: 0, padding: 0 }}>
                    <legend>Donation amount</legend>
                    <div className="amounts">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset}
                          className={`amount${!customAmount && amount === preset ? " amountSelected" : ""}`}
                          type="button"
                          aria-pressed={!customAmount && amount === preset}
                          onClick={() => { setAmount(preset); setCustomAmount(""); }}
                        >
                          ₹{preset.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>
                    <label className="hint" htmlFor="custom-amount">Or enter another amount</label>
                    <input
                      id="custom-amount"
                      className="input"
                      type="number"
                      min="1"
                      max="9999999999.99"
                      step="1"
                      inputMode="numeric"
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      placeholder="Amount in rupees"
                    />
                  </fieldset>

                  <div className="field">
                    <label htmlFor="donor-name">Your name</label>
                    <input
                      id="donor-name"
                      className="input"
                      autoComplete="name"
                      required={!isAnonymous}
                      disabled={isAnonymous}
                      value={donorName}
                      onChange={(event) => setDonorName(event.target.value)}
                      placeholder="Full name"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="donor-email">Email address</label>
                    <input
                      id="donor-email"
                      className="input"
                      type="email"
                      autoComplete="email"
                      required
                      value={donorEmail}
                      onChange={(event) => setDonorEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="donor-phone">Mobile number</label>
                    <input
                      id="donor-phone"
                      className="input"
                      type="tel"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      pattern="[6-9][0-9]{9}"
                      maxLength={10}
                      required
                      value={donorPhone}
                      onChange={(event) => setDonorPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit Indian mobile number"
                    />
                  </div>

                  <label className="anonymous">
                    <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
                    Keep my name anonymous
                  </label>

                  {error && <p className="notice error" role="alert">{error}</p>}

                  <button className="submit" type="submit" disabled={submitting || loadingBeneficiaries || beneficiaries.length === 0}>
                    {submitting ? "Preparing secure checkout…" : `Donate ₹${Number(customAmount || amount).toLocaleString("en-IN")}`}
                  </button>
                  <p className="hint" style={{ textAlign: "center" }}>
                    Continuing opens Cashfree's secure payment checkout.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
        <footer className="footer">
          Payments are processed securely. Your card and payment details are never stored here.
        </footer>
      </div>
    </main>
  );
}
