import test from "node:test";
import assert from "node:assert/strict";
import { parseJobPosting, verifyJobPostings } from "../job-postings.ts";

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
