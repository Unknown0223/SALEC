import pino from "pino";
import { env } from "./env";

export const loggerOptions = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty"
        }
};

export const logger = pino({
  ...loggerOptions
});
