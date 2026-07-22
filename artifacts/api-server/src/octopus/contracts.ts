export interface UserIntent {
  text: string;
  [key: string]: unknown;
}

export interface MissionDefinition {
  id: string;
  version: string;
  description: string;
  requiredCapabilities: string[];
  workflowId: string;
}

export interface WorkflowStepDefinition {
  moduleId: string;
  input: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  description: string;
  steps: WorkflowStepDefinition[];
}
