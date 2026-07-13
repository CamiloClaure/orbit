import type { FastifyInstance } from "fastify";
import { surveyCampaigns, enpsSnapshots, surveyTemplates } from "../../db/schema/index.js";
import { requirePermission } from "../../plugins/rbac.js";

// Read-only this phase (PLAN.md): campaigns/eNPS/templates have no
// create/edit routes — creating a survey campaign is out of scope.
export default async function engagementRoutes(app: FastifyInstance) {
  app.get("/engagement/campaigns", { preHandler: requirePermission("Encuestas", "Ver") }, async (request) => {
    return request.db.select().from(surveyCampaigns);
  });

  app.get("/engagement/enps", { preHandler: requirePermission("Encuestas", "Ver") }, async (request) => {
    return request.db.select().from(enpsSnapshots);
  });

  app.get("/engagement/templates", { preHandler: requirePermission("Encuestas", "Ver") }, async (request) => {
    return request.db.select().from(surveyTemplates);
  });
}
