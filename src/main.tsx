import React from "react";
import { createRoot } from "react-dom/client";
import Duo from "./Duo";
import Archive from "./Archive";
import CloudArchive from "./CloudArchive";
import "./monochrome.css";
if (location.hash.startsWith("#duotoken=")) {
  sessionStorage.setItem(
    "duo-screen-" + new URLSearchParams(location.search).get("room"),
    decodeURIComponent(location.hash.slice(10)),
  );
  history.replaceState(null, "", location.pathname + location.search);
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("archive") ? (
    import.meta.env.VITE_CLOUD === "true" ? (
      <CloudArchive />
    ) : (
      <Archive />
    )
  ) : (
    <Duo />
  ),
);
