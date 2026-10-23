/* Keep the profile's page tabs inside the single Life Hub application shell. */
(() => {
  let embedded = false;
  try {
    embedded = new URLSearchParams(location.search).get("embed") === "1"
      && parent !== window && parent.location.origin === location.origin;
  } catch (_) { /* A cross-origin frame retains the standalone presentation. */ }
  if (!embedded) return;
  document.documentElement.dataset.profileEmbedded = "true";
  document.documentElement.dataset.lifeHubModule = "profile";
  const notifyLocation = () => parent.postMessage({
    type: "life-hub:location",
    module: "profile",
    path: location.pathname.split("/").pop() || "index.html",
    lang: new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh",
    hash: location.hash,
  }, location.origin);
  addEventListener("DOMContentLoaded", notifyLocation);
  addEventListener("hashchange", notifyLocation);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#lang-toggle")) setTimeout(notifyLocation, 0);
  });
})();
