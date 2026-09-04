import { auth } from "@/server/auth/auth-server";

export const { GET, POST } = auth.handler();
