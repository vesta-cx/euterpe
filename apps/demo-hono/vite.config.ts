import build from "@hono/vite-build/cloudflare-workers";
import adapter from "@hono/vite-dev-server/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import honox from "honox/vite";
import path from "path";
import { defineConfig } from "vite";

const common = {
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./app"),
            $: path.resolve(__dirname, "./app/lib"),
            "#": path.resolve(__dirname, "./app/routes"),
            "~": path.resolve(__dirname, "./app/components"),
            "?": path.resolve(__dirname, "./app/islands"),
        },
    },
};

export default defineConfig(({ mode }) => {
    if (mode === "client") {
        return {
            build: {
                rollupOptions: {
                    input: ["./app/client.ts"],
                },
                manifest: true,
                emptyOutDir: false,
            },
        };
    } else {
        return {
            ...common,
            ssr: {
                external: ["react", "react-dom"],
            },
            plugins: [honox(), build()],
        };
    }
});

// export default defineConfig(({ mode }) => {
//     return {
//         plugins: [
//             honox({
//                 devServer: { adapter },
//                 client: { input: ["/app/client.ts", "/app/style.css"] },
//             }),
//             tailwindcss(),
//             build(),
//         ],
//     };
// });
