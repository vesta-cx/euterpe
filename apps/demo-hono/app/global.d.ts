import type {} from "hono";

import "@hono/react-renderer";

declare module "hono" {
    interface Env {
        Variables: {};
        Bindings: {};
    }
}

declare module "@hono/react-renderer" {
    interface Props {
        title?: string;
    }
}
