export type AutonomyTaskKind = "sell" | "improve" | "automate" | "observe" | "compare" | "greenhouse" | "review" | "report";
export type AutonomyTaskStatus = "planned" | "ready" | "done" | "blocked";

export interface PublisherAutonomyTask {
  id: string;
  kind: AutonomyTaskKind;
  title: string;
  detail: string;
  suggestedTime: "matin" | "midi" | "soir" | "nuit";
  status: AutonomyTaskStatus;
  confidence: number;
  targetHref?: string;
  reducesHumanWork: boolean;
}

export interface PublisherAutonomyPlan {
  id: string;
  generatedAt: string;
  dateKey: string;
  mode: "local" | "survivor";
  survivalIndex: number;
  summary: string;
  tasks: PublisherAutonomyTask[];
  dailySignal: string;
}
