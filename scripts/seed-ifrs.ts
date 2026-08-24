import { seedIfsChunks } from "@/server/ai/seed-ifrs";

const n = await seedIfsChunks();
console.log(`IFRS chunks seeded: ${n}`);
