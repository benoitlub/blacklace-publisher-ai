export type ActivityStatus =
  | "calme"
  | "observation"
  | "reflexion"
  | "preparation"
  | "experimentation"
  | "recolte"
  | "blocage"
  | "reussite";

export type Pole = "radar" | "observatoire" | "publisher" | "octopus" | "garden";

export type ActivityEvent = {
  id: string;
  pole: Pole;
  label: string;
  status?: ActivityStatus;
  at: number;
};

export type ActivityEchoProps = {
  events?: ActivityEvent[];
  status?: ActivityStatus;
  className?: string;
  emptyMessage?: string;
  onPoleClick?: (pole: Pole) => void;
};
