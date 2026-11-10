import test from "node:test";
import assert from "node:assert/strict";
import { parseJobPosting, searchPublicJobPages, verifyJobPostings } from "../job-postings.ts";

const url = "https://www.hellowork.com/fr-fr/emplois/123.html";
const html = (extra = {}) => `<script type="application/ld&#x2B;json">${JSON.stringify({
  "@type": "JobPosting", title: "Conseiller de vente", hiringOrganization: { name: "Boutique Test" },
  jobLocation: { address: { addressLocality: "Versailles", postalCode: "78000" } },
  description: "<p>Contrat en CDI, conseil et caisse</p>", employmentType: "FULL_TIME",
  baseSalary: { currency: "EUR", value: { value: 2000, unitText: "MONTH" } },
  applicationContact: { email: "recrutement@example.org" }, ...extra,
})}</script>`;

test("extracts only source-backed contract, pay and application email", () => {
  const job = parseJobPosting(html(), url);
  assert.equal(job?.verification, "source-opened");
  assert.equal(job?.salary, "2000 EUR MONTH");
  assert.equal(job?.applicationEmail, "recrutement@example.org");
  assert.equal(job?.location, "Versailles 78000");
  assert.equal(parseJobPosting(html({ validThrough: "2000-01-01" }), url), null);
  assert.equal(parseJobPosting(html({ url: url.replace("123", "999") }), url), null);
});

test("only opens approved offer paths over HTTPS and refuses redirects", async () => {
  const calls: string[] = [];
  const result = await verifyJobPostings([
    { url: url + "?tracking=test" }, { url }, { url: "https://evil.example/fr-fr/emplois/123.html" },
    { url: "https://www.hellowork.com/fr-fr/emploi.html" },
  ], async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.redirect, "error");
    return new Response(html(), { headers: { "Content-Type": "text/html" } });
  });
  assert.deepEqual(calls, [url]);
  assert.equal(result.jobs.length, 1);
});

test("finds offer links in the relevant public directory before verifying details", async () => {
  const calls: string[] = [];
  const result = await searchPublicJobPages("Conseiller de vente Versailles", async (input) => {
    calls.push(String(input));
    const page = String(input) === url ? html() : `<a href="/fr-fr/emplois/123.html?src=search">Offre</a>
      <a href="https://evil.example/fr-fr/emplois/456.html">Lien externe</a>`;
    return new Response(page, { headers: { "Content-Type": "text/html" } });
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0], /vente-ville_versailles/);
  assert.match(calls[1], /vente-ville_rueil-malmaison/);
  assert.equal(calls[2], url);
  assert.equal(result.jobs[0].verification, "source-opened");
});
