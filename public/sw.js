self.addEventListener("install", (event) => {
  console.log("Service worker installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service worker active.");
});

self.addEventListener("fetch", (event) => {
  // Allow all requests to go to network normally
});
