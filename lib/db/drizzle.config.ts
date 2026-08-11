import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",  // ← chemin relatif, pas path.join
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});