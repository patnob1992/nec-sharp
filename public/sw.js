self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  console.log("Service worker active.");
});

self.addEventListener("fetch", () => {
  // allow normal network behavior
});
