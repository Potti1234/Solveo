import * as React from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { CreditAgentApp } from "./components/credit-agent-app";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";

const rootRoute = createRootRoute({
  component: () => <CreditAgentApp />
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute])
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </React.StrictMode>
);
