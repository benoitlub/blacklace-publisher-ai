import { describe, expect, it } from "vitest";
import type { Agent } from "@workspace/db";
import { BASE_AGENT_NAMES, mergeAgentsWithFallbacks } from "../agents-fallback";

describe("mergeAgentsWithFallbacks", () => {
  it("returns the six base agents when no source agent exists", () => {
    const agents = mergeAgentsWithFallbacks([]);

    expect(agents).toHaveLength(6);
    expect(agents.map((agent) => agent.name)).toEqual(BASE_AGENT_NAMES);
  });

  it("keeps two source agents and completes the missing base agents", () => {
    const agents = mergeAgentsWithFallbacks([createAgent(1, "Feuch"), createAgent(2, "Clochette")]);

    expect(agents).toHaveLength(6);
    expect(agents.slice(0, 2).map((agent) => agent.name)).toEqual(["Feuch", "Clochette"]);
    expect(agents.map((agent) => agent.name)).toEqual(expect.arrayContaining([...BASE_AGENT_NAMES]));
  });

  it("does not duplicate the six base agents when all are provided by the source", () => {
    const sourceAgents = BASE_AGENT_NAMES.map((name, index) => createAgent(index + 1, name));
    const agents = mergeAgentsWithFallbacks(sourceAgents);

    expect(agents).toHaveLength(6);
    expect(agents.map((agent) => agent.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps eight source agents and only adds missing base agents", () => {
    const sourceAgents = [
      ...BASE_AGENT_NAMES.map((name, index) => createAgent(index + 1, name)),
      createAgent(7, "Yuki"),
      createAgent(8, "Orion")
    ];

    const agents = mergeAgentsWithFallbacks(sourceAgents);

    expect(agents).toHaveLength(8);
    expect(agents.map((agent) => agent.name)).toEqual([...BASE_AGENT_NAMES, "Yuki", "Orion"]);
  });
});

function createAgent(id: number, name: string): Agent {
  return {
    id,
    name,
    role: `${name} role`,
    tone: `${name} tone`,
    missions: null,
    limits: null,
    examplePhrases: null,
    color: null,
    avatar: null,
    isActive: true,
    createdAt: new Date("2026-01-02T00:00:00.000Z")
  };
}
