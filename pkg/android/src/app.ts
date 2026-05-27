import { mountAndroid } from "./client.ts";

const root = document.querySelector<HTMLElement>("#android-root");

if (!root) {
  throw new Error("Android root is missing");
}

mountAndroid(root, {
  h264Path: "/android/h264",
  streamPath: "/android/stream",
  transport: "auto",
  title: "Android",
});
