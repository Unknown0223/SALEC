import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { env } from "../config/env";

export const jwtPlugin = fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
});
