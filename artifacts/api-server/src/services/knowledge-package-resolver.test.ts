import { describe, expect, it, vi } from "vitest";
import { isVerifiedYaebaliSource } from "./knowledge-package-resolver";

// Source classification must not initialize the production database.
vi.mock("./knowledge-digestion", () => ({ digestObservation: vi.fn() }));

const source = (title: string, content: string, universe = "yael-prequalification-de-prospects") => ({
  id: title, title, content, universe, tags: [universe], isMock: false,
});

describe("Yaebali source isolation in API-server", () => {
  it("accepts an actual mortgage brokerage brief", () => {
    expect(isVerifiedYaebaliSource(source("Yael Bali — Préqualification de prospects immobiliers", "Courtage en financement immobilier et assurance emprunteur."))).toBe(true);
  });
  it("rejects a 420 Dice Reel even if tagged Yaebali and mentioning mortgage", () => {
    expect(isVerifiedYaebaliSource(source("Publisher · Reel 420 Dice Game", "Yaébali courtage immobilier. Jeu 420 Dice et gages."))).toBe(false);
  });
  it("rejects unrelated generic prospecting", () => {
    expect(isVerifiedYaebaliSource(source("Prospection générique", "Scoring de prospects et réseaux sociaux.", ""))).toBe(false);
  });
  it("rejects mock documents", () => {
    expect(isVerifiedYaebaliSource({ ...source("Yael Bali", "Financement immobilier"), isMock: true })).toBe(false);
  });
});
