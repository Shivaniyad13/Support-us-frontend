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
const VALID_NAME = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;
const VALID_INDIAN_PHONE = /^[6-9]\d{9}$/;

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
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
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

  async function handleScreenshotUpload() {
    if (!paymentScreenshot) {
      setError("Please select a screenshot file to upload.");
      return;
    }

    setScreenshotUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("screenshot", paymentScreenshot);

      const response = await fetch(`${API_URL}/donations/upload-screenshot`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Screenshot upload failed. Please try again.");
      }

      setReceipt("Screenshot uploaded successfully. Your payment will be verified manually.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Screenshot upload failed. Please try again.");
    } finally {
      setScreenshotUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const donationAmount = Number(customAmount);
    if (!selectedBeneficiary) {
      setError("Please select who or what you would like to support.");
      return;
    }
    if (!privacyAccepted) {
      setError("Please read and accept the Donation Privacy Notice before continuing.");
      return;
    }
    if (!customAmount || !Number.isFinite(donationAmount) || donationAmount < 1) {
      setError("Enter a donation amount of at least ₹1.");
      return;
    }
    if (!isAnonymous && !VALID_NAME.test(donorName.trim())) {
      setError("Enter a valid name using letters only.");
      return;
    }
    if (!VALID_INDIAN_PHONE.test(donorPhone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
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
          privacyConsent: privacyAccepted,
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
          <a className="brand" href="https://cmba.org.in">Support</a>
          <span className="secure">🔒 Secure donation</span>
        </header>

        <div className="panel">
          <section className="formPanel">
            {receipt ? (
              <div className="receipt" role="status">
                <span className="receiptMark" aria-hidden="true">✓</span>
                <h2>Thank you for giving</h2>
                <p>{receipt}</p>
                <button
                  onClick={() => {
                    setReceipt("");
                    window.history.replaceState({}, "", window.location.pathname);
                  }}
                  className="submit"
                  style={{ marginTop: "16px" }}
                >
                  Make another donation
                </button>
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
                    <label className="hint" htmlFor="custom-amount">Enter donation amount (₹)</label>
                    <input
                      id="custom-amount"
                      className="input"
                      type="number"
                      min="1"
                      max="9999999999.99"
                      step="1"
                      inputMode="numeric"
                      required
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      placeholder="Amount in rupees"
                    />
                  </fieldset>

                  <div className="donorDetails">
                    <div className="field">
                      <label htmlFor="donor-name">Your name</label>
                      <input
                        id="donor-name"
                        className="input"
                        autoComplete="name"
                        maxLength={90}
                        required={!isAnonymous}
                        disabled={isAnonymous}
                        value={donorName}
                        onChange={(event) => setDonorName(event.target.value.replace(/[^\p{L}\p{M}\s.'-]/gu, ""))}
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
                  </div>

                  <div className="contactRow">
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
                  </div>

                  {/* --- PUBLIC QR CODE & UPI ID SECTION --- */}
                  <div className="publicQRCodeSection" style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8, background: "#fafafa" }}>
                    <h3 style={{ marginTop: 0, marginBottom: 8 }}>Direct UPI Payment</h3>
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=49122452@sbi&pn=Support%20Donation"
                        alt="UPI QR Code"
                        width={150}
                        height={150}
                        style={{ border: "1px solid #eee", borderRadius: 8 }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 14 }}>Scan this QR code with any UPI app</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>UPI ID: 49122452@sbi</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText("49122452@sbi");
                              alert("UPI ID copied to clipboard!");
                            }}
                            style={{
                              padding: "4px 12px",
                              fontSize: 12,
                              background: "#e0e0e0",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* --- SCREENSHOT UPLOAD SECTION --- */}
                    <div style={{ marginTop: 16 }}>
                      <h4 style={{ marginBottom: 8 }}>Upload Payment Screenshot</h4>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPaymentScreenshot(e.target.files?.[0] || null)}
                        style={{ marginBottom: 8 }}
                      />
                      <button
                        type="button"
                        onClick={handleScreenshotUpload}
                        disabled={screenshotUploading || !paymentScreenshot}
                        style={{
                          padding: "8px 16px",
                          background: "#0070f3",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        {screenshotUploading ? "Uploading…" : "Upload Screenshot"}
                      </button>
                      {paymentScreenshot && (
                        <p style={{ marginTop: 4, fontSize: 12 }}>
                          Selected: {paymentScreenshot.name}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* --- END PUBLIC QR CODE & UPI ID SECTION --- */}

                  <label className="privacyConsent">
                    <input
                      type="checkbox"
                      required
                      checked={privacyAccepted}
                      onChange={(event) => setPrivacyAccepted(event.target.checked)}
                    />
                    <span>
                      I have read and agree to the{" "}
                      <a href="/privacy-notice" target="_blank" rel="noopener noreferrer">
                        Donation Privacy Notice
                      </a>
                      . You must accept it before continuing.
                    </span>
                  </label>

                  {error && <p className="notice error" role="alert">{error}</p>}

                  <button className="submit" type="submit" disabled={submitting || !privacyAccepted || loadingBeneficiaries || beneficiaries.length === 0}>
                    {submitting ? "Preparing secure checkout…" : customAmount ? `Donate ₹${Number(customAmount).toLocaleString("en-IN")}` : "Donate"}
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