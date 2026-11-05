"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type BeneficiaryType = "PERSON" | "ORGANIZATION" | "PROGRAM";

type Beneficiary = {
  id: string;
  name: string;
  slug: string;
  type: BeneficiaryType;
  description: string;
  isActive: boolean;
  sortOrder: number;
};

type Donation = {
  id: string;
  orderId: string;
  beneficiaryName: string;
  donorName: string | null;
  donorEmail: string;
  donorPhone: string;
  amount: number;
  currency: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  isAnonymous: boolean;
  createdAt: string;
};

type DonationPage = {
  donations: Donation[];
  page: number;
  limit: number;
  total: number;
};

type BeneficiaryForm = {
  name: string;
  type: BeneficiaryType;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_DONATION_API_URL?.replace(/\/+$/, "");
const emptyForm: BeneficiaryForm = {
  name: "",
  type: "ORGANIZATION",
  description: "",
  sortOrder: 0,
  isActive: true,
};

async function requestApi<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("Donation service is not configured. Please contact the organization.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": key,
      ...init?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || "The request could not be completed.");
  }
  return result as T;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState<"donations" | "beneficiaries">("donations");
  const [donations, setDonations] = useState<DonationPage | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<BeneficiaryForm>(emptyForm);

  useEffect(() => {
    const savedKey = window.sessionStorage.getItem("support-us-admin-key");
    if (savedKey) setAdminKey(savedKey);
  }, []);

  const loadDashboard = useCallback(async (key: string, currentPage: number) => {
    setLoading(true);
    setError("");
    try {
      const [donationResult, beneficiaryResult] = await Promise.all([
        requestApi<{ data: DonationPage }>(`/admin/donations?page=${currentPage}&limit=50`, key),
        requestApi<{ data: Beneficiary[] }>("/admin/beneficiaries", key),
      ]);
      setDonations(donationResult.data);
      setBeneficiaries(beneficiaryResult.data);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Admin data could not be loaded.";
      setError(message);
      if (message === "Admin authentication failed.") {
        window.sessionStorage.removeItem("support-us-admin-key");
        setAdminKey("");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) void loadDashboard(adminKey, page);
  }, [adminKey, page, loadDashboard]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await requestApi("/admin/donations?page=1&limit=1", keyInput);
      window.sessionStorage.setItem("support-us-admin-key", keyInput);
      setPage(1);
      setAdminKey(keyInput);
      setKeyInput("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Admin sign-in failed.");
    }
  }

  function logout() {
    window.sessionStorage.removeItem("support-us-admin-key");
    setAdminKey("");
    setDonations(null);
    setBeneficiaries([]);
  }

  function beginCreate() {
    setEditingId("");
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function beginEdit(beneficiary: Beneficiary) {
    setEditingId(beneficiary.id);
    setForm({
      name: beneficiary.name,
      type: beneficiary.type,
      description: beneficiary.description,
      sortOrder: beneficiary.sortOrder,
      isActive: beneficiary.isActive,
    });
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  async function saveBeneficiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await requestApi(
        editingId ? `/admin/beneficiaries/${editingId}` : "/admin/beneficiaries",
        adminKey,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(form),
        },
      );
      setFormOpen(false);
      setNotice(editingId ? "Recipient updated." : "Recipient added.");
      await loadDashboard(adminKey, page);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Recipient could not be saved.");
    }
  }

  async function deactivateBeneficiary(beneficiary: Beneficiary) {
    if (!window.confirm(`Deactivate ${beneficiary.name}? It will no longer appear on the donation form.`)) return;
    setError("");
    setNotice("");
    try {
      await requestApi(`/admin/beneficiaries/${beneficiary.id}`, adminKey, { method: "DELETE" });
      setNotice("Recipient deactivated.");
      await loadDashboard(adminKey, page);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Recipient could not be deactivated.");
    }
  }

  return (
    <main className="page">
      <div className="adminShell">
        <header className="topbar">
          <a className="brand" href="/">Cancer Mukt Bharat Abhiyan</a>
          <a className="secure" href="/">View donation form</a>
        </header>

        {!adminKey ? (
          <section className="adminLogin adminPanel">
            <h1>Admin sign in</h1>
            <p className="subheading">Enter the admin key configured on the backend to view donations and manage recipients.</p>
            <form className="form" onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="admin-key">Admin key</label>
                <input
                  id="admin-key"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                />
              </div>
              {error && <p className="notice error" role="alert">{error}</p>}
              <button className="submit" type="submit">Sign in</button>
            </form>
          </section>
        ) : (
          <section className="adminPanel">
            <div className="adminToolbar">
              <div>
                <h1>Donation administration</h1>
                <p className="hint">Review donor records and manage the public donation options.</p>
              </div>
              <button className="adminSecondary" type="button" onClick={logout}>Sign out</button>
            </div>

            <div className="adminTabs" role="tablist" aria-label="Admin sections">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "donations"}
                className={`adminTab${tab === "donations" ? " adminTabActive" : ""}`}
                onClick={() => setTab("donations")}
              >
                Donations
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "beneficiaries"}
                className={`adminTab${tab === "beneficiaries" ? " adminTabActive" : ""}`}
                onClick={() => setTab("beneficiaries")}
              >
                Donation recipients
              </button>
            </div>

            {error && <p className="notice error" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            {loading && <p className="hint">Loading admin data…</p>}

            {tab === "donations" && (
              <>
                <h2>Donations</h2>
                <div className="adminTableWrap">
                  <table className="adminTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Donor</th>
                        <th>Contact</th>
                        <th>Recipient</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donations?.donations.map((donation) => (
                        <tr key={donation.id}>
                          <td>{new Date(donation.createdAt).toLocaleString("en-IN")}</td>
                          <td>{donation.isAnonymous ? "Anonymous" : donation.donorName || "—"}</td>
                          <td>{donation.donorEmail}<br />{donation.donorPhone}</td>
                          <td>{donation.beneficiaryName}</td>
                          <td>{donation.currency} {donation.amount.toLocaleString("en-IN")}</td>
                          <td>
                            <span className={`adminStatus${donation.status === "FAILED" ? " adminStatusFailed" : ""}`}>
                              {donation.status}
                            </span>
                          </td>
                          <td>{donation.orderId}</td>
                        </tr>
                      ))}
                      {!loading && donations?.donations.length === 0 && (
                        <tr><td colSpan={7}>No donations have been recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {donations && (
                  <div className="adminPagination">
                    <span>{donations.total} donation{donations.total === 1 ? "" : "s"}</span>
                    <div className="adminActions">
                      <button
                        className="adminSecondary"
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((current) => current - 1)}
                      >
                        Previous
                      </button>
                      <span>Page {page} of {Math.max(1, Math.ceil(donations.total / donations.limit))}</span>
                      <button
                        className="adminSecondary"
                        type="button"
                        disabled={page >= Math.ceil(donations.total / donations.limit) || loading}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === "beneficiaries" && (
              <>
                <div className="adminToolbar">
                  <div>
                    <h2>Donation recipients</h2>
                    <p className="hint">Active recipients appear in the public donation form.</p>
                  </div>
                  <button className="submit" type="button" onClick={beginCreate}>Add recipient</button>
                </div>

                {formOpen && (
                  <form className="adminPanel" onSubmit={saveBeneficiary}>
                    <h2>{editingId ? "Edit recipient" : "Add recipient"}</h2>
                    <div className="adminGrid">
                      <div className="field">
                        <label htmlFor="recipient-name">Name</label>
                        <input
                          id="recipient-name"
                          className="input"
                          required
                          maxLength={120}
                          value={form.name}
                          onChange={(event) => setForm({ ...form, name: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="recipient-type">Type</label>
                        <select
                          id="recipient-type"
                          className="select"
                          value={form.type}
                          onChange={(event) => setForm({ ...form, type: event.target.value as BeneficiaryType })}
                        >
                          <option value="ORGANIZATION">Organization</option>
                          <option value="PROGRAM">Program</option>
                          <option value="PERSON">Person</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="recipient-description">Description</label>
                        <textarea
                          id="recipient-description"
                          className="input adminTextarea"
                          required
                          maxLength={1000}
                          value={form.description}
                          onChange={(event) => setForm({ ...form, description: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="recipient-order">Display order</label>
                        <input
                          id="recipient-order"
                          className="input"
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          required
                          value={form.sortOrder}
                          onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                        />
                      </div>
                      {editingId && (
                        <label className="anonymous">
                          <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                          />
                          Active on donation form
                        </label>
                      )}
                    </div>
                    <div className="adminActions">
                      <button className="submit" type="submit">Save recipient</button>
                      <button className="adminSecondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
                    </div>
                  </form>
                )}

                <div className="adminTableWrap">
                  <table className="adminTable">
                    <thead>
                      <tr><th>Recipient</th><th>Type</th><th>Description</th><th>Order</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {beneficiaries.map((beneficiary) => (
                        <tr key={beneficiary.id}>
                          <td>{beneficiary.name}</td>
                          <td>{beneficiary.type}</td>
                          <td>{beneficiary.description}</td>
                          <td>{beneficiary.sortOrder}</td>
                          <td>
                            <span className={`adminStatus${beneficiary.isActive ? "" : " adminStatusInactive"}`}>
                              {beneficiary.isActive ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </td>
                          <td>
                            <div className="adminActions">
                              <button className="adminSecondary" type="button" onClick={() => beginEdit(beneficiary)}>Edit</button>
                              {beneficiary.isActive && (
                                <button className="adminDanger" type="button" onClick={() => void deactivateBeneficiary(beneficiary)}>
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!loading && beneficiaries.length === 0 && (
                        <tr><td colSpan={6}>No recipients configured.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
