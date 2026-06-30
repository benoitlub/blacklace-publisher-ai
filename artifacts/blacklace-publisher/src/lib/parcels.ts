export type ParcelType = "client" | "project" | "personal" | "universe";

export interface Parcel {
  readonly id: string;
  readonly name: string;
  readonly type: ParcelType;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isDefault?: boolean;
}

export interface CreateParcelInput {
  readonly name: string;
  readonly type: ParcelType;
  readonly description?: string;
}

export interface UpdateParcelInput {
  readonly name?: string;
  readonly type?: ParcelType;
  readonly description?: string;
}

const PARCELS_STORAGE_KEY = "publisher-ai:parcels";
export const PARCELS_CHANGED_EVENT = "publisher-ai:parcels-changed";

export const DEFAULT_PARCELS: readonly Parcel[] = [
  {
    id: "yael-bali",
    name: "Yael Bali",
    type: "client",
    description: "Client local de reference pour les missions Publisher AI.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: true
  },
  {
    id: "blacklace",
    name: "Blacklace",
    type: "universe",
    description: "Univers editorial Blacklace.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: true
  },
  {
    id: "benoit-personnel",
    name: "Benoît / Personnel",
    type: "personal",
    description: "Parcelle personnelle de Benoît.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: true
  }
];

export function loadParcels(): Parcel[] {
  const raw = window.localStorage.getItem(PARCELS_STORAGE_KEY);
  if (!raw) {
    return [...DEFAULT_PARCELS];
  }

  try {
    const parsed = JSON.parse(raw);
    const savedParcels = Array.isArray(parsed) ? parsed.filter(isParcel) : [];
    return mergeWithDefaultParcels(savedParcels);
  } catch {
    return [...DEFAULT_PARCELS];
  }
}

export function saveParcels(parcels: readonly Parcel[]): void {
  window.localStorage.setItem(PARCELS_STORAGE_KEY, JSON.stringify(mergeWithDefaultParcels(parcels)));
  notifyParcelsChanged();
}

export function createParcel(input: CreateParcelInput): Parcel {
  const now = new Date().toISOString();
  const parcel: Parcel = {
    id: createParcelId(input.name),
    name: input.name.trim(),
    type: input.type,
    description: input.description?.trim() ?? "",
    createdAt: now,
    updatedAt: now
  };

  saveParcels([...loadParcels(), parcel]);
  return parcel;
}

export function updateParcel(parcelId: string, input: UpdateParcelInput): Parcel[] {
  const now = new Date().toISOString();
  const parcels = loadParcels().map((parcel) =>
    parcel.id === parcelId
      ? {
          ...parcel,
          name: input.name?.trim() ?? parcel.name,
          type: input.type ?? parcel.type,
          description: input.description?.trim() ?? parcel.description,
          updatedAt: now
        }
      : parcel
  );

  saveParcels(parcels);
  return parcels;
}

export function deleteParcel(parcelId: string): Parcel[] {
  const parcel = loadParcels().find((item) => item.id === parcelId);
  if (parcel?.isDefault) {
    return loadParcels();
  }

  const parcels = loadParcels().filter((item) => item.id !== parcelId);
  saveParcels(parcels);
  return parcels;
}

export function findParcelByName(name: string, parcels = loadParcels()): Parcel | undefined {
  const normalizedName = normalizeParcelName(name);
  return parcels.find((parcel) => normalizeParcelName(parcel.name) === normalizedName);
}

export function getParcelDisplayName(name: string, parcels = loadParcels()): string {
  return findParcelByName(name, parcels)?.name ?? "Parcelle archivee ou inconnue";
}

export function getArchivedParcelLabel(name: string, parcels = loadParcels()): string | null {
  return findParcelByName(name, parcels) ? null : name;
}

function mergeWithDefaultParcels(parcels: readonly Parcel[]): Parcel[] {
  const byId = new Map<string, Parcel>();

  for (const defaultParcel of DEFAULT_PARCELS) {
    byId.set(defaultParcel.id, defaultParcel);
  }

  for (const parcel of parcels) {
    const defaultParcel = byId.get(parcel.id);
    byId.set(parcel.id, defaultParcel ? { ...parcel, isDefault: true } : parcel);
  }

  return [...byId.values()].filter((parcel) => parcel.name.trim());
}

function createParcelId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "parcel"}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeParcelName(name: string): string {
  return name.trim().toLowerCase().replace("benoã®t", "benoît");
}

function notifyParcelsChanged(): void {
  window.dispatchEvent(new Event(PARCELS_CHANGED_EVENT));
}

function isParcel(value: unknown): value is Parcel {
  const parcel = value as Partial<Parcel>;
  return (
    typeof parcel.id === "string" &&
    typeof parcel.name === "string" &&
    isParcelType(parcel.type) &&
    typeof parcel.description === "string" &&
    typeof parcel.createdAt === "string" &&
    typeof parcel.updatedAt === "string"
  );
}

function isParcelType(value: unknown): value is ParcelType {
  return value === "client" || value === "project" || value === "personal" || value === "universe";
}
