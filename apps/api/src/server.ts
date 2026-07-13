import Fastify from "fastify";
import cookie from "@fastify/cookie";
import tenantContextPlugin from "./plugins/tenant-context.js";
import authRoutes from "./modules/auth/routes.js";
import employeesRoutes from "./modules/employees/routes.js";
import orgchartRoutes from "./modules/orgchart/routes.js";
import leaveRoutes from "./modules/leave/routes.js";
import payrollRoutes from "./modules/payroll/routes.js";
import dashboardRoutes from "./modules/dashboard/routes.js";
import reportsRoutes from "./modules/reports/routes.js";
import okrsRoutes from "./modules/okrs/routes.js";
import engagementRoutes from "./modules/engagement/routes.js";
import vozRoutes from "./modules/voz/routes.js";
import notificationsRoutes from "./modules/notifications/routes.js";
import rolesRoutes from "./modules/roles/routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(cookie);
  app.register(tenantContextPlugin);
  app.register(authRoutes);
  app.register(employeesRoutes);
  app.register(orgchartRoutes);
  app.register(leaveRoutes);
  app.register(payrollRoutes);
  app.register(dashboardRoutes);
  app.register(reportsRoutes);
  app.register(okrsRoutes);
  app.register(engagementRoutes);
  app.register(vozRoutes);
  app.register(notificationsRoutes);
  app.register(rolesRoutes);

  return app;
}

if (process.env.VITEST !== "true") {
  const port = Number(process.env.PORT ?? 3001);
  buildApp()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
