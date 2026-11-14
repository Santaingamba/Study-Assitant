import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, //makes the dev server reachable from your phone on the same Wi-Fi, which we’ll use for mobile testing.
    fs: { allow: [".."] },  //lets vite serve shared/schema.js, which sits outside the client/ folder
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});