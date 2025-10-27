import { Hono } from "hono";
import { showRoutes } from "hono/dev";
import { trimTrailingSlash } from "hono/trailing-slash";
import { createApp } from "honox/server";

const euterpe = createApp();

const app = new Hono();

app.use(trimTrailingSlash());

app.route("/euterpe", euterpe);

showRoutes(app);

export default app;
