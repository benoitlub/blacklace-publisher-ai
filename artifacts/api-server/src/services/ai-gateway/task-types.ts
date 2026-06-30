export type AiTaskType =
  | "text.post"
  | "text.thread"
  | "text.summary"
  | "image.prompt"
  | "video.prompt"
  | "video.storyboard"
  | "translation"
  | "metadata.tags";

export const AI_TASK_TYPES: readonly AiTaskType[] = [
  "text.post",
  "text.thread",
  "text.summary",
  "image.prompt",
  "video.prompt",
  "video.storyboard",
  "translation",
  "metadata.tags"
];

export function isAiTaskType(value: unknown): value is AiTaskType {
  return typeof value === "string" && AI_TASK_TYPES.includes(value as AiTaskType);
}
