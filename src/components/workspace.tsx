"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { money, statusLabels, type Quote, type AxisStatus } from "@/lib/quotes";
import { Icon, type IconName } from "./icon";
import { QuoteEditor } from "./quote-editor";
import { QuoteDetail, StatusBadge } from "./quote-detail";

type View = "quotes" | "orders" | "customers" | "integrations";
const NAV: { view: View; title: string; icon: IconName }[] = [
  { view: "quotes", title: "Quotes", icon: "quote" },
  { view: "orders", title: "Orders", icon: "orders" },
  { view: "customers", title: "Customers", icon: "users" },
];
const FILTERS = [
  { key: "all", label: "All quotes" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Awaiting response" },
  { key: "accepted", label: "Accepted" },
  { key: "submitted", label: "Submitted" },
];
const AXIS_GUIDE =
  "https://keysoftwaresystems.atlassian.net/wiki/spaces/XKB/pages/595689546/AXIS+-+Connecting+with+your+Partner";

function StatCard({
  label,
  value,
  icon,
  color,
  caption,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  color: string;
  caption: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{caption}</p>
    </div>
  );
}
function downloadCsv(quotes: Quote[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "REF",
      "Customer",
      "Email",
      "Account",
      "Pickup city",
      "Delivery city",
      "Amount (USD)",
      "Status",
      "Xcelerator order",
      "Created",
    ],
    ...quotes.map((q) => [
      q.ref,
      q.customer,
      q.email,
      q.accountNo,
      q.pickup.city,
      q.delivery.city,
      (q.totalCents / 100).toFixed(2),
      statusLabels[q.status],
      q.orderTrackingId,
      q.createdAt,
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF", rows.map((row) => row.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "quote-engine-quotes.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workspace() {
  const [quotes, setQuotes] = useState<Quote[]>([]),
    [axis, setAxis] = useState<AxisStatus>({ configured: false, host: null });
  const [view, setView] = useState<View>("quotes"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null),
    [editor, setEditor] = useState<Quote | null | undefined>(undefined);
  const [toast, setToast] = useState(""),
    [testing, setTesting] = useState(false),
    [testResult, setTestResult] = useState<{
      ok: boolean;
      message: string;
    } | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [quotesResponse, axisResponse] = await Promise.all([
        fetch("/api/quotes", { cache: "no-store", signal }),
        fetch("/api/integrations/axis", { cache: "no-store", signal }),
      ]);
      if (!quotesResponse.ok || !axisResponse.ok)
        throw new Error("Could not load the workspace. Refresh to try again.");
      const [quoteData, axisData] = await Promise.all([
        quotesResponse.json(),
        axisResponse.json(),
      ]);
      setQuotes(quoteData.quotes);
      setAxis(axisData);
      setLoadError("");
    } catch (error) {
      if (!signal?.aborted)
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load the workspace.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref)
      Promise.resolve().then(() => {
        if (!controller.signal.aborted) setSelectedRef(ref);
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function navigate(next: View) {
    setView(next);
    setQuery("");
    setFilter("all");
  }
  function select(ref: string | null) {
    setSelectedRef(ref);
    const url = new URL(window.location.href);
    if (ref) url.searchParams.set("ref", ref);
    else url.searchParams.delete("ref");
    window.history.replaceState(null, "", url);
  }
  function saved(quote: Quote) {
    setQuotes((items) =>
      [quote, ...items.filter((item) => item.ref !== quote.ref)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
    setEditor(undefined);
    select(quote.ref);
    setToast(`${quote.ref} saved to your workspace`);
  }
  async function action(
    quote: Quote,
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<Quote> {
    const response = await fetch(
      `/api/quotes/${encodeURIComponent(quote.ref)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version: quote.version, ...extra }),
      },
    );
    const body = await response.json();
    if (!response.ok) {
      await refresh();
      throw new Error(body.error || "The action could not be completed.");
    }
    setQuotes((items) =>
      items.map((item) => (item.ref === body.quote.ref ? body.quote : item)),
    );
    setToast(
      action === "submit"
        ? `Order ${body.quote.orderTrackingId} submitted to Xcelerator`
        : action === "accept"
          ? `Customer acceptance saved for ${quote.ref}`
          : action === "sent"
            ? `${quote.ref} marked as sent`
            : action === "revise"
              ? `${quote.ref} reopened as a draft`
              : `${quote.ref} reconciled with Xcelerator`,
    );
    return body.quote;
  }
  async function testAxis() {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/integrations/axis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setTestResult({
        ok: true,
        message:
          "Connection verified. Axis authenticated successfully. No order was created.",
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  }
  const accepted = quotes.filter((q) =>
      ["accepted", "submitting", "review"].includes(q.status),
    ),
    submitted = quotes.filter((q) => q.status === "submitted");
  const selected = quotes.find((q) => q.ref === selectedRef),
    search = query.trim().toLowerCase();
  const visible = quotes
    .filter((q) => {
      if (view === "orders" && q.status !== "submitted") return false;
      if (
        view === "quotes" &&
        filter !== "all" &&
        (filter === "accepted"
          ? !["accepted", "submitting", "review"].includes(q.status)
          : q.status !== filter)
      )
        return false;
      return (
        !search ||
        [
          q.ref,
          q.customer,
          q.email,
          q.accountNo,
          q.orderTrackingId,
          q.pickup.city,
          q.delivery.city,
        ].some((value) => value?.toLowerCase().includes(search))
      );
    })
    .sort((a, b) =>
      sort === "amount"
        ? b.totalCents - a.totalCents
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  const customers = Object.values(
    quotes.reduce<
      Record<
        string,
        {
          name: string;
          email: string;
          accountNo: string;
          count: number;
          total: number;
        }
      >
    >((result, q) => {
      const key = `${q.accountNo.toLowerCase()}|${q.customer.toLowerCase()}`;
      const c = (result[key] ||= {
        name: q.customer,
        email: q.email,
        accountNo: q.accountNo,
        count: 0,
        total: 0,
      });
      c.count++;
      c.total += q.totalCents;
      return result;
    }, {}),
  ).filter(
    (c) =>
      !search ||
      [c.name, c.email, c.accountNo].some((value) =>
        value.toLowerCase().includes(search),
      ),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Quote Engine home">
          <span className="brand-mark">
            q<span />
          </span>
          <span>
            quote<span className="brand-light">engine</span>
            <small>QUOTE. ACCEPT. DELIVER.</small>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <Icon name="grid" size={16} />
          </span>
          <div>
            Operations workspace<small>Your quotes, connected.</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.view}
              onClick={() => navigate(item.view)}
              className={`nav-item ${view === item.view ? "active" : ""}`}
              aria-current={view === item.view ? "page" : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.title}</span>
              {item.view === "quotes" ? (
                <span className="nav-count">{quotes.length}</span>
              ) : item.view === "orders" && submitted.length ? (
                <span className="nav-count">{submitted.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <span className="nav-label tools-label">TOOLS</span>
        <button
          className={`nav-item ${view === "integrations" ? "active" : ""}`}
          onClick={() => navigate("integrations")}
          aria-current={view === "integrations" ? "page" : undefined}
        >
          <Icon name="link" size={19} />
          <span>Integrations</span>
          <span
            className={`connection-dot ${axis.configured ? "configured" : ""}`}
          />
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <span className="sidebar-card-icon">
              <Icon name="route" size={23} />
            </span>
            <strong>
              Less retyping.
              <br />
              More moving.
            </strong>
            <p>From the first quote to the final order. One workspace.</p>
            <button onClick={() => navigate("integrations")}>
              Connect with Axis
              <Icon name="arrow" size={15} />
            </button>
          </div>
          <a
            href={AXIS_GUIDE}
            target="_blank"
            rel="noreferrer"
            className="help-link"
          >
            <Icon name="help" size={17} />
            Connection guide
            <Icon name="external" size={13} />
          </a>
          <div className="workspace-user">
            <span>OP</span>
            <div>
              Operations<small>Quoting & order entry</small>
            </div>
            <Icon name="shield" size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <Icon name="grid" size={17} />
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>
              {view === "quotes"
                ? "Quotes"
                : view === "orders"
                  ? "Orders"
                  : view === "customers"
                    ? "Customers"
                    : "Integrations"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" />
            <span>One tool. Quote to order.</span>
            <span className="mini-avatar">OP</span>
          </div>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="heading-kicker">
                A CLEAR PATH FROM QUOTE TO ORDER
              </div>
              <h1>
                {view === "quotes"
                  ? "Quotes"
                  : view === "orders"
                    ? "Orders"
                    : view === "customers"
                      ? "Customers"
                      : "Integrations"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "quotes"
                  ? "Every quote, saved. Every next step, in one place."
                  : view === "orders"
                    ? "Accepted quotes, handed over to Xcelerator through Axis."
                    : view === "customers"
                      ? "The customers behind your quotes, all together."
                      : "Connect your quoting workspace to the tools that keep you moving."}
              </p>
            </div>
            {view !== "integrations" ? (
              <button
                className="button primary new-quote"
                onClick={() => setEditor(null)}
              >
                <Icon name="plus" size={18} />
                New quote
              </button>
            ) : null}
          </div>
          {loadError ? (
            <div className="notice error" role="alert">
              {loadError}
              <button className="text-button" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          ) : null}
          {view === "quotes" || view === "orders" ? (
            <>
              <section className="stats-grid" aria-label="Workspace summary">
                <StatCard
                  label="Total quoted"
                  value={money(
                    quotes.reduce((sum, q) => sum + q.totalCents, 0),
                  )}
                  icon="dollar"
                  color="blue"
                  caption={`${quotes.length} saved quote${quotes.length === 1 ? "" : "s"} in your workspace`}
                />
                <StatCard
                  label="Awaiting response"
                  value={quotes.filter((q) => q.status === "sent").length}
                  icon="clock"
                  color="amber"
                  caption="Sent and with your customers"
                />
                <StatCard
                  label="Accepted quotes"
                  value={accepted.length}
                  icon="check"
                  color="green"
                  caption="Ready for the next step"
                />
                <StatCard
                  label="Orders submitted"
                  value={submitted.length}
                  icon="orders"
                  color="purple"
                  caption="Passed through Axis to Xcelerator"
                />
              </section>
              <section className="workflow-banner">
                <div className="workflow-intro">
                  <span className="workflow-icon">
                    <Icon name="route" size={22} />
                  </span>
                  <div>
                    <strong>A quote today. An order next.</strong>
                    <p>Keep the same REF. Leave the double entry behind.</p>
                  </div>
                </div>
                <div className="workflow-steps">
                  <span>
                    <span className="step-circle">
                      <Icon name="quote" size={13} />
                    </span>
                    Save quote
                  </span>
                  <Icon name="arrow" size={15} />
                  <span>
                    <span className="step-circle">
                      <Icon name="check" size={13} />
                    </span>
                    Customer accepts
                  </span>
                  <Icon name="arrow" size={15} />
                  <span>
                    <span className="step-circle step-last">
                      <Icon name="orders" size={13} />
                    </span>
                    Submit order
                  </span>
                </div>
                <button
                  className={`axis-pill ${axis.configured ? "ready" : ""}`}
                  onClick={() => navigate("integrations")}
                >
                  <span />
                  Axis {axis.configured ? "configured" : "setup required"}
                  <Icon name="chevron" size={12} />
                </button>
              </section>
              <section className="quotes-panel">
                <header className="panel-heading">
                  <div>
                    <h2>
                      {view === "orders" ? "Submitted orders" : "Your quotes"}
                    </h2>
                    <span>
                      {view === "orders"
                        ? "A complete trail from REF to order number."
                        : "Your next delivery starts here."}
                    </span>
                  </div>
                  <button
                    className="button secondary export-button"
                    onClick={() => downloadCsv(visible)}
                    disabled={!visible.length}
                  >
                    <Icon name="download" size={16} />
                    Export
                  </button>
                </header>
                {view === "quotes" ? (
                  <div
                    className="filter-tabs"
                    aria-label="Filter quotes by status"
                  >
                    {FILTERS.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setFilter(item.key)}
                        className={filter === item.key ? "selected" : ""}
                        aria-pressed={filter === item.key}
                      >
                        {item.label}
                        <span>
                          {item.key === "all"
                            ? quotes.length
                            : item.key === "accepted"
                              ? accepted.length
                              : quotes.filter((q) => q.status === item.key)
                                  .length}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="table-toolbar">
                  <label className="search-field">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Search quotes"
                      placeholder={
                        view === "orders"
                          ? "Search REF, customer, or order number…"
                          : "Search by REF, customer, or account…"
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query ? (
                      <button
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    ) : null}
                  </label>
                  <div className="sort-controls">
                    <label>
                      <Icon name="filter" size={16} />
                      <span className="sr-only">Sort quotes</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="amount">Highest amount</option>
                      </select>
                    </label>
                    <button
                      className="icon-button refresh-button"
                      aria-label="Refresh quotes"
                      onClick={() => {
                        setLoading(true);
                        void refresh();
                      }}
                      disabled={loading}
                    >
                      <Icon
                        name="refresh"
                        size={16}
                        className={loading ? "spin" : ""}
                      />
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="quotes-table">
                    <thead>
                      <tr>
                        <th>REF NUMBER</th>
                        <th>CUSTOMER</th>
                        <th>ROUTE</th>
                        <th>SERVICE</th>
                        <th className="amount-column">QUOTE AMOUNT</th>
                        <th>
                          {view === "orders" ? "XCELERATOR ORDER" : "STATUS"}
                        </th>
                        <th>
                          <span className="sr-only">Open quote</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loading && !loadError
                        ? visible.map((q) => (
                            <tr key={q.ref}>
                              <td>
                                <button
                                  className="ref-button"
                                  onClick={() => select(q.ref)}
                                >
                                  {q.ref}
                                </button>
                                <span className="cell-secondary">
                                  {new Date(q.createdAt).toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </span>
                              </td>
                              <td>
                                <div className="customer-cell">
                                  <span className="customer-avatar small">
                                    {q.customer.slice(0, 2).toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>{q.customer}</strong>
                                    <span className="cell-secondary">
                                      {q.email ||
                                        (q.accountNo
                                          ? `Account ${q.accountNo}`
                                          : "Email not added")}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className="table-route">
                                  <span>
                                    {q.pickup.city || "Pickup not added"}
                                  </span>
                                  <Icon name="arrow" size={13} />
                                  <span>
                                    {q.delivery.city || "Delivery not added"}
                                  </span>
                                </div>
                                <span className="cell-secondary">
                                  {q.pieces} {q.packageType || "package"}
                                  {q.pieces === 1 ? "" : "s"} · {q.weight} lb
                                </span>
                              </td>
                              <td>
                                <strong className="service-name">
                                  {q.service || "Not selected"}
                                </strong>
                                <span className="cell-secondary">
                                  {q.vehicle || "Vehicle not selected"}
                                </span>
                              </td>
                              <td className="amount-column">
                                <strong className="quote-amount">
                                  {money(q.totalCents)}
                                </strong>
                                <span className="cell-secondary">USD</span>
                              </td>
                              <td>
                                {view === "orders" ? (
                                  <strong className="tracking-id">
                                    {q.orderTrackingId}
                                  </strong>
                                ) : (
                                  <StatusBadge status={q.status} />
                                )}
                              </td>
                              <td>
                                <button
                                  className="row-open"
                                  onClick={() => select(q.ref)}
                                  aria-label={`Open ${q.ref}`}
                                >
                                  <Icon name="chevron" size={17} />
                                </button>
                              </td>
                            </tr>
                          ))
                        : null}
                    </tbody>
                  </table>
                </div>
                {loading ? (
                  <div className="empty-state loading-state">
                    <Icon name="refresh" size={24} className="spin" />
                    <p>Loading your workspace…</p>
                  </div>
                ) : !loadError && !visible.length ? (
                  <div className="empty-state">
                    <div className="empty-art">
                      <span className="empty-art-line" />
                      <span className="empty-document">
                        <Icon
                          name={
                            search || filter !== "all"
                              ? "search"
                              : view === "orders"
                                ? "orders"
                                : "quote"
                          }
                          size={32}
                        />
                      </span>
                      <span className="empty-art-badge">
                        <Icon
                          name={search || filter !== "all" ? "search" : "plus"}
                          size={16}
                        />
                      </span>
                    </div>
                    <h3>
                      {search || filter !== "all"
                        ? "No quotes found"
                        : view === "orders"
                          ? "Your first order is one accepted quote away"
                          : "Your next order starts with a quote"}
                    </h3>
                    <p>
                      {search || filter !== "all" ? (
                        "Try another REF or customer, or change your filters."
                      ) : view === "orders" ? (
                        "Accept a saved quote, then submit it to Xcelerator through Axis."
                      ) : (
                        <>
                          Create a quote, give it a REF, and keep everything
                          <br className="desktop-break" /> together from the
                          first price to the final order.
                        </>
                      )}
                    </p>
                    {search || filter !== "all" ? (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                        }}
                      >
                        Clear filters
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        onClick={() =>
                          view === "orders"
                            ? navigate("quotes")
                            : setEditor(null)
                        }
                      >
                        <Icon
                          name={view === "orders" ? "quote" : "plus"}
                          size={17}
                        />
                        {view === "orders"
                          ? "View your quotes"
                          : "Create your first quote"}
                      </button>
                    )}
                  </div>
                ) : null}
                <footer className="table-footer">
                  <span>
                    {loading
                      ? "Loading quotes…"
                      : `${visible.length} ${view === "orders" ? "order" : "quote"}${visible.length === 1 ? "" : "s"}${query || filter !== "all" ? " matching your filters" : " in your workspace"}`}
                  </span>
                  <span>
                    <Icon name="shield" size={14} />
                    Saved by REF. Ready when you are.
                  </span>
                </footer>
              </section>
              <div className="workspace-footnote">
                <Icon name="link" size={14} />
                <span>Quoting and order entry, finally working together.</span>
                <button onClick={() => navigate("integrations")}>
                  Explore your Axis connection
                  <Icon name="arrow" size={13} />
                </button>
              </div>
            </>
          ) : null}
          {view === "customers" ? (
            <section className="quotes-panel customers-panel">
              <header className="panel-heading">
                <div>
                  <h2>
                    Your customers{" "}
                    <span className="count-label">{customers.length}</span>
                  </h2>
                  <span>Built from the quotes saved in this workspace.</span>
                </div>
                <label className="search-field">
                  <Icon name="search" size={17} />
                  <input
                    placeholder="Find a customer…"
                    aria-label="Search customers"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </header>
              {customers.length ? (
                <div className="customer-grid">
                  {customers.map((c) => (
                    <button
                      className="customer-card"
                      key={`${c.accountNo}-${c.name}`}
                      onClick={() => {
                        setView("quotes");
                        setQuery(c.name);
                      }}
                    >
                      <span className="customer-avatar">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <h3>{c.name}</h3>
                      <p>{c.email || "Email not added"}</p>
                      <span>Account {c.accountNo || "not added"}</span>
                      <div>
                        <strong>
                          {c.count} quote{c.count === 1 ? "" : "s"}
                        </strong>
                        <strong>{money(c.total)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-document">
                    <Icon name="users" size={32} />
                  </span>
                  <h3>
                    {query
                      ? "No matching customers"
                      : "Put your customers on the map"}
                  </h3>
                  <p>
                    {query
                      ? "Search by name, email, or account number."
                      : "Save your first quote to start your customer directory."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setEditor(null)}
                  >
                    <Icon name="plus" size={17} />
                    New quote
                  </button>
                </div>
              )}
            </section>
          ) : null}
          {view === "integrations" ? (
            <div className="integration-layout">
              <section className="integration-card">
                <div className="integration-card-heading">
                  <span className="axis-logo">
                    a<span>xis</span>
                    <i />
                  </span>
                  <span
                    className={`axis-pill ${axis.configured ? "ready" : ""}`}
                  >
                    <span />
                    {axis.configured ? "Configured" : "Setup required"}
                  </span>
                </div>
                <div className="integration-title">
                  <span className="eyebrow">
                    XCELERATOR BY KEY SOFTWARE SYSTEMS
                  </span>
                  <h2>The next stop for your quotes.</h2>
                  <p>
                    Send accepted quotes straight to Xcelerator through Axis.
                    Keep the original REF, shipment details, and confirmed order
                    number together.
                  </p>
                </div>
                <div className="integration-features">
                  <span>
                    <Icon name="check" size={16} />
                    Original quote REF on every order
                  </span>
                  <span>
                    <Icon name="check" size={16} />
                    Customer and shipment details carried over
                  </span>
                  <span>
                    <Icon name="check" size={16} />
                    Confirmed order number saved to your quote
                  </span>
                  <span>
                    <Icon name="check" size={16} />
                    Review uncertain results before resubmitting
                  </span>
                </div>
                <div className="connection-info">
                  <Icon name="link" size={20} />
                  <div>
                    <strong>
                      {axis.configured
                        ? axis.host
                        : "Your Axis connection is not set up yet"}
                    </strong>
                    <p>
                      {axis.configured
                        ? "Credentials are configured on your server. Test authentication before submitting your first order."
                        : "Your workspace administrator needs your Xcelerator instance URL and an Axis-enabled caller login."}
                    </p>
                  </div>
                </div>
                {testResult ? (
                  <div
                    className={`notice ${testResult.ok ? "success" : "error"}`}
                    role="status"
                  >
                    {testResult.message}
                  </div>
                ) : null}
                <div className="integration-actions">
                  <button
                    className="button primary"
                    disabled={!axis.configured || testing}
                    onClick={() => void testAxis()}
                  >
                    <Icon
                      name={testing ? "refresh" : "link"}
                      size={17}
                      className={testing ? "spin" : ""}
                    />
                    {testing ? "Testing…" : "Test connection"}
                  </button>
                  <a
                    className="button secondary"
                    href={AXIS_GUIDE}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Connection guide
                    <Icon name="external" size={15} />
                  </a>
                </div>
              </section>
              <aside className="connection-steps">
                <span className="eyebrow">A SIMPLE HANDOFF</span>
                <h3>
                  One quote.
                  <br />
                  One continuous journey.
                </h3>
                <ol>
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Save your quote</strong>
                      <p>A unique REF keeps the details easy to find.</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Record acceptance</strong>
                      <p>
                        Lock in the price and shipment the customer agreed to.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Submit through Axis</strong>
                      <p>
                        Review, confirm, and save the Xcelerator order number.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="connection-note">
                  <Icon name="shield" size={20} />
                  <p>Your quotes stay saved even when Axis is unavailable.</p>
                </div>
              </aside>
            </div>
          ) : null}
        </main>
      </div>
      {selected && editor === undefined ? (
        <QuoteDetail
          key={selected.ref}
          quote={selected}
          axis={axis}
          onClose={() => select(null)}
          onEdit={(quote) => {
            select(null);
            setEditor(quote);
          }}
          onAction={action}
          onSetup={() => {
            select(null);
            navigate("integrations");
          }}
        />
      ) : null}
      {editor !== undefined ? (
        <QuoteEditor
          quote={editor}
          onClose={() => setEditor(undefined)}
          onSave={saved}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={17} />
          </span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
