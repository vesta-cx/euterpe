import { Hono } from "hono";
import { showRoutes } from "hono/dev";
import { createApp } from "honox/server";

const euterpe = createApp();

const app = new Hono();

app.route('/euterpe', euterpe);

showRoutes(app);

export default app;
