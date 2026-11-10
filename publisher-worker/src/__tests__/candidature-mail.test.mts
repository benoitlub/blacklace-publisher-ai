import test from "node:test";
import assert from "node:assert/strict";
import { candidatureAddress, candidatureRevision, gmailCandidatureReceipt, parseCandidatureMail } from "../candidature-mail.ts";
import workerModule from "../worker.ts";
const worker = "fetch" in workerModule ? workerModule : workerModule.default;

const mail = "### Offre vérifiée par Publisher\n- Destinataire vérifié dans l’annonce : jobs@example.com\n\n### Brouillon de candidature\nObjet : Candidature\n\nBonjour, je vous présente ma candidature.";
test("reads only the approved mail text and source-verified recipient", async () => {
  assert.deepEqual(parseCandidatureMail(mail), { recipient: "jobs@example.com", subject: "Candidature", body: "Bonjour, je vous présente ma candidature." });
  assert.equal(parseCandidatureMail(mail.replace("jobs@example.com", "jobs@example.com, second@example.com")), null);
  assert.equal(parseCandidatureMail(mail.replace("- Destinataire vérifié dans l’annonce : jobs@example.com", "- Candidature via le formulaire"))?.recipient, null);
  assert.equal(parseCandidatureMail(mail.replace("Objet : ", "To: ")), null);
  assert.equal(candidatureAddress("jobs@example.com\r\nCc: other@example.com"), null);
  assert.notEqual(await candidatureRevision(mail), await candidatureRevision(mail + "!"));
});

test("requires an actual Gmail message id and rejects provider errors", () => {
  assert.equal(gmailCandidatureReceipt({ successful: true, data: { id: "example-id" } }), "example-id");
  assert.equal(gmailCandidatureReceipt({ successful: true, data: {} }), null);
  assert.equal(gmailCandidatureReceipt({ successful: false, data: { id: "example-id" } }), null);
});

test("anonymous approval is rejected before contacting Gmail", async () => {
  const response = await worker.fetch(new Request("https://publisher.example/api/garden/v1/candidatures/candidature-0123456789abcdef0123/send", {
    method: "POST",
    headers: { Authorization: "Bearer invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: "jobs@example.com", revision: await candidatureRevision(mail) }),
  }), {} as never, {} as never);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
